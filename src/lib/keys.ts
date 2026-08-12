/**
 * Keyboard-combo primitives shared by every feature that claims a shortcut.
 *
 * This is the layer below any particular keymap: which modifier row an event is
 * holding, which letter it means on a non-QWERTY layout, which letters are off
 * limits, and how a combo is spelled for a human and for `aria-keyshortcuts`.
 * It knows nothing about BBCode, phpBB or the chat.
 *
 * It was extracted from `src/features/editor-shortcuts/keymap.ts` when the
 * emoji picker needed a shortcut of its own: two features claiming keys from
 * two private copies of `RESERVED_LETTERS` is how a binding quietly ends up on
 * Ctrl+Z. With one copy here, `src/lib/keys.test.ts` can check *every* claimed
 * combo across the whole extension in a single pass.
 *
 * The reasoning behind the two rows and the reserved list is recorded in
 * docs/adr/0017-keyboard-shortcuts-delegate-to-toolbar.md — read it before
 * claiming a key.
 */

/** Which modifier row a shortcut belongs to. */
export type Row = 'primary' | 'secondary';

/** A modifier row plus a letter — everything needed to match or spell a combo. */
export interface Combo {
  row: Row;
  /** Lowercase a–z. Digits and punctuation are deliberately not supported. */
  letter: string;
}

/**
 * Letters no feature may claim, per row. Enforced by unit test, not by
 * convention — the cost of getting one wrong is a writer losing work.
 *
 * `primary` splits into two kinds, and both matter:
 *  - editing essentials the composer needs (`a c v x z y`) — claiming Ctrl+Z
 *    would be the single most destructive thing this extension could do;
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
 * Which modifier row this event is holding, or `null` for anything else.
 *
 * Every branch is an *exact* match, never a subset: `Ctrl+B` must not fire on
 * macOS, where Ctrl+B is "move backward one character", and no binding may fire
 * with Shift held (Ctrl+Shift+B is the browser's, not ours).
 */
export function readRow(event: KeyEventLike, mac: boolean): Row | null {
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
export function readLetter(event: KeyEventLike): string | null {
  const key = event.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key;

  const physical = /^Key([A-Z])$/.exec(event.code);
  return physical === null ? null : physical[1].toLowerCase();
}

/**
 * Whether this key event asks for exactly this combo.
 *
 * Pure: the platform is a parameter, not a lookup. Callers must not
 * `preventDefault()` before this returns true — a key we don't handle has to
 * reach the browser untouched.
 */
export function matchesCombo(
  event: KeyEventLike,
  combo: Combo,
  mac: boolean,
): boolean {
  return readRow(event, mac) === combo.row && readLetter(event) === combo.letter;
}

/** Human-readable combo for a tooltip: `Ctrl+B`, `⌘B`, `Alt+Q`, `⌃⌥Q`. */
export function formatCombo(combo: Combo, mac: boolean): string {
  const letter = combo.letter.toUpperCase();
  if (combo.row === 'primary') return mac ? `⌘${letter}` : `Ctrl+${letter}`;
  return mac ? `⌃⌥${letter}` : `Alt+${letter}`;
}

/**
 * The same combo in the `aria-keyshortcuts` grammar, which is a fixed
 * vocabulary (`Control`, `Alt`, `Meta`) and not localizable — hence separate
 * from `formatCombo`.
 */
export function ariaCombo(combo: Combo, mac: boolean): string {
  const letter = combo.letter.toUpperCase();
  if (combo.row === 'primary') {
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
