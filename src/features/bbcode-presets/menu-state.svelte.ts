/**
 * Reactive state shared between the feature's plain-TypeScript setup code and
 * the Svelte components it mounts.
 *
 * The trigger button lives in the page's light DOM and is wired up with ordinary
 * DOM listeners, while the menu is a Svelte component inside a shadow root. This
 * object is the seam: `setup()` writes to it, the component reads from it and
 * re-renders. Runes only work in `.svelte` / `.svelte.ts` modules, which is why
 * this is its own file rather than a few `let`s in `index.ts`.
 */
import { emptyPresetStore, type PresetStore } from '@/lib/presets';

export function createMenuState() {
  let store = $state<PresetStore>(emptyPresetStore());
  let open = $state(false);
  let dark = $state(false);

  return {
    /** The preset library, kept fresh by `watchPresetStore`. */
    get store(): PresetStore {
      return store;
    },
    set store(next: PresetStore) {
      store = next;
    },

    /** Whether the dropdown is showing. */
    get open(): boolean {
      return open;
    },
    set open(next: boolean) {
      open = next;
    },

    /**
     * Whether the *forum* is in dark mode, from `html.dark`. Pushed in from
     * `setup()` because CSS inside a shadow root cannot read the host page's
     * classes portably. See `isDarkTheme` in `@/lib/phpbb`.
     */
    get dark(): boolean {
      return dark;
    },
    set dark(next: boolean) {
      dark = next;
    },
  };
}

export type MenuState = ReturnType<typeof createMenuState>;
