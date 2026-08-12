/**
 * Reactive state shared between the feature's plain-TypeScript setup code and
 * the Svelte panel it mounts.
 *
 * Same seam as `bbcode-presets/menu-state.svelte.ts`: the trigger buttons live
 * in the page's light DOM and are wired with ordinary DOM listeners, while the
 * panel is a Svelte component inside a shadow root. Runes only work in
 * `.svelte` / `.svelte.ts` modules, hence a file of its own rather than a few
 * `let`s in `index.ts`.
 *
 * One instance is created per surface (composer, chat), because each has its
 * own trigger, its own open state and its own textarea — but they share the one
 * dataset and the one recents list, which `index.ts` pushes into both.
 *
 * A single `$state` object rather than one rune per field behind a getter/setter pair —
 * see the note in `menu-state.svelte.ts`, including why the resulting proxy must never
 * reach `browser.storage`. It doesn't: `index.ts` keeps its own plain `prefs` object for
 * the write and pushes only the array into here.
 */
import { emptyEmojiData, type EmojiData } from './types';

/** What the panel is currently able to show. */
export type PickerStatus = 'loading' | 'ready' | 'failed';

export interface PickerState {
  /** The emoji dataset, fetched once per page by `data.ts`. */
  data: EmojiData;
  status: PickerStatus;
  /** Most recently used first, kept fresh by `watchEmojiPrefs`. */
  recent: string[];
  /** Whether this surface's panel is showing. */
  open: boolean;
  /**
   * Whether the *forum* is in dark mode, from `html.dark`. Pushed in from `setup()`
   * because CSS inside a shadow root cannot read the host page's classes portably.
   * See `isDarkTheme` in `@/lib/phpbb`.
   */
  dark: boolean;
  /** The search box's contents. Empty means "show the selected category". */
  query: string;
  /** Index into `data.groups` of the selected category tab. */
  group: number;
  /**
   * True when the last insertion was refused for exceeding `maxlength` — the chat caps
   * messages at 1040 characters. Set on a refused insert, cleared on the next open.
   */
  tooLong: boolean;
}

export function createPickerState(): PickerState {
  // Assigned to a local and then returned, not returned directly: `$state` is only
  // valid as a variable declaration's initialiser (`state_invalid_placement`). Note
  // `pnpm check` does not catch that — `pnpm build` is what fails.
  const state: PickerState = $state({
    data: emptyEmojiData(),
    status: 'loading',
    recent: [],
    open: false,
    dark: false,
    query: '',
    group: 0,
    tooLong: false,
  });
  return state;
}
