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

export interface Settings {
  /** Feature id → enabled. Missing ids fall back to DEFAULT_SETTINGS. */
  features: Record<string, boolean>;
}

/**
 * Defaults. Only shipped, working features default to `true`; features that are
 * still stubs default to `false` so they stay invisible until implemented.
 */
export const DEFAULT_SETTINGS: Settings = {
  features: {
    'exit-guard': true,
    highlight: true,
    'bbcode-presets': true,
    'color-grab': true,
    'editor-shortcuts': true,
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
  const rawFeatures = stored !== undefined && isRecord(stored.features) ? stored.features : {};
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

export async function setFeatureEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  const settings = await loadSettings();
  settings.features[id] = enabled;
  await saveSettings(settings);
}
