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
 */
import { emptyEmojiData, type EmojiData } from './types';

/** What the panel is currently able to show. */
export type PickerStatus = 'loading' | 'ready' | 'failed';

export function createPickerState() {
  let data = $state<EmojiData>(emptyEmojiData());
  let status = $state<PickerStatus>('loading');
  let recent = $state<string[]>([]);
  let open = $state(false);
  let dark = $state(false);
  let query = $state('');
  let group = $state(0);
  /** Set when an insertion was refused for length; cleared on the next open. */
  let tooLong = $state(false);

  return {
    /** The emoji dataset, fetched once per page by `data.ts`. */
    get data(): EmojiData {
      return data;
    },
    set data(next: EmojiData) {
      data = next;
    },

    get status(): PickerStatus {
      return status;
    },
    set status(next: PickerStatus) {
      status = next;
    },

    /** Most recently used first, kept fresh by `watchEmojiPrefs`. */
    get recent(): string[] {
      return recent;
    },
    set recent(next: string[]) {
      recent = next;
    },

    /** Whether this surface's panel is showing. */
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

    /** The search box's contents. Empty means "show the selected category". */
    get query(): string {
      return query;
    },
    set query(next: string) {
      query = next;
    },

    /** Index into `data.groups` of the selected category tab. */
    get group(): number {
      return group;
    },
    set group(next: number) {
      group = next;
    },

    /** True when the last insertion was refused for exceeding `maxlength`. */
    get tooLong(): boolean {
      return tooLong;
    },
    set tooLong(next: boolean) {
      tooLong = next;
    },
  };
}

export type PickerState = ReturnType<typeof createPickerState>;
