/**
 * Typed settings persisted in `browser.storage.local`. The popup's toggles and the options
 * page's backup import write these; the content script reads them on boot.
 *
 * *Not* a feature-owned data store (docs/adr/0012) — only on/off flags — but it borrows their
 * plumbing from `@/lib/store-kit`, so both kinds of key reach `storage.local` one way.
 */
import { isRecord, loadStore, saveStore, watchStore } from '@/lib/store-kit';
import type { FeatureId } from '@/features/registry';

export interface Settings {
  /**
   * Feature id → enabled; missing ids fall back to `DEFAULT_SETTINGS`. `string`-keyed rather
   * than `FeatureId`, since storage and imported backups can carry an id this build never
   * heard of — `DEFAULT_SETTINGS` is the half pinned to the union.
   */
  features: Record<string, boolean>;
}

/**
 * Shipped features default to `true`; stubs to `false` so they stay invisible until
 * implemented. Typed `Record<FeatureId, boolean>` so forgetting an entry is a compile error
 * rather than a feature that ships permanently switched off with nothing reported anywhere.
 */
export const DEFAULT_SETTINGS: { features: Record<FeatureId, boolean> } = {
  features: {
    'exit-guard': true,
    highlight: true,
    'bbcode-presets': true,
    'color-grab': true,
    'editor-shortcuts': true,
    'emoji-picker': true,
    'composer-layout': true,
  },
};

export const SETTINGS_KEY = 'settings';

/**
 * Merge whatever is in storage — or an imported file — over `DEFAULT_SETTINGS`; never
 * throws. Non-boolean entries are dropped, since a bad one would flip `bootFeatures`'s
 * truthiness check in a surprising way.
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

/** Plain object only: a Svelte `$state` Proxy is not cloneable and Firefox throws. */
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

/** Returns an unsubscriber. */
export function watchSettings(onChange: (settings: Settings) => void): () => void {
  return watchStore(SETTINGS_KEY, normalizeSettings, onChange);
}

let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Flip one feature's flag, preserving the others. A read-modify-write, and the popup can fire
 * two of them milliseconds apart: run concurrently they read the same "before" state and the
 * second write discards the first one's change, so every call queues behind the last.
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
