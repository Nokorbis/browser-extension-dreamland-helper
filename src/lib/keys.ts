/**
 * Keyboard-combo primitives shared by every feature that claims a shortcut: which modifier
 * row an event holds, which letter it means on a non-QWERTY layout, which letters are off
 * limits, and how a combo is spelled for a human and for `aria-keyshortcuts`.
 *
 * One copy, deliberately — two features claiming keys from two private copies of
 * `RESERVED_LETTERS` is how a binding quietly ends up on Ctrl+Z. With it here,
 * `src/lib/keys.test.ts` checks *every* claimed combo across the extension in one pass.
 * Read docs/adr/0017 before claiming a key.
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
 * Letters no feature may claim, per row. Enforced by unit test, not convention — the cost of
 * getting one wrong is a writer losing work.
 *
 * `primary` covers two kinds: editing essentials the composer needs (`a c v x z y`, where
 * claiming Ctrl+Z would be the most destructive thing this extension could do), and combos
 * the browser reserves so a page cannot intercept them (`n t w q r l`, which would produce a
 * shortcut that silently never fires).
 *
 * `secondary` is the menu mnemonics: Chrome's app menu answers Alt+E/Alt+F and Firefox's
 * menu bar answers Alt+F/E/V/S/B/T/H even while hidden; `d` focuses the address bar in both.
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
 * Every branch is an *exact* match, never a subset: `Ctrl+B` must not fire on macOS, where
 * it means "move backward one character", and no binding may fire with Shift held.
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
 * The letter the user meant, independent of keyboard layout. `key` first and `code` only as
 * a fallback, and the order is the whole point: `key` is what makes AZERTY work (the key
 * labelled A reports `key: 'a'` but `code: 'KeyQ'`, so matching by code would fire "quote"),
 * while `code` is what makes macOS work, where Option composes the character and
 * Ctrl+Option+C can arrive as `key: 'ç'`.
 */
export function readLetter(event: KeyEventLike): string | null {
  const key = event.key.toLowerCase();
  if (/^[a-z]$/.test(key)) return key;

  const physical = /^Key([A-Z])$/.exec(event.code);
  return physical === null ? null : physical[1].toLowerCase();
}

/**
 * The platform is a parameter, not a lookup, so this stays pure. Callers must not
 * `preventDefault()` before it returns true — a key we don't handle must reach the browser.
 */
export function matchesCombo(event: KeyEventLike, combo: Combo, mac: boolean): boolean {
  return readRow(event, mac) === combo.row && readLetter(event) === combo.letter;
}

/** Human-readable combo for a tooltip: `Ctrl+B`, `⌘B`, `Alt+Q`, `⌃⌥Q`. */
export function formatCombo(combo: Combo, mac: boolean): string {
  const letter = combo.letter.toUpperCase();
  if (combo.row === 'primary') return mac ? `⌘${letter}` : `Ctrl+${letter}`;
  return mac ? `⌃⌥${letter}` : `Alt+${letter}`;
}

/**
 * The `aria-keyshortcuts` grammar is a fixed vocabulary (`Control`, `Alt`, `Meta`) and not
 * localizable, hence separate from `formatCombo`.
 */
export function ariaCombo(combo: Combo, mac: boolean): string {
  const letter = combo.letter.toUpperCase();
  if (combo.row === 'primary') {
    return mac ? `Meta+${letter}` : `Control+${letter}`;
  }
  return mac ? `Control+Alt+${letter}` : `Alt+${letter}`;
}

/**
 * True on macOS, where the primary modifier is Cmd rather than Ctrl. The one impure function
 * here. `userAgentData` is Chromium-only, so Firefox falls through to the deprecated
 * `navigator.platform` — still the only thing it offers, and accurate for this question.
 */
export function isMacPlatform(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData;
  return /mac/i.test(data?.platform ?? navigator.platform ?? '');
}
