/**
 * Reactive state for the prompt dialog — the form a preset carrying `{PROMPT:label}` fields
 * puts up before insertion. Same seam as `menu-state.svelte.ts`; see there for why the runes
 * need their own module and why this is one `$state` object.
 *
 * ⚠ Never hand this to `browser.storage` — `$state` deep-proxies it and a `Proxy` is not
 * structured-cloneable. Nothing does: answers are deliberately not persisted, so a preset
 * always opens with blank fields (docs/adr/0026).
 */

export interface PromptState {
  /** Whether the dialog is showing. */
  open: boolean;
  /** The forum's dark mode, pushed in from `setup()` — see `MenuState.dark`. */
  dark: boolean;
  /** The preset being filled in, for the dialog's heading. */
  presetName: string;
  /**
   * In order, exactly as `collectPrompts` returned them — already de-duplicated there, so
   * one field per label however many times the body mentions it.
   */
  labels: string[];
  /** What has been typed so far, keyed by label — the shape `renderPreset` wants. */
  answers: Record<string, string>;
}

export function createPromptState(): PromptState {
  // ⚠ Assigned to a local, not returned directly: `$state` is only valid as a variable
  // declaration's initialiser (`state_invalid_placement`), and `pnpm check` does not
  // catch it — `pnpm build` is what fails.
  const state: PromptState = $state({
    open: false,
    dark: false,
    presetName: '',
    labels: [],
    answers: {},
  });
  return state;
}
