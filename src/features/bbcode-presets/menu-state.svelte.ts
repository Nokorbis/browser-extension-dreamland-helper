/**
 * Reactive state shared between the feature's plain-TypeScript setup code and
 * the Svelte components it mounts.
 *
 * The trigger button lives in the page's light DOM and is wired up with ordinary
 * DOM listeners, while the menu is a Svelte component inside a shadow root. This
 * object is the seam: `setup()` writes to it, the component reads from it and
 * re-renders. Runes only work in `.svelte` / `.svelte.ts` modules, which is why
 * this is its own file rather than a few `let`s in `index.ts`.
 *
 * A single `$state` object rather than one rune per field behind a getter/setter pair:
 * `$state` deep-proxies an object, so plain property access is already reactive in both
 * directions and the accessors were pure ceremony.
 *
 * ⚠ That proxy is why this must never be handed to `browser.storage` — a `Proxy` is not
 * structured-cloneable and Firefox throws `DataCloneError` on the way in. Nothing here
 * does: `index.ts` only ever *reads* the store from `watchPresetStore` into this object.
 * See `toPlainStore` in `@/lib/presets` and the gotcha in CLAUDE.md.
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
  // Assigned to a local and then returned, not returned directly: `$state` is only
  // valid as a variable declaration's initialiser (`state_invalid_placement`). Note
  // `pnpm check` does not catch that — `pnpm build` is what fails.
  const state: MenuState = $state({
    store: emptyPresetStore(),
    open: false,
    dark: false,
  });
  return state;
}
