/**
 * Passages a writer has marked inside a post's message body, kept across reloads and shared
 * between viewtopic and the reply composer's topic review. Follows the store idiom in
 * `@/lib/store-kit` (docs/adr/0012).
 *
 * A highlight is anchored by **numeric post id** plus a character range into the post's
 * `.content` text — phpBB encodes that id identically in `#p<id>` and `#pr<id>`, so a
 * highlight follows its post between the two pages for free. `quote` is the highlighted
 * text, kept for validation and re-anchoring when the offsets don't line up (see
 * `src/features/highlight/anchor.ts`).
 */
import { warn } from '@/lib/log';
import {
  isRecord,
  loadStore,
  newId,
  readInt,
  readString,
  runMigrations,
  saveStore,
  watchStore,
} from '@/lib/store-kit';

export const HIGHLIGHTS_KEY = 'highlights';

/** Bump only alongside a migration in `MIGRATIONS`. */
export const HIGHLIGHTS_SCHEMA_VERSION = 1;

export interface Highlight {
  id: string;
  /** Topic id from `?t=`; `''` when unknown. Enables thread-scoped clearing. */
  topicId: string;
  /** Numeric post id — the key shared between viewtopic and the topic review. */
  postId: string;
  /** Character offset of the range start into the post `.content` text. */
  start: number;
  /** Character offset of the range end (exclusive). Always `> start`. */
  end: number;
  /** The highlighted text, for validation and re-anchoring on load. */
  quote: string;
  /** Canonical `#rrggbb`. */
  color: string;
  /** Creation time (ms). Sort key, so paint order is stable. */
  createdAt: number;
}

export interface HighlightStore {
  version: number;
  highlights: Record<string, Highlight>;
}

/** A factory, not a shared constant, so callers can't alias it. */
export function emptyHighlightStore(): HighlightStore {
  return { version: HIGHLIGHTS_SCHEMA_VERSION, highlights: {} };
}

// Re-export so highlight callers mint ids straight from this module.
export { newId };

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/** Keyed by the version being upgraded *from*. Empty at v1. */
const MIGRATIONS: Record<number, (store: HighlightStore) => HighlightStore> = {};

function readCreatedAt(value: unknown): number {
  const n = readInt(value);
  return n === null || n < 0 ? 0 : n;
}

/**
 * Parse and repair whatever is in storage; never throws. A highlight that can't be anchored
 * — no post id, no quote, or a degenerate range — is *dropped*: unlike a misfiled preset it
 * has nowhere to fall back to and would paint nothing, or the wrong text.
 */
export function normalizeHighlightStore(raw: unknown): HighlightStore {
  if (!isRecord(raw)) return emptyHighlightStore();

  const store = emptyHighlightStore();
  let dropped = 0;

  if (isRecord(raw.highlights)) {
    for (const [id, value] of Object.entries(raw.highlights)) {
      // An empty id would collide with itself in `deleteHighlight` and in
      // `allHighlights`' tie-break, so drop it like any other unusable record.
      if (id === '' || !isRecord(value)) {
        dropped += 1;
        continue;
      }
      const postId = readString(value.postId);
      const quote = readString(value.quote);
      const start = readInt(value.start);
      const end = readInt(value.end);
      const color = readString(value.color);
      if (
        postId === '' ||
        quote === '' ||
        color === '' ||
        start === null ||
        end === null ||
        start < 0 ||
        end <= start
      ) {
        dropped += 1;
        continue;
      }
      store.highlights[id] = {
        id,
        topicId: readString(value.topicId),
        postId,
        start,
        end,
        quote,
        color,
        createdAt: readCreatedAt(value.createdAt),
      };
    }
  }

  // --- migrations ---
  const migrated = runMigrations(
    store,
    readInt(raw.version),
    HIGHLIGHTS_SCHEMA_VERSION,
    MIGRATIONS,
  );
  migrated.version = HIGHLIGHTS_SCHEMA_VERSION;

  if (dropped > 0) {
    warn(`highlight store repaired: dropped ${dropped} un-anchorable highlight(s)`);
  }
  return migrated;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function loadHighlightStore(): Promise<HighlightStore> {
  return loadStore(HIGHLIGHTS_KEY, normalizeHighlightStore);
}

/** Plain objects only: a Svelte `$state` Proxy is not cloneable and Firefox throws. */
export function toPlainHighlightStore(store: HighlightStore): HighlightStore {
  const highlights: Record<string, Highlight> = {};
  for (const h of Object.values(store.highlights)) {
    highlights[h.id] = {
      id: h.id,
      topicId: h.topicId,
      postId: h.postId,
      start: h.start,
      end: h.end,
      quote: h.quote,
      color: h.color,
      createdAt: h.createdAt,
    };
  }
  return { version: store.version, highlights };
}

export async function saveHighlightStore(store: HighlightStore): Promise<void> {
  await saveStore(HIGHLIGHTS_KEY, toPlainHighlightStore(store));
}

/** Returns an unsubscriber; wire it into the feature's cleanup. */
export function watchHighlightStore(
  onChange: (store: HighlightStore) => void,
): () => void {
  return watchStore(HIGHLIGHTS_KEY, normalizeHighlightStore, onChange);
}

// ---------------------------------------------------------------------------
// Derived views (pure)
// ---------------------------------------------------------------------------

/** Oldest first — the order they paint in. */
export function allHighlights(store: HighlightStore): Highlight[] {
  return Object.values(store.highlights).sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
}

/** Highlights whose post is among `postIds`, grouped by post id. */
export function highlightsForPosts(
  store: HighlightStore,
  postIds: Iterable<string>,
): Map<string, Highlight[]> {
  const wanted = new Set(postIds);
  const byPost = new Map<string, Highlight[]>();
  for (const h of allHighlights(store)) {
    if (!wanted.has(h.postId)) continue;
    const bucket = byPost.get(h.postId);
    if (bucket === undefined) byPost.set(h.postId, [h]);
    else bucket.push(h);
  }
  return byPost;
}

export function countHighlights(store: HighlightStore): number {
  return Object.keys(store.highlights).length;
}

export function countForTopic(store: HighlightStore, topicId: string): number {
  if (topicId === '') return 0;
  return Object.values(store.highlights).filter((h) => h.topicId === topicId).length;
}

// ---------------------------------------------------------------------------
// Mutations (pure: store in, new store out)
// ---------------------------------------------------------------------------

function clone(store: HighlightStore): HighlightStore {
  return { version: store.version, highlights: { ...store.highlights } };
}

/** Callers mint the id (via `newId`) and pass it in, so this stays deterministic. */
export function addHighlight(
  store: HighlightStore,
  highlight: {
    id: string;
    topicId: string;
    postId: string;
    start: number;
    end: number;
    quote: string;
    color: string;
    createdAt?: number;
  },
): HighlightStore {
  if (highlight.end <= highlight.start) return store;
  const next = clone(store);
  next.highlights[highlight.id] = {
    id: highlight.id,
    topicId: highlight.topicId,
    postId: highlight.postId,
    start: highlight.start,
    end: highlight.end,
    quote: highlight.quote,
    color: highlight.color,
    createdAt: highlight.createdAt ?? Date.now(),
  };
  return next;
}

export function deleteHighlight(store: HighlightStore, id: string): HighlightStore {
  if (store.highlights[id] === undefined) return store;
  const next = clone(store);
  delete next.highlights[id];
  return next;
}

/**
 * The eraser. The feature picks the ids by comparing the selection against *resolved DOM
 * ranges*, not stored offsets, since a post's `.content` offsets can differ between
 * viewtopic and the topic review. Keeping this a plain id delete is what allows that.
 */
export function deleteHighlights(
  store: HighlightStore,
  ids: Iterable<string>,
): HighlightStore {
  const wanted = new Set(ids);
  const present = Object.keys(store.highlights).filter((id) => wanted.has(id));
  if (present.length === 0) return store;
  const next = clone(store);
  for (const id of present) delete next.highlights[id];
  return next;
}

/** Clear every highlight in one discussion. `''` clears nothing. */
export function clearTopic(store: HighlightStore, topicId: string): HighlightStore {
  if (topicId === '') return store;
  const survivors = Object.values(store.highlights).filter((h) => h.topicId !== topicId);
  if (survivors.length === Object.keys(store.highlights).length) return store;
  const next = emptyHighlightStore();
  next.version = store.version;
  for (const h of survivors) next.highlights[h.id] = h;
  return next;
}

/** Clear every highlight everywhere. */
export function clearAll(store: HighlightStore): HighlightStore {
  if (Object.keys(store.highlights).length === 0) return store;
  const next = emptyHighlightStore();
  next.version = store.version;
  return next;
}
