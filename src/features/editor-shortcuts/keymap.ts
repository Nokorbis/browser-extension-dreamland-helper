/**
 * The keyboard map, and the pure logic that turns a key event into a BBCode.
 *
 * Split from `index.ts` because everything here is decision-making rather than
 * DOM work, which is exactly the part worth unit-testing (see the scoping note
 * in vitest.config.ts). `index.ts` keeps the listener, the tooltips and the
 * clicks; this file never touches an element.
 *
 * The whole design is recorded in
 * docs/adr/0017-keyboard-shortcuts-delegate-to-toolbar.md — read that before
 * changing a binding.
 */

/** Which modifier row a shortcut belongs to. */
export type Row = 'primary' | 'secondary';

export interface Shortcut {
  /**
   * phpBB's `bbcode-*` class suffix — i.e. the button this drives, resolved
   * through `findFormatButton` in `@/lib/phpbb`.
   */
  bbcode: string;
  row: Row;
  /** Lowercase a–z. Digits and punctuation are deliberately not supported. */
  letter: string;
}

/**
 * `primary` is Ctrl, or Cmd on macOS — the row carrying the five bindings every
 * other editor has already taught people.
 *
 * `secondary` is Alt, or Ctrl+Option on macOS (plain Option composes accented
 * characters there, so it cannot be claimed). Its letters reuse phpBB's own
 * `accesskey` letters wherever the forum has one — `q` quote, `c` code, `l`
 * list, `o` ordered list, `y` list item, `p` image, `w` link — so existing
 * muscle memory keeps working; the browser-dependent modifier is the only thing
 * that changes. The rest are new bindings for the custom BBCodes, which phpBB
 * gives no accesskey at all.
 *
 * Two BBCodes are reachable from both rows (code, link). That is intentional:
 * the conventional binding and the forum's historical letter both work.
 */
export const KEYMAP: readonly Shortcut[] = [
  { bbcode: 'b', row: 'primary', letter: 'b' },
  { bbcode: 'i', row: 'primary', letter: 'i' },
  { bbcode: 'u', row: 'primary', letter: 'u' },
  { bbcode: 'url', row: 'primary', letter: 'k' },
  { bbcode: 'code', row: 'primary', letter: 'e' },

  { bbcode: 'quote', row: 'secondary', letter: 'q' },
  { bbcode: 'code', row: 'secondary', letter: 'c' },
  { bbcode: 'list', row: 'secondary', letter: 'l' },
  { bbcode: 'list-', row: 'secondary', letter: 'o' },
  { bbcode: 'asterisk', row: 'secondary', letter: 'y' },
  { bbcode: 'img', row: 'secondary', letter: 'p' },
  { bbcode: 'url', row: 'secondary', letter: 'w' },
  { bbcode: 'color', row: 'secondary', letter: 'g' },
  { bbcode: 'center', row: 'secondary', letter: 'n' },
  { bbcode: 'justify', row: 'secondary', letter: 'j' },
  { bbcode: 'mp3', row: 'secondary', letter: 'm' },
  { bbcode: 's', row: 'secondary', letter: 'x' },
  { bbcode: 'spoiler', row: 'secondary', letter: 'k' },
];

/**
 * Letters this feature must never claim, per row. Enforced by a unit test, not
 * by convention — the cost of getting one wrong is a writer losing work.
 *
 * `primary` splits into two kinds, and both matter:
 *  - editing essentials the composer needs (`a c v x z y`) — claiming Ctrl+Z
 *    would be the single most destructive thing this feature could do;
 *  - combos the browser reserves and a page cannot intercept (`n t w q r l`).
 *    Claiming one produces a shortcut that silently never fires.
 *
 * `secondary` is the menu mnemonics: Chrome's app menu answers Alt+E/Alt+F, and
 * Firefox's menu bar answers Alt+F/E/V/S/B/T/H even while hidden. `d` goes with
 * them because Alt+D focuses the address bar in both.
 */
export const RESERVED_LETTERS: Record<Row, readonly string[]> = {
  primary: ['a', 'c', 'v', 'x', 'z', 'y', 'n', 't', 'w', 'q', 'r', 'l'],
  secondary: ['f', 'e', 'v', 's', 'b', 't', 'h', 'd'],
};

/**
 * Which modifier row this event is holding, or `null` for anything else.
 *
 * Every branch is an *exact* match, never a subset: `Ctrl+B` must not fire on
 * macOS, where Ctrl+B is "move backward one character", and no binding may fire
 * with Shift held (Ctrl+Shift+B is the browser's, not ours).
 */
function readRow(event: KeyEventLike, mac: boolean): Row | null {
  if (event.shiftKey) return null;

  if (mac) {
    if (event.metaKey && !event.ctrlKey && !event.altKey) return 'primary';
    if (event.ctrlKey && event.altKey && !event.metaKey) return 'secondary';
    return null;
  }

  if (event.ctrlKey && !event.metaKey && !event.altKey) return 'primary';
  if (event.altKey && !event.ctrlKey && !event.metaKey) return 'secondary';
  return null;
}

/**
 * The letter the user meant, independent of keyboard layout.
 *
 * `key` first, `code` only as a fallback, and the order is the whole point:
 *
 *  - `key` is what makes AZERTY work. The forum is French; on that layout the
 *    key labelled A reports `key: 'a'` but `code: 'KeyQ'`, so matching by code
 *    would fire "quote" when someone asked for the letter A.
 *  - `code` is what makes macOS work, where Option composes the character —
 *    Ctrl+Option+C can arrive as `key: 'ç'`. Falling back only when `key` is not
 *    a plain letter keeps the AZERTY case intact.
 */
function readLetter(event: KeyEventLike): string | null {
  const key = event.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key;

  const physical = /^Key([A-Z])$/.exec(event.code);
  return physical === null ? null : physical[1].toLowerCase();
}

/** The subset of `KeyboardEvent` this module reads — so tests need no DOM. */
export interface KeyEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * The BBCode this key event asks for, or `null` if it asks for nothing.
 *
 * Pure: the platform is a parameter, not a lookup. Callers must not
 * `preventDefault()` before this returns non-null — a key we don't handle has
 * to reach the browser untouched.
 */
export function resolveShortcut(
  event: KeyEventLike,
  mac: boolean,
): string | null {
  const row = readRow(event, mac);
  if (row === null) return null;

  const letter = readLetter(event);
  if (letter === null) return null;

  const match = KEYMAP.find(
    (shortcut) => shortcut.row === row && shortcut.letter === letter,
  );
  return match?.bbcode ?? null;
}

/** Human-readable combo for a tooltip: `Ctrl+B`, `⌘B`, `Alt+Q`, `⌃⌥Q`. */
export function formatCombo(shortcut: Shortcut, mac: boolean): string {
  const letter = shortcut.letter.toUpperCase();
  if (shortcut.row === 'primary') return mac ? `⌘${letter}` : `Ctrl+${letter}`;
  return mac ? `⌃⌥${letter}` : `Alt+${letter}`;
}

/**
 * The same combo in the `aria-keyshortcuts` grammar, which is a fixed
 * vocabulary (`Control`, `Alt`, `Meta`) and not localizable — hence separate
 * from `formatCombo`.
 */
export function ariaCombo(shortcut: Shortcut, mac: boolean): string {
  const letter = shortcut.letter.toUpperCase();
  if (shortcut.row === 'primary') {
    return mac ? `Meta+${letter}` : `Control+${letter}`;
  }
  return mac ? `Control+Alt+${letter}` : `Alt+${letter}`;
}

/**
 * True on macOS, where the primary modifier is Cmd rather than Ctrl.
 *
 * The one impure function here. `userAgentData` is Chromium-only, so Firefox
 * falls through to the deprecated `navigator.platform` — still the only thing
 * it offers, and accurate for this single question.
 */
export function isMacPlatform(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData;
  return /mac/i.test(data?.platform ?? navigator.platform ?? '');
}
