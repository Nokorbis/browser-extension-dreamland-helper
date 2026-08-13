/**
 * Typed settings persisted in `browser.storage.local`.
 *
 * The popup's toggles and the options page's backup import write these; the
 * content script reads them on boot to decide which features to enable.
 *
 * This is *not* a feature-owned data store (docs/adr/0012) — it holds only
 * on/off flags and predates them — but it borrows their plumbing from
 * `@/lib/store-kit` (`loadStore`/`saveStore`/`watchStore`) so both kinds of key
 * reach `storage.local` through one code path.
 */
import { isRecord, loadStore, saveStore, watchStore } from '@/lib/store-kit';
import type { FeatureId } from '@/features/registry';

export interface Settings {
  /**
   * Feature id → enabled. Missing ids fall back to DEFAULT_SETTINGS.
   *
   * Deliberately `string`-keyed and not `FeatureId`: this is also the shape read back
   * from `storage.local` and from an imported backup file, both of which can legitimately
   * carry an id this build has never heard of (one from a newer version, or one since
   * removed). `DEFAULT_SETTINGS` below is the half that *is* pinned to the union.
   */
  features: Record<string, boolean>;
}

/**
 * Defaults. Only shipped, working features default to `true`; features that are
 * still stubs default to `false` so they stay invisible until implemented.
 *
 * Typed `Record<FeatureId, boolean>`, which makes this exhaustive by construction: adding
 * a feature to `ALL_FEATURES` and forgetting this line is now a compile error rather than
 * a feature that ships permanently switched off with nothing reported anywhere. That is
 * step 4 of CLAUDE.md's "Adding a feature" checklist, enforced.
 */
export const DEFAULT_SETTINGS: { features: Record<FeatureId, boolean> } = {
  features: {
    'exit-guard': true,
    highlight: true,
    'bbcode-presets': true,
    'color-grab': true,
    'editor-shortcuts': true,
    'emoji-picker': true,
    'quote-selection': true,
    'composer-layout': true,
  },
};

/** Storage key. Separate from `bbcodePresets` — see docs/adr/0012. */
export const SETTINGS_KEY = 'settings';

/**
 * Merge whatever is in storage — or an imported file — over `DEFAULT_SETTINGS`.
 * Non-boolean feature entries are dropped rather than kept, since a bad entry
 * here would otherwise flip `bootFeatures`'s truthiness check in a surprising
 * way. Never throws.
 */
export function normalizeSettings(raw: unknown): Settings {
  const stored = isRecord(raw) ? raw : undefined;
  const rawFeatures =
    stored !== undefined && isRecord(stored.features) ? stored.features : {};
  const features: Record<string, boolean> = { ...DEFAULT_SETTINGS.features };
  for (const [id, value] of Object.entries(rawFeatures)) {
    if (typeof value === 'boolean') features[id] = value;
  }
  return { features };
}

/**
 * Rebuild the settings as a plain object holding only known fields.
 *
 * The counterpart of `toPlainStore` in `@/lib/presets`, and it exists for the
 * same reason: a caller may hand us settings that Svelte 5's `$state` has
 * deep-proxied, and a `Proxy` is *not* structured-cloneable. Firefox clones on
 * the way into `storage.local` and throws `DataCloneError`; Chrome serialises by
 * reading properties and never notices. Without this, importing a backup would
 * silently persist nothing on Firefox only. See docs/adr/0012 and CLAUDE.md.
 */
export function toPlainSettings(settings: Settings): Settings {
  const features: Record<string, boolean> = {};
  for (const [id, enabled] of Object.entries(settings.features)) {
    features[id] = enabled;
  }
  return { features };
}

export async function loadSettings(): Promise<Settings> {
  return loadStore(SETTINGS_KEY, normalizeSettings);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await saveStore(SETTINGS_KEY, toPlainSettings(settings));
}

/**
 * Observe the settings from any context. Returns an unsubscriber. Mirrors
 * `watchPresetStore` — the area filter and the choice of the top-level
 * `onChanged` live in `watchStore`.
 */
export function watchSettings(onChange: (settings: Settings) => void): () => void {
  return watchStore(SETTINGS_KEY, normalizeSettings, onChange);
}

/**
 * Serialises the read-modify-write below. A plain `let`, not exported: the queue is an
 * implementation detail of `setFeatureEnabled`.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Flip one feature's flag, preserving the others.
 *
 * The body is a read-modify-write, and the popup can fire two of them milliseconds apart
 * — two checkboxes clicked in a row. Run concurrently they both read the same "before"
 * state, and whichever write lands second silently discards the first one's change. So
 * every call queues behind the last: each read then sees the previous write's result.
 */
export async function setFeatureEnabled(id: string, enabled: boolean): Promise<void> {
  const run = writeQueue.then(async () => {
    const settings = await loadSettings();
    settings.features[id] = enabled;
    await saveSettings(settings);
  });
  // The queue swallows this link's rejection so one failed write can't poison every
  // later one; the caller still sees it, because that's the promise we hand back.
  writeQueue = run.catch(() => undefined);
  return run;
}
