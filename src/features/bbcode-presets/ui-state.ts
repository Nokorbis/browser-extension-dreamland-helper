/**
 * The floating panel's collapsed/expanded state, deliberately under a **separate storage
 * key** from the preset library: it is ephemeral view state, not content, so an
 * Export/Import stays clean and a corrupt UI preference can't take the presets down with it.
 */
import { browser } from '#imports';
import { isRecord } from '@/lib/store-kit';

const KEY = 'bbcodePresetsUi';

export interface PresetsUiState {
  /** Whether the floating panel is expanded. Collapsed by default. */
  panelExpanded: boolean;
}

const DEFAULT_UI_STATE: PresetsUiState = {
  panelExpanded: false,
};

/**
 * Repair whatever is under the key, like every other store (docs/adr/0012). This used to be
 * a bare `as Partial<PresetsUiState>` spread over the defaults, asserting a shape nothing
 * had checked, so a stored `panelExpanded: "no"` reached the UI as a truthy string.
 */
export function normalizeUiState(raw: unknown): PresetsUiState {
  const stored = isRecord(raw) ? raw : {};
  return {
    panelExpanded:
      typeof stored.panelExpanded === 'boolean'
        ? stored.panelExpanded
        : DEFAULT_UI_STATE.panelExpanded,
  };
}

export async function loadUiState(): Promise<PresetsUiState> {
  return normalizeUiState((await browser.storage.local.get(KEY))[KEY]);
}

export async function saveUiState(state: PresetsUiState): Promise<void> {
  // Rebuilt field by field: a Svelte `$state` Proxy is not cloneable and Firefox throws.
  await browser.storage.local.set({
    [KEY]: { panelExpanded: state.panelExpanded },
  });
}
