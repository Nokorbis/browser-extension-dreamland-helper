/**
 * Shared plumbing for feature-owned data stores.
 *
 * `@/lib/presets` and `@/lib/highlights` each own a `browser.storage.local` key
 * and follow one idiom (docs/adr/0012-feature-owned-data-stores.md): the
 * `version` lives **inside** the payload, the shape is a flat id-keyed record, a
 * repair pass runs on every read, and mutations are pure (`store → store`). The
 * identical *plumbing* that idiom needs — the primitive field readers, the id
 * minter, and the load/save/watch calls — lives here so the two modules share it
 * instead of copying it. Each module still owns its key, its shape, its
 * `normalize`, its own explicit `toPlain…`, and its mutations.
 */
import { browser } from '#imports';

/** Narrow to a plain object — excludes `null` and arrays. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read a string field, falling back when it is absent or the wrong type. */
export function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Read a finite integer field, or `null` when it is absent or unusable. */
export function readInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

/**
 * Mint an id for a new record.
 *
 * `crypto.randomUUID()` is gated on a secure context. Extension pages always
 * qualify, and in practice only the options page ever creates records, so the
 * fallback is insurance rather than a load-bearing path. It is not
 * cryptographically strong — irrelevant for a local record id.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Load and repair a store from its `storage.local` key. */
export async function loadStore<T>(
  key: string,
  normalize: (raw: unknown) => T,
): Promise<T> {
  const stored = (await browser.storage.local.get(key))[key];
  return normalize(stored);
}

/**
 * Persist an **already-plain** store. Callers pass the result of their own
 * `toPlain…` rebuild: a Svelte `$state` value is a `Proxy`, which is not
 * structured-cloneable, so Firefox throws `DataCloneError` on the way into
 * `storage.local` otherwise (docs/adr/0012, CLAUDE.md).
 */
export async function saveStore<T>(key: string, plain: T): Promise<void> {
  await browser.storage.local.set({ [key]: plain });
}

/**
 * Observe a store from any context — content script, popup, options page.
 * Returns an unsubscriber; wire it into the feature's cleanup.
 *
 * Uses the top-level `browser.storage.onChanged` filtered on the area rather
 * than `browser.storage.local.onChanged`, whose support is patchy on Firefox MV2.
 */
export function watchStore<T>(
  key: string,
  normalize: (raw: unknown) => T,
  onChange: (store: T) => void,
): () => void {
  const listener = (
    changes: Record<string, { newValue?: unknown }>,
    areaName: string,
  ) => {
    if (areaName !== 'local') return;
    const change = changes[key];
    if (change === undefined) return;
    onChange(normalize(change.newValue));
  };

  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
