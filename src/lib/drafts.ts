/**
 * The draft store: a snapshot of what the writer has in the composer, kept so a
 * crash, a killed tab, a reflex click on "Leave" or a submit phpBB refuses can't
 * take a 45-minute roleplay post with it.
 *
 * This is the third *data* a feature owns, after `@/lib/presets` and
 * `@/lib/highlights`, and it follows their idiom (docs/adr/0012-feature-owned-data-stores.md):
 * its own `browser.storage.local` key, the `version` carried **inside** the
 * payload, a **flat** id-keyed record, a repair pass on every read, and pure
 * `store → store` mutations.
 *
 * ⚠ One deliberate departure from the other two: **a draft's id is not minted**.
 * It is the composer key — `reply:3071`, `new:68`, `edit:201246` — because
 * identity here has to be *derivable*: a composer reopening on the same thread
 * must find its own draft without having been told which one it is. So there is
 * no `newId` re-export, and `draftKey` below is the whole of that contract.
 *
 * `draftKey` lives here, beside the store, rather than in the feature that uses
 * it: a store's **identity function belongs with the store**, so the rule that
 * mints a key and the repair pass that validates one cannot drift apart, and
 * `drafts.test.ts` exercises both together. It is not a leftover from when the
 * autosave feature was separate — don't move it into `exit-guard/`.
 */
import { warn } from '@/lib/log';
import type { ComposerParams } from '@/lib/phpbb';
import {
  isRecord,
  loadStore,
  readInt,
  readString,
  runMigrations,
  saveStore,
  watchStore,
} from '@/lib/store-kit';

/** Storage key. Separate from `settings`, `bbcodePresets` and `highlights` — see docs/adr/0012. */
export const DRAFTS_KEY = 'drafts';

/** Bump only alongside a migration in `MIGRATIONS`. */
export const DRAFTS_SCHEMA_VERSION = 1;

/**
 * Retention. Roleplay posts are long and `storage.local` has a quota, so the
 * store is capped on both axes: the most recent `MAX_DRAFTS`, and nothing older
 * than `MAX_DRAFT_AGE_MS`. Pruning happens on **write and on boot**, never
 * inside `normalizeDraftStore` — see the note there.
 */
export const MAX_DRAFTS = 10;
export const MAX_DRAFT_AGE_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

export interface Draft {
  /** The composer key, e.g. `reply:3071`. Also this record's key in the store. */
  id: string;
  /** Topic id when it was known, `''` otherwise. Display and diagnostics only. */
  topicId: string;
  /** The `#subject` field's text. May legitimately be `''` (a reply keeps phpBB's). */
  subject: string;
  /** The `#message` textarea's text — the thing actually worth saving. */
  body: string;
  /** Last capture (ms). Sort key for retention and the "il y a…" label. */
  savedAt: number;
  /**
   * When `exit-guard` last drove a genuine post with this draft in the composer,
   * or `0`. **Not** proof the post landed: the reachability preflight only shows
   * the server answered a HEAD, and a stale `form_token` still bounces. The mark
   * is consumed by `dropSubmitted` once a topic page loads, which is the real
   * success signal.
   */
  submittedAt: number;
}

export interface DraftStore {
  version: number;
  drafts: Record<string, Draft>;
}

/** A fresh empty store. A factory, not a shared constant, so callers can't alias it. */
export function emptyDraftStore(): DraftStore {
  return { version: DRAFTS_SCHEMA_VERSION, drafts: {} };
}

// ---------------------------------------------------------------------------
// Keying
// ---------------------------------------------------------------------------

/**
 * The draft key for a composer, or `null` when this page has no draftable
 * composer — which the feature reads as "do nothing here".
 *
 * Pure, so the whole keying contract is testable without a browser. Getting it
 * wrong shows up as one thread's draft offered on another, which is why it is
 * exercised mode by mode in `drafts.test.ts`.
 *
 * `quote` normalises to `reply`: both routes produce a *new post in the same
 * thread*, so a writer who starts via "Citer" and comes back via "Répondre"
 * must find the same draft. `edit` keys on the post id instead — editing an
 * existing post is a different document from replying to its thread.
 *
 * A mode we don't recognise (phpBB's `smilies`, `delete`, …) and a mode missing
 * its id component both yield `null` rather than a partial key, because a key
 * like `reply:` would collide across every thread on the forum.
 */
export function draftKey(params: ComposerParams): string | null {
  const { mode, t, f, p } = params;
  switch (mode) {
    case 'reply':
    case 'quote':
      return t === null ? null : `reply:${t}`;
    case 'post':
      return f === null ? null : `new:${f}`;
    case 'edit':
      return p === null ? null : `edit:${p}`;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Version-to-version upgrades, keyed by the version being upgraded *from*.
 * Empty at v1; the plumbing exists so the first migration is a one-line change.
 */
const MIGRATIONS: Record<number, (store: DraftStore) => DraftStore> = {};

function readSavedAt(value: unknown): number {
  const n = readInt(value);
  return n === null || n < 0 ? 0 : n;
}

/**
 * Parse and repair whatever is in storage.
 *
 * Runs on **every** load and every change notification, like the other stores'
 * repair passes. A draft with nothing to restore — no key, or an empty subject
 * *and* an empty body — is dropped rather than kept: unlike a misfiled preset it
 * has no sensible fallback, and offering an empty draft would be worse than
 * offering none. It never throws.
 *
 * ⚠ Deliberately **deterministic** — no `Date.now()` here. Age-based retention
 * needs the clock, so it lives in `pruneDrafts`, which takes `now` as a
 * parameter and is called from the write path. Reading the clock inside a
 * function that runs on every storage notification would make the repair pass
 * untestable and its results depend on when you looked.
 */
export function normalizeDraftStore(raw: unknown): DraftStore {
  if (!isRecord(raw)) return emptyDraftStore();

  const store = emptyDraftStore();
  let dropped = 0;

  if (isRecord(raw.drafts)) {
    for (const [id, value] of Object.entries(raw.drafts)) {
      // The id comes from the object key, so an empty one is unusable: it would
      // collide with itself in `deleteDraft` and could never match a `draftKey`.
      if (id === '' || !isRecord(value)) {
        dropped += 1;
        continue;
      }
      const subject = readString(value.subject);
      const body = readString(value.body);
      if (subject === '' && body === '') {
        dropped += 1;
        continue;
      }
      store.drafts[id] = {
        id,
        topicId: readString(value.topicId),
        subject,
        body,
        savedAt: readSavedAt(value.savedAt),
        submittedAt: readSavedAt(value.submittedAt),
      };
    }
  }

  // --- migrations ---
  const migrated = runMigrations(
    store,
    readInt(raw.version),
    DRAFTS_SCHEMA_VERSION,
    MIGRATIONS,
  );
  migrated.version = DRAFTS_SCHEMA_VERSION;

  if (dropped > 0) {
    warn(`draft store repaired: dropped ${dropped} empty draft(s)`);
  }
  return migrated;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function loadDraftStore(): Promise<DraftStore> {
  return loadStore(DRAFTS_KEY, normalizeDraftStore);
}

/**
 * Rebuild the store as plain objects holding only known fields.
 *
 * **This is what makes saving work on Firefox** — the popup panel holds a store
 * in Svelte `$state`, which deep-proxies it, and a `Proxy` is not
 * structured-cloneable (Firefox throws `DataCloneError` on the way into
 * `storage.local`; Chrome silently succeeds). Same rationale as
 * `toPlainHighlightStore` in `@/lib/highlights`.
 */
export function toPlainDraftStore(store: DraftStore): DraftStore {
  const drafts: Record<string, Draft> = {};
  for (const d of Object.values(store.drafts)) {
    drafts[d.id] = {
      id: d.id,
      topicId: d.topicId,
      subject: d.subject,
      body: d.body,
      savedAt: d.savedAt,
      submittedAt: d.submittedAt,
    };
  }
  return { version: store.version, drafts };
}

export async function saveDraftStore(store: DraftStore): Promise<void> {
  await saveStore(DRAFTS_KEY, toPlainDraftStore(store));
}

/**
 * Observe the store from any context — content script or popup. Returns an
 * unsubscriber; wire it into the feature's cleanup. The area filter and the
 * choice of the top-level `onChanged` live in `watchStore`.
 */
export function watchDraftStore(onChange: (store: DraftStore) => void): () => void {
  return watchStore(DRAFTS_KEY, normalizeDraftStore, onChange);
}

// ---------------------------------------------------------------------------
// Derived views (pure)
// ---------------------------------------------------------------------------

/** Every draft, most recently saved first — retention order, and the popup's order. */
export function allDrafts(store: DraftStore): Draft[] {
  return Object.values(store.drafts).sort(
    (a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id),
  );
}

export function countDrafts(store: DraftStore): number {
  return Object.keys(store.drafts).length;
}

export function findDraft(store: DraftStore, key: string): Draft | null {
  return store.drafts[key] ?? null;
}

// ---------------------------------------------------------------------------
// Mutations (pure: store in, new store out)
// ---------------------------------------------------------------------------

function clone(store: DraftStore): DraftStore {
  return { version: store.version, drafts: { ...store.drafts } };
}

/** Build a store from a list of survivors, preserving the loaded version. */
function keepOnly(store: DraftStore, survivors: Draft[]): DraftStore {
  const next = emptyDraftStore();
  next.version = store.version;
  for (const d of survivors) next.drafts[d.id] = d;
  return next;
}

export interface PruneOptions {
  max?: number;
  maxAgeMs?: number;
}

/**
 * Apply retention: keep the `max` most recently saved drafts, then drop anything
 * saved more than `maxAgeMs` ago.
 *
 * `now` is a parameter rather than a `Date.now()` call so this stays pure and
 * unit-testable — the same reason the mutations take an id instead of minting
 * one. Returns the **same reference** when nothing was dropped, which is what
 * lets callers skip a pointless write.
 */
export function pruneDrafts(
  store: DraftStore,
  now: number,
  { max = MAX_DRAFTS, maxAgeMs = MAX_DRAFT_AGE_MS }: PruneOptions = {},
): DraftStore {
  const cutoff = now - maxAgeMs;
  const survivors = allDrafts(store)
    .slice(0, max)
    .filter((d) => d.savedAt >= cutoff);
  if (survivors.length === countDrafts(store)) return store;
  return keepOnly(store, survivors);
}

/**
 * Insert or replace the draft under `draft.id`, then apply retention.
 *
 * Writing always clears `submittedAt`: the writer is back in this composer
 * typing, so whatever the last submit did, this text has not been posted.
 */
export function putDraft(
  store: DraftStore,
  draft: { id: string; topicId: string; subject: string; body: string },
  now: number,
): DraftStore {
  if (draft.id === '') return store;
  const next = clone(store);
  next.drafts[draft.id] = {
    id: draft.id,
    topicId: draft.topicId,
    subject: draft.subject,
    body: draft.body,
    savedAt: now,
    submittedAt: 0,
  };
  return pruneDrafts(next, now);
}

export function deleteDraft(store: DraftStore, key: string): DraftStore {
  if (store.drafts[key] === undefined) return store;
  const next = clone(store);
  delete next.drafts[key];
  return next;
}

export function clearAllDrafts(store: DraftStore): DraftStore {
  if (countDrafts(store) === 0) return store;
  return keepOnly(store, []);
}

/**
 * Stamp a draft as "handed to a submit we believe went out".
 *
 * Deliberately not a delete: `exit-guard` calls this the moment it re-fires the
 * form, which is *before* phpBB has accepted anything. An expired `form_token`
 * — the loss this whole feature exists for — bounces at exactly that point, and
 * a draft deleted here would be gone for good.
 */
export function markSubmitted(store: DraftStore, key: string, now: number): DraftStore {
  const draft = store.drafts[key];
  if (draft === undefined) return store;
  const next = clone(store);
  next.drafts[key] = { ...draft, submittedAt: now };
  return next;
}

/**
 * Drop every draft carrying a submit mark — called when a topic page loads,
 * which is the point at which the post demonstrably went through.
 *
 * It clears *all* marks, not just the current topic's: after posting a **new
 * topic** the browser lands on a `t` the `new:<f>` key never knew about, so
 * matching by topic would leave that draft behind forever. A mark only exists
 * between a submit and the next topic view, so there is nothing else to catch.
 */
export function dropSubmitted(store: DraftStore): DraftStore {
  const survivors = Object.values(store.drafts).filter((d) => d.submittedAt === 0);
  if (survivors.length === countDrafts(store)) return store;
  return keepOnly(store, survivors);
}

// ---------------------------------------------------------------------------
// Async conveniences
// ---------------------------------------------------------------------------

/**
 * The two whole-store operations the feature performs from a page event, each
 * packaging the load/mutate/save dance so a caller in the middle of handling a
 * submit or a page load doesn't have to spell it out.
 *
 * Both **skip the write entirely** when the pure mutation was a no-op — no draft
 * under that key, or nothing marked — so calling them speculatively costs one
 * read and nothing else.
 */
export async function markDraftSubmitted(key: string): Promise<void> {
  const store = await loadDraftStore();
  const next = markSubmitted(store, key, Date.now());
  if (next === store) return;
  await saveDraftStore(next);
}

export async function dropSubmittedDrafts(): Promise<void> {
  const store = await loadDraftStore();
  const next = dropSubmitted(store);
  if (next === store) return;
  await saveDraftStore(next);
}
