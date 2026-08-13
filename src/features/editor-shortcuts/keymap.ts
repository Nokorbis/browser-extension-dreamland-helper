/**
 * The keyboard map, and the pure logic turning a key event into a BBCode — the part worth
 * unit-testing. `index.ts` keeps the listener, the tooltips and the clicks; this file never
 * touches an element.
 *
 * The modifier-row machinery lives in `@/lib/keys`, shared with every feature that claims a
 * shortcut (docs/adr/0023). What stays here is the one thing only this feature knows: which
 * BBCode each combo drives. Those shared names are deliberately **not** re-exported — there
 * is one import path for them.
 *
 * Read docs/adr/0017 before changing a binding.
 */
import { readLetter, readRow, type Combo, type KeyEventLike } from '@/lib/keys';

export interface Shortcut extends Combo {
  /** phpBB's `bbcode-*` class suffix, resolved through `findFormatButton`. */
  bbcode: string;
}

/**
 * `primary` is Ctrl, or Cmd on macOS — the row carrying the five bindings every other editor
 * has already taught people.
 *
 * `secondary` is Alt, or Ctrl+Option on macOS, since plain Option composes accented
 * characters there. Its letters reuse phpBB's own `accesskey` letters wherever the forum has
 * one, so existing muscle memory keeps working and only the browser-dependent modifier
 * changes; the rest are new bindings for the custom BBCodes, which have no accesskey at all.
 *
 * Code and link are reachable from both rows on purpose: the conventional binding and the
 * forum's historical letter both work.
 *
 * Other features claim keys too (the emoji picker takes secondary `i`). Nothing here needs
 * to know that, but `src/lib/keys.test.ts` checks the whole set for collisions.
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
 * The platform is a parameter, not a lookup, so this stays pure. Callers must not
 * `preventDefault()` before it returns non-null — a key we don't handle must reach the
 * browser untouched.
 */
export function resolveShortcut(event: KeyEventLike, mac: boolean): string | null {
  const row = readRow(event, mac);
  if (row === null) return null;

  const letter = readLetter(event);
  if (letter === null) return null;

  const match = KEYMAP.find(
    (shortcut) => shortcut.row === row && shortcut.letter === letter,
  );
  return match?.bbcode ?? null;
}
