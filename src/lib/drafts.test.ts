import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  DRAFTS_SCHEMA_VERSION,
  MAX_DRAFTS,
  MAX_DRAFT_AGE_MS,
  allDrafts,
  clearAllDrafts,
  countDrafts,
  deleteDraft,
  draftKey,
  dropSubmitted,
  emptyDraftStore,
  findDraft,
  loadDraftStore,
  markSubmitted,
  normalizeDraftStore,
  pruneDrafts,
  putDraft,
  saveDraftStore,
  toPlainDraftStore,
  watchDraftStore,
  type Draft,
  type DraftStore,
} from './drafts';
import type { ComposerParams } from './phpbb';

/**
 * The store's job is to never offer one thread's draft on another, never lose a
 * save, and never grow without bound. These tests pin those three: the keying
 * contract mode by mode, retention on both axes, and mutation purity.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const draft = (over: Partial<Draft> = {}): Draft => ({
  id: 'reply:3071',
  topicId: '3071',
  subject: 'Re: L’Atrocité',
  body: 'Le vent se leva.',
  savedAt: NOW,
  submittedAt: 0,
  ...over,
});

const storeOf = (drafts: Draft[]): DraftStore => ({
  version: DRAFTS_SCHEMA_VERSION,
  drafts: Object.fromEntries(drafts.map((d) => [d.id, d])),
});

const params = (over: Partial<ComposerParams> = {}): ComposerParams => ({
  mode: null,
  t: null,
  f: null,
  p: null,
  ...over,
});

describe('draftKey', () => {
  it('keys a reply on its topic', () => {
    expect(draftKey(params({ mode: 'reply', t: '3071' }))).toBe('reply:3071');
  });

  it('normalises quote to the same key as reply, so one draft serves both routes', () => {
    // A `mode=quote&p=…` URL has no `t`; readComposerParams fills it from the page.
    expect(draftKey(params({ mode: 'quote', t: '3071', p: '201246' }))).toBe(
      'reply:3071',
    );
  });

  it('keys a new topic on its forum and an edit on its post', () => {
    expect(draftKey(params({ mode: 'post', f: '68' }))).toBe('new:68');
    expect(draftKey(params({ mode: 'edit', p: '201246' }))).toBe('edit:201246');
  });

  it('keys an edit on the post even when a topic id is also present', () => {
    expect(draftKey(params({ mode: 'edit', t: '3071', p: '201246' }))).toBe(
      'edit:201246',
    );
  });

  it.each([
    ['no mode at all', params()],
    ['an unrelated mode', params({ mode: 'smilies', f: '68' })],
    ['a reply with no topic', params({ mode: 'reply' })],
    ['a new topic with no forum', params({ mode: 'post' })],
    ['an edit with no post', params({ mode: 'edit', t: '3071' })],
  ])('returns null for %s', (_label, input) => {
    expect(draftKey(input)).toBeNull();
  });
});

describe('normalizeDraftStore', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'nope'],
    ['an array', []],
    ['a number', 7],
  ])('returns an empty store for %s', (_label, input) => {
    expect(normalizeDraftStore(input)).toEqual(emptyDraftStore());
  });

  it('keeps a well-formed draft and stamps the current version', () => {
    const raw = { version: 1, drafts: { 'reply:3071': draft() } };
    const store = normalizeDraftStore(raw);
    expect(store.version).toBe(DRAFTS_SCHEMA_VERSION);
    expect(store.drafts['reply:3071']).toEqual(draft());
  });

  it('drops a record with neither subject nor body — there is nothing to restore', () => {
    const raw = {
      drafts: {
        empty: draft({ id: 'empty', subject: '', body: '' }),
        subjectOnly: draft({ id: 'subjectOnly', body: '' }),
        bodyOnly: draft({ id: 'bodyOnly', subject: '' }),
      },
    };
    const store = normalizeDraftStore(raw);
    expect(Object.keys(store.drafts).sort()).toEqual(['bodyOnly', 'subjectOnly']);
  });

  it('drops a record under an empty key, which could never match a draftKey', () => {
    const store = normalizeDraftStore({ drafts: { '': draft({ id: '' }) } });
    expect(countDrafts(store)).toBe(0);
  });

  it('re-derives id from the object key rather than trusting the payload', () => {
    const raw = { drafts: { 'reply:9': draft({ id: 'lies' }) } };
    expect(normalizeDraftStore(raw).drafts['reply:9'].id).toBe('reply:9');
  });

  it('repairs unusable timestamps to 0 rather than dropping the draft', () => {
    const raw = {
      drafts: {
        'reply:1': { subject: '', body: 'x', savedAt: 'soon', submittedAt: -5 },
      },
    };
    const repaired = normalizeDraftStore(raw).drafts['reply:1'];
    expect(repaired.savedAt).toBe(0);
    expect(repaired.submittedAt).toBe(0);
  });

  it('does not carry a version from a newer build', () => {
    expect(normalizeDraftStore({ version: 99, drafts: {} }).version).toBe(
      DRAFTS_SCHEMA_VERSION,
    );
  });

  it('is deterministic — it never consults the clock', () => {
    const raw = { drafts: { 'reply:1': draft({ id: 'reply:1', savedAt: 1 }) } };
    expect(normalizeDraftStore(raw)).toEqual(normalizeDraftStore(raw));
    // An ancient draft survives normalization; only pruneDrafts may drop it.
    expect(countDrafts(normalizeDraftStore(raw))).toBe(1);
  });
});

describe('pruneDrafts', () => {
  const many = (count: number) =>
    storeOf(
      Array.from({ length: count }, (_unused, i) =>
        draft({ id: `reply:${i}`, savedAt: NOW - i * 1000 }),
      ),
    );

  it('keeps the MAX_DRAFTS most recent and evicts the rest', () => {
    const store = many(MAX_DRAFTS + 3);
    const pruned = pruneDrafts(store, NOW);
    expect(countDrafts(pruned)).toBe(MAX_DRAFTS);
    // The three oldest went, the newest stayed.
    expect(findDraft(pruned, 'reply:0')).not.toBeNull();
    expect(findDraft(pruned, `reply:${MAX_DRAFTS}`)).toBeNull();
  });

  it('evicts anything older than MAX_DRAFT_AGE_MS', () => {
    const store = storeOf([
      draft({ id: 'fresh', savedAt: NOW - 14 * DAY }),
      draft({ id: 'stale', savedAt: NOW - 16 * DAY }),
    ]);
    const pruned = pruneDrafts(store, NOW);
    expect(Object.keys(pruned.drafts)).toEqual(['fresh']);
  });

  it('keeps a draft sitting exactly on the age boundary', () => {
    const store = storeOf([draft({ id: 'edge', savedAt: NOW - MAX_DRAFT_AGE_MS })]);
    expect(pruneDrafts(store, NOW)).toBe(store);
  });

  it('returns the same reference when nothing is dropped', () => {
    const store = many(3);
    expect(pruneDrafts(store, NOW)).toBe(store);
  });

  it('never mutates its input', () => {
    const store = many(MAX_DRAFTS + 1);
    pruneDrafts(store, NOW);
    expect(countDrafts(store)).toBe(MAX_DRAFTS + 1);
  });

  it('takes `now` as a parameter, so the same store prunes differently over time', () => {
    const store = storeOf([draft({ id: 'x', savedAt: NOW })]);
    expect(pruneDrafts(store, NOW)).toBe(store);
    expect(countDrafts(pruneDrafts(store, NOW + 30 * DAY))).toBe(0);
  });
});

describe('mutations are pure', () => {
  it('putDraft inserts, stamps savedAt, and clears any submit mark', () => {
    const store = storeOf([draft({ submittedAt: NOW - 1000 })]);
    const next = putDraft(
      store,
      { id: 'reply:3071', topicId: '3071', subject: 'S', body: 'B' },
      NOW,
    );
    expect(next).not.toBe(store);
    expect(next.drafts['reply:3071']).toEqual({
      id: 'reply:3071',
      topicId: '3071',
      subject: 'S',
      body: 'B',
      savedAt: NOW,
      submittedAt: 0,
    });
    // Input untouched.
    expect(store.drafts['reply:3071'].body).toBe('Le vent se leva.');
  });

  it('putDraft applies retention as it writes', () => {
    const store = storeOf(
      Array.from({ length: MAX_DRAFTS }, (_unused, i) =>
        draft({ id: `reply:${i}`, savedAt: NOW - (i + 1) * 1000 }),
      ),
    );
    const next = putDraft(
      store,
      { id: 'reply:new', topicId: '1', subject: '', body: 'B' },
      NOW,
    );
    expect(countDrafts(next)).toBe(MAX_DRAFTS);
    expect(findDraft(next, 'reply:new')).not.toBeNull();
  });

  it('putDraft refuses an empty key', () => {
    const store = emptyDraftStore();
    expect(putDraft(store, { id: '', topicId: '', subject: 'S', body: 'B' }, NOW)).toBe(
      store,
    );
  });

  it('deleteDraft removes one and no-ops on an unknown key', () => {
    const store = storeOf([draft(), draft({ id: 'new:68' })]);
    expect(Object.keys(deleteDraft(store, 'reply:3071').drafts)).toEqual(['new:68']);
    expect(deleteDraft(store, 'edit:1')).toBe(store);
    expect(countDrafts(store)).toBe(2);
  });

  it('clearAllDrafts empties a store and no-ops on an empty one', () => {
    const store = storeOf([draft()]);
    expect(countDrafts(clearAllDrafts(store))).toBe(0);
    const already = emptyDraftStore();
    expect(clearAllDrafts(already)).toBe(already);
  });
});

describe('the submit mark', () => {
  it('markSubmitted stamps rather than deletes — a bounced post must keep its text', () => {
    const store = storeOf([draft()]);
    const next = markSubmitted(store, 'reply:3071', NOW);
    expect(next.drafts['reply:3071'].submittedAt).toBe(NOW);
    expect(next.drafts['reply:3071'].body).toBe('Le vent se leva.');
    expect(store.drafts['reply:3071'].submittedAt).toBe(0);
  });

  it('markSubmitted no-ops on an unknown key', () => {
    const store = storeOf([draft()]);
    expect(markSubmitted(store, 'new:68', NOW)).toBe(store);
  });

  it('dropSubmitted clears every mark, whatever topic it belonged to', () => {
    // After posting a *new topic* the browser lands on a `t` the `new:<f>` key
    // never knew, so matching by topic would strand that draft forever.
    const store = storeOf([
      draft({ id: 'reply:3071', submittedAt: NOW }),
      draft({ id: 'new:68', topicId: '', submittedAt: NOW }),
      draft({ id: 'edit:9', submittedAt: 0 }),
    ]);
    expect(Object.keys(dropSubmitted(store).drafts)).toEqual(['edit:9']);
  });

  it('dropSubmitted returns the same reference when nothing is marked', () => {
    const store = storeOf([draft()]);
    expect(dropSubmitted(store)).toBe(store);
  });
});

describe('derived views', () => {
  it('allDrafts sorts most recently saved first', () => {
    const store = storeOf([
      draft({ id: 'a', savedAt: 100 }),
      draft({ id: 'b', savedAt: 300 }),
      draft({ id: 'c', savedAt: 200 }),
    ]);
    expect(allDrafts(store).map((d) => d.id)).toEqual(['b', 'c', 'a']);
  });

  it('allDrafts breaks a savedAt tie on id, so the order is stable', () => {
    const store = storeOf([
      draft({ id: 'b', savedAt: 100 }),
      draft({ id: 'a', savedAt: 100 }),
    ]);
    expect(allDrafts(store).map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('findDraft returns null rather than undefined for a missing key', () => {
    expect(findDraft(emptyDraftStore(), 'reply:1')).toBeNull();
  });
});

describe('persistence round-trips through browser.storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('saves a plain object and loads it back', async () => {
    const store = storeOf([draft()]);
    await saveDraftStore(store);
    const loaded = await loadDraftStore();
    expect(loaded.drafts['reply:3071']).toEqual(store.drafts['reply:3071']);
  });

  it('loads an empty store when the key was never written', async () => {
    expect(await loadDraftStore()).toEqual(emptyDraftStore());
  });

  it('toPlainDraftStore drops unknown bolted-on fields', () => {
    const dirty: DraftStore = {
      version: DRAFTS_SCHEMA_VERSION,
      drafts: { 'reply:3071': { ...draft(), sneaky: 'nope' } as unknown as Draft },
    };
    const plain = toPlainDraftStore(dirty);
    expect('sneaky' in plain.drafts['reply:3071']).toBe(false);
  });

  it('watchDraftStore reports normalized changes', async () => {
    const seen: DraftStore[] = [];
    const unwatch = watchDraftStore((store) => seen.push(store));
    await saveDraftStore(storeOf([draft({ body: 'nouveau' })]));
    unwatch();
    expect(seen.at(-1)?.drafts['reply:3071'].body).toBe('nouveau');
  });
});
