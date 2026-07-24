import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import {
  HIGHLIGHTS_KEY,
  HIGHLIGHTS_SCHEMA_VERSION,
  emptyHighlightStore,
  normalizeHighlightStore,
  loadHighlightStore,
  saveHighlightStore,
  watchHighlightStore,
  toPlainHighlightStore,
  allHighlights,
  highlightsForPosts,
  countHighlights,
  countForTopic,
  addHighlight,
  deleteHighlight,
  deleteHighlights,
  clearTopic,
  clearAll,
  type HighlightStore,
  type Highlight,
} from './highlights';

/**
 * The store's job is to never paint the wrong text and never lose a save. These
 * tests pin the invariants: un-anchorable records are dropped on read, ranges
 * stay well-formed, and a mutation never mutates its input.
 */

const hl = (over: Partial<Highlight> = {}): Highlight => ({
  id: 'h1',
  topicId: '3042',
  postId: '201244',
  start: 0,
  end: 4,
  quote: 'text',
  color: '#ffe86b',
  createdAt: 1,
  ...over,
});

const storeOf = (highlights: Highlight[]): HighlightStore => ({
  version: HIGHLIGHTS_SCHEMA_VERSION,
  highlights: Object.fromEntries(highlights.map((h) => [h.id, h])),
});

describe('normalizeHighlightStore', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'nope'],
    ['an array', []],
    ['a number', 7],
  ])('returns an empty store for %s', (_label, input) => {
    expect(normalizeHighlightStore(input)).toEqual(emptyHighlightStore());
  });

  it('keeps a well-formed highlight and stamps the current version', () => {
    const raw = { version: 1, highlights: { h1: hl() } };
    const store = normalizeHighlightStore(raw);
    expect(store.version).toBe(HIGHLIGHTS_SCHEMA_VERSION);
    expect(store.highlights.h1).toEqual(hl());
  });

  it('drops records missing postId, quote, or colour', () => {
    const raw = {
      highlights: {
        noPost: hl({ id: 'noPost', postId: '' }),
        noQuote: hl({ id: 'noQuote', quote: '' }),
        noColor: hl({ id: 'noColor', color: '' }),
        ok: hl({ id: 'ok' }),
      },
    };
    const store = normalizeHighlightStore(raw);
    expect(Object.keys(store.highlights)).toEqual(['ok']);
  });

  it('drops degenerate and non-finite ranges', () => {
    const raw = {
      highlights: {
        empty: hl({ id: 'empty', start: 5, end: 5 }),
        inverted: hl({ id: 'inverted', start: 9, end: 3 }),
        negative: hl({ id: 'negative', start: -1, end: 4 }),
        nan: hl({ id: 'nan', start: Number.NaN, end: 4 }),
        ok: hl({ id: 'ok', start: 2, end: 8 }),
      },
    };
    const store = normalizeHighlightStore(raw as unknown);
    expect(Object.keys(store.highlights)).toEqual(['ok']);
  });

  it('defaults a missing topicId and createdAt without dropping the record', () => {
    const raw = {
      highlights: {
        h1: { postId: '1', start: 0, end: 3, quote: 'abc', color: '#fff' },
      },
    };
    const store = normalizeHighlightStore(raw);
    expect(store.highlights.h1.topicId).toBe('');
    expect(store.highlights.h1.createdAt).toBe(0);
  });

  it('truncates fractional offsets to integers', () => {
    const raw = { highlights: { h1: hl({ start: 1.9, end: 4.9 }) } };
    const store = normalizeHighlightStore(raw as unknown);
    expect(store.highlights.h1.start).toBe(1);
    expect(store.highlights.h1.end).toBe(4);
  });
});

describe('mutations are pure', () => {
  it('addHighlight returns a new store and leaves the input untouched', () => {
    const before = emptyHighlightStore();
    const after = addHighlight(before, {
      id: 'h1',
      topicId: '3042',
      postId: '201244',
      start: 0,
      end: 4,
      quote: 'text',
      color: '#ffe86b',
      createdAt: 1,
    });
    expect(before.highlights).toEqual({});
    expect(after.highlights.h1.quote).toBe('text');
    expect(after).not.toBe(before);
  });

  it('addHighlight refuses a degenerate range', () => {
    const before = emptyHighlightStore();
    const after = addHighlight(before, {
      id: 'h1',
      topicId: '',
      postId: '1',
      start: 3,
      end: 3,
      quote: 'x',
      color: '#fff',
    });
    expect(after).toBe(before);
  });

  it('deleteHighlight removes just the one', () => {
    const store = storeOf([hl({ id: 'a' }), hl({ id: 'b' })]);
    const after = deleteHighlight(store, 'a');
    expect(Object.keys(after.highlights)).toEqual(['b']);
    expect(Object.keys(store.highlights)).toEqual(['a', 'b']);
  });

  it('deleteHighlight is a no-op (same reference) for an unknown id', () => {
    const store = storeOf([hl({ id: 'a' })]);
    expect(deleteHighlight(store, 'zzz')).toBe(store);
  });
});

describe('deleteHighlights (the eraser)', () => {
  const base = storeOf([
    hl({ id: 'a' }),
    hl({ id: 'b' }),
    hl({ id: 'c' }),
  ]);

  it('removes exactly the given ids', () => {
    const after = deleteHighlights(base, ['a', 'c']);
    expect(Object.keys(after.highlights)).toEqual(['b']);
    expect(Object.keys(base.highlights)).toEqual(['a', 'b', 'c']); // input untouched
  });

  it('ignores unknown ids', () => {
    const after = deleteHighlights(base, ['a', 'zzz']);
    expect(Object.keys(after.highlights)).toEqual(['b', 'c']);
  });

  it('is a no-op (same reference) when nothing matches', () => {
    expect(deleteHighlights(base, ['zzz'])).toBe(base);
    expect(deleteHighlights(base, [])).toBe(base);
  });
});

describe('clearTopic / clearAll', () => {
  const base = storeOf([
    hl({ id: 'a', topicId: '3042' }),
    hl({ id: 'b', topicId: '3042' }),
    hl({ id: 'c', topicId: '9999' }),
  ]);

  it('clearTopic keeps only other discussions', () => {
    const after = clearTopic(base, '3042');
    expect(Object.keys(after.highlights)).toEqual(['c']);
  });

  it('clearTopic with "" is a no-op', () => {
    expect(clearTopic(base, '')).toBe(base);
  });

  it('clearTopic for an absent topic is a no-op (same reference)', () => {
    expect(clearTopic(base, 'nope')).toBe(base);
  });

  it('clearAll empties everything', () => {
    expect(countHighlights(clearAll(base))).toBe(0);
  });

  it('clearAll on an empty store is a no-op', () => {
    const empty = emptyHighlightStore();
    expect(clearAll(empty)).toBe(empty);
  });
});

describe('derived views', () => {
  const base = storeOf([
    hl({ id: 'a', postId: '1', createdAt: 30 }),
    hl({ id: 'b', postId: '2', createdAt: 10 }),
    hl({ id: 'c', postId: '1', createdAt: 20 }),
  ]);

  it('allHighlights orders oldest-first', () => {
    expect(allHighlights(base).map((h) => h.id)).toEqual(['b', 'c', 'a']);
  });

  it('highlightsForPosts buckets by post and skips unwanted posts', () => {
    const byPost = highlightsForPosts(base, ['1']);
    expect([...byPost.keys()]).toEqual(['1']);
    expect(byPost.get('1')!.map((h) => h.id)).toEqual(['c', 'a']); // oldest-first
  });

  it('countForTopic counts one discussion', () => {
    const store = storeOf([
      hl({ id: 'a', topicId: '3042' }),
      hl({ id: 'b', topicId: '3042' }),
      hl({ id: 'c', topicId: '1' }),
    ]);
    expect(countForTopic(store, '3042')).toBe(2);
    expect(countForTopic(store, '')).toBe(0);
  });
});

describe('persistence round-trips through browser.storage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('saves a plain object and loads it back', async () => {
    const store = addHighlight(emptyHighlightStore(), {
      id: 'h1',
      topicId: '3042',
      postId: '201244',
      start: 0,
      end: 4,
      quote: 'text',
      color: '#ffe86b',
      createdAt: 1,
    });
    await saveHighlightStore(store);
    const loaded = await loadHighlightStore();
    expect(loaded.highlights.h1).toEqual(store.highlights.h1);
  });

  it('toPlainHighlightStore drops unknown bolted-on fields', () => {
    const dirty = {
      version: 1,
      highlights: {
        h1: { ...hl(), sneaky: 'nope' } as unknown as Highlight,
      },
    };
    const plain = toPlainHighlightStore(dirty);
    expect('sneaky' in plain.highlights.h1).toBe(false);
  });

  it('watchHighlightStore reports normalized changes', async () => {
    const seen: HighlightStore[] = [];
    const unwatch = watchHighlightStore((s) => seen.push(s));
    await saveHighlightStore(storeOf([hl()]));
    unwatch();
    expect(seen.at(-1)?.highlights.h1.quote).toBe('text');
  });
});
