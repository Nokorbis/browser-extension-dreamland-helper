/**
 * Shared plumbing for feature-owned data stores (docs/adr/0012).
 *
 * **The idiom, stated once here rather than per store:** one `browser.storage.local` key, the
 * `version` **inside** the payload, a flat id-keyed shape, a repair pass on every read, and
 * pure mutations (`store → store`) returning the same reference on a no-op so callers can
 * skip a write. A store still owns its key, shape, `normalize`, `toPlain…` and mutations;
 * only the plumbing below is shared.
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
 * Mint an id for a new record. `crypto.randomUUID()` needs a secure context, which extension
 * pages always are, so the fallback is insurance — not strong, which a local id needn't be.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Step a store up to the current schema version.
 *
 * Shared because the inlined copies had drifted: one re-read `version` off the store and
 * trusted each migration to bump it, so a migration that forgot looped forever inside a
 * `normalize…` that runs on every read. Here the counter is local and always advances, and
 * `from` is floored to a non-negative integer, so a corrupt `version: -3` replays from 0
 * rather than being stamped as current. Exported so a test can drive it with a synthetic map.
 */
export function runMigrations<T>(
  store: T,
  from: number | null,
  to: number,
  migrations: Record<number, (store: T) => T>,
): T {
  let version = from === null || from < 0 ? 0 : Math.trunc(from);
  let migrated = store;
  while (version < to) {
    const migrate = migrations[version];
    if (migrate === undefined) break;
    migrated = migrate(migrated);
    version += 1;
  }
  return migrated;
}

export async function loadStore<T>(
  key: string,
  normalize: (raw: unknown) => T,
): Promise<T> {
  const stored = (await browser.storage.local.get(key))[key];
  return normalize(stored);
}

/**
 * Persist an **already-plain** store: callers pass the result of their own `toPlain…`,
 * because a Svelte `$state` value is a `Proxy` and Firefox throws `DataCloneError` on the
 * way into `storage.local`. See docs/adr/0012.
 */
export async function saveStore<T>(key: string, plain: T): Promise<void> {
  await browser.storage.local.set({ [key]: plain });
}

/**
 * Observe a store from any context. Returns an unsubscriber; wire it into the feature's
 * cleanup. Uses the top-level `onChanged` filtered on the area rather than
 * `storage.local.onChanged`, whose support is patchy on Firefox MV2.
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
