/**
 * The seam between the feature's plain-TypeScript setup and the Svelte components it mounts:
 * the trigger lives in the page's light DOM on ordinary listeners, the menu is a component
 * in a shadow root, `setup()` writes here and the component re-renders. Runes only work in
 * `.svelte` / `.svelte.ts` modules, hence a file of its own.
 *
 * One `$state` object rather than a rune per field behind accessors: `$state` deep-proxies,
 * so plain property access is already reactive both ways.
 *
 * ⚠ That proxy is why this must never reach `browser.storage` — a `Proxy` is not
 * structured-cloneable and Firefox throws `DataCloneError`. Nothing here does: `index.ts`
 * only ever *reads* the store into this object.
 */
import { emptyPresetStore, type PresetStore } from '@/lib/presets';

export interface MenuState {
  /** The preset library, kept fresh by `watchPresetStore`. */
  store: PresetStore;
  /** Whether the dropdown is showing. */
  open: boolean;
  /**
   * Whether the *forum* is in dark mode, from `html.dark`. Pushed in from `setup()`
   * because CSS inside a shadow root cannot read the host page's classes portably.
   * See `isDarkTheme` in `@/lib/phpbb`.
   */
  dark: boolean;
}

export function createMenuState(): MenuState {
  // ⚠ Assigned to a local, not returned directly: `$state` is only valid as a variable
  // declaration's initialiser (`state_invalid_placement`), and `pnpm check` does not
  // catch it — `pnpm build` is what fails.
  const state: MenuState = $state({
    store: emptyPresetStore(),
    open: false,
    dark: false,
  });
  return state;
}
