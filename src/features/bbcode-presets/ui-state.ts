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
 * Repair whatever is under the key, like every other store here (ADR 0012).
 *
 * This used to be a bare `as Partial<PresetsUiState>` spread over the defaults, which
 * asserted a shape nothing had checked: a stored `panelExpanded: "no"` reached the UI as a
 * truthy string. Small stakes — it is one boolean — but it was the only unvalidated read
 * in the codebase, and the idiom is the point.
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
  // Rebuilt field by field rather than passed through: Firefox structured-clones
  // values into storage and refuses a Proxy, which is what a UI framework's
  // reactive state hands you. See `toPlainStore` in @/lib/presets.
  await browser.storage.local.set({
    [KEY]: { panelExpanded: state.panelExpanded },
  });
}
