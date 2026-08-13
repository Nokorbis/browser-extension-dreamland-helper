/**
 * The keyboard map and the pure event → BBCode logic; `index.ts` owns the listener, tooltips
 * and clicks, and this file never touches an element.
 *
 * The modifier-row machinery is `@/lib/keys` (docs/adr/0023); what stays here is the one
 * thing only this feature knows — which BBCode each combo drives. The shared names are
 * deliberately **not** re-exported: one import path for them.
 *
 * Read docs/adr/0017 before changing a binding.
 */
import { readLetter, readRow, type Combo, type KeyEventLike } from '@/lib/keys';

export interface Shortcut extends Combo {
  /** phpBB's `bbcode-*` class suffix, resolved through `findFormatButton`. */
  bbcode: string;
}

/**
 * `primary` is Ctrl (Cmd on macOS) — the five bindings every other editor already taught
 * people. `secondary` is Alt (Ctrl+Option on macOS, where plain Option composes accents), and
 * reuses phpBB's own `accesskey` letters wherever the forum has one, so muscle memory keeps
 * working and only the modifier changes; the rest are new, for BBCodes with no accesskey.
 *
 * Code and link sit on both rows on purpose. Other features claim keys too (the picker takes
 * secondary `i`); `src/lib/keys.test.ts` is where the whole set is checked for collisions.
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
