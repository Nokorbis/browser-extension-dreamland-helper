/**
 * The keyboard map, and the pure logic that turns a key event into a BBCode.
 *
 * Split from `index.ts` because everything here is decision-making rather than
 * DOM work, which is exactly the part worth unit-testing (see the scoping note
 * in vitest.config.ts). `index.ts` keeps the listener, the tooltips and the
 * clicks; this file never touches an element.
 *
 * The modifier-row machinery this builds on — `readRow`, `readLetter`,
 * `RESERVED_LETTERS`, the combo spellings — lives in `@/lib/keys`, shared with
 * every other feature that claims a shortcut (docs/adr/0023). What stays here is
 * the one thing only this feature knows: which BBCode each combo drives, so
 * those names are **not** re-exported — import them from `@/lib/keys` like the
 * emoji picker does, and this module for `KEYMAP` and `resolveShortcut`.
 *
 * The whole design is recorded in
 * docs/adr/0017-keyboard-shortcuts-delegate-to-toolbar.md — read that before
 * changing a binding.
 */
import { readLetter, readRow, type Combo, type KeyEventLike } from '@/lib/keys';

export interface Shortcut extends Combo {
  /**
   * phpBB's `bbcode-*` class suffix — i.e. the button this drives, resolved
   * through `findFormatButton` in `@/lib/phpbb`.
   */
  bbcode: string;
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
 *
 * Other features claim keys too — the emoji picker takes secondary `i`. Nothing
 * here needs to know that, but `src/lib/keys.test.ts` checks the whole set for
 * collisions in one place.
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
