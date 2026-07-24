/**
 * Where the floating panel's collapsed/expanded state lives.
 *
 * Deliberately a **separate storage key** from the preset library. This is
 * ephemeral view state, not content: keeping it out of `bbcodePresets` means an
 * Export/Import of the preset library stays clean, and a corrupt UI preference
 * can never take the presets down with it.
 * See docs/adr/0012-feature-owned-data-stores.md.
 */
import { browser } from '#imports';

const KEY = 'bbcodePresetsUi';

export interface PresetsUiState {
  /** Whether the floating panel is expanded. Collapsed by default. */
  panelExpanded: boolean;
}

const DEFAULT_UI_STATE: PresetsUiState = {
  panelExpanded: false,
};

export async function loadUiState(): Promise<PresetsUiState> {
  const stored = (await browser.storage.local.get(KEY))[KEY] as
    | Partial<PresetsUiState>
    | undefined;
  return { ...DEFAULT_UI_STATE, ...stored };
}

export async function saveUiState(state: PresetsUiState): Promise<void> {
  // Rebuilt field by field rather than passed through: Firefox structured-clones
  // values into storage and refuses a Proxy, which is what a UI framework's
  // reactive state hands you. See `toPlainStore` in @/lib/presets.
  await browser.storage.local.set({
    [KEY]: { panelExpanded: state.panelExpanded },
  });
}
