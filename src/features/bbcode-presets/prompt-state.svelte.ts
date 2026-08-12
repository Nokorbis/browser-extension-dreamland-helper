/**
 * Reactive state for the prompt dialog — the small form a preset carrying
 * `{PROMPT:label}` fields puts up before it is inserted.
 *
 * Same seam as `menu-state.svelte.ts`: `setup()` writes to it, the Svelte
 * component inside the shadow root reads from it. See that file for why the
 * runes live in their own `.svelte.ts` module and why this is a single `$state`
 * object rather than a rune per field.
 *
 * ⚠ Never hand this to `browser.storage` — `$state` deep-proxies it and a
 * `Proxy` is not structured-cloneable, which Firefox rejects with
 * `DataCloneError`. Nothing does: answers are deliberately not persisted, so a
 * preset always opens with blank fields (docs/adr/0026).
 */

export interface PromptState {
  /** Whether the dialog is showing. */
  open: boolean;
  /** The forum's dark mode, pushed in from `setup()` — see `MenuState.dark`. */
  dark: boolean;
  /** The preset being filled in, for the dialog's heading. */
  presetName: string;
  /**
   * The questions to ask, in order, exactly as `collectPrompts` returned them.
   * Already de-duplicated there, so one field per label however many times the
   * body mentions it.
   */
  labels: string[];
  /** What has been typed so far, keyed by label — the shape `renderPreset` wants. */
  answers: Record<string, string>;
}

export function createPromptState(): PromptState {
  // Assigned to a local and then returned, not returned directly: `$state` is only
  // valid as a variable declaration's initialiser (`state_invalid_placement`). Note
  // `pnpm check` does not catch that — `pnpm build` is what fails.
  const state: PromptState = $state({
    open: false,
    dark: false,
    presetName: '',
    labels: [],
    answers: {},
  });
  return state;
}
