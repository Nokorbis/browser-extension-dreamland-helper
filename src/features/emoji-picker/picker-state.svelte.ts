/**
 * Reactive state shared between the feature's setup and the Svelte panel it mounts — same
 * seam as `menu-state.svelte.ts`, see there for the rune rules. One instance per surface,
 * both fed the same dataset and recents list by `index.ts`.
 *
 * ⚠ Never hand this to `browser.storage` — `$state` deep-proxies it and a `Proxy` is not
 * structured-cloneable. `index.ts` keeps its own plain `prefs` for the write.
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
  // ⚠ Assigned to a local, not returned directly: `$state` is only valid as a variable
  // declaration's initialiser (`state_invalid_placement`), and `pnpm check` does not
  // catch it — `pnpm build` is what fails.
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
