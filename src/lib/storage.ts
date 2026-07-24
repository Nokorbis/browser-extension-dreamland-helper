/**
 * Typed, versioned settings persisted in `browser.storage.local`.
 *
 * The popup writes these; the content script reads them on boot to decide which
 * features to enable. Both browsers share the same `browser.*` API (WXT injects
 * the webextension-polyfill), so this file is fully cross-browser.
 */
import { browser } from '#imports';

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

const KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get(KEY))[KEY] as
    | Partial<Settings>
    | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    features: { ...DEFAULT_SETTINGS.features, ...stored?.features },
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [KEY]: settings });
}

export async function setFeatureEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  const settings = await loadSettings();
  settings.features[id] = enabled;
  await saveSettings(settings);
}
