/**
 * Tests for the decision-making half of the editor-shortcuts feature: which
 * BBCode a key event asks for, and how a combo is spelled.
 *
 * The listener, the tooltip rewriting and the synthetic clicks stay untested —
 * they are DOM glue, verified by hand against a real composer (see
 * vitest.config.ts). What is covered here is everything that could silently
 * claim a key it must not, or fire the wrong BBCode on a French keyboard.
 */
import { describe, it, expect } from 'vitest';
import {
  ariaCombo,
  formatCombo,
  KEYMAP,
  RESERVED_LETTERS,
  resolveShortcut,
  type KeyEventLike,
  type Row,
  type Shortcut,
} from './keymap';

/** A key event with nothing held; spread over it to add modifiers. */
function press(overrides: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key: 'a',
    code: 'KeyA',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

/** Letter as typed on a QWERTY-ish layout, where `key` and `code` agree. */
function letter(char: string, modifiers: Partial<KeyEventLike>): KeyEventLike {
  return press({
    key: char,
    code: `Key${char.toUpperCase()}`,
    ...modifiers,
  });
}

const CTRL = { ctrlKey: true };
const ALT = { altKey: true };
const CMD = { metaKey: true };
const CTRL_OPT = { ctrlKey: true, altKey: true };

describe('the primary row', () => {
  it('answers Ctrl off macOS', () => {
    expect(resolveShortcut(letter('b', CTRL), false)).toBe('b');
    expect(resolveShortcut(letter('i', CTRL), false)).toBe('i');
    expect(resolveShortcut(letter('u', CTRL), false)).toBe('u');
    expect(resolveShortcut(letter('k', CTRL), false)).toBe('url');
    expect(resolveShortcut(letter('e', CTRL), false)).toBe('code');
  });

  it('answers Cmd on macOS', () => {
    expect(resolveShortcut(letter('b', CMD), true)).toBe('b');
  });

  it('ignores Ctrl on macOS, where it is caret movement', () => {
    // Ctrl+B is "move backward one character" there — claiming it would break
    // editing rather than add to it.
    expect(resolveShortcut(letter('b', CTRL), true)).toBeNull();
  });

  it('ignores Cmd off macOS', () => {
    expect(resolveShortcut(letter('b', CMD), false)).toBeNull();
  });

  it('ignores an unbound letter', () => {
    expect(resolveShortcut(letter('d', CTRL), false)).toBeNull();
  });
});

describe('the secondary row', () => {
  it('answers Alt off macOS', () => {
    expect(resolveShortcut(letter('q', ALT), false)).toBe('quote');
    expect(resolveShortcut(letter('o', ALT), false)).toBe('list-');
    expect(resolveShortcut(letter('x', ALT), false)).toBe('s');
  });

  it('answers Ctrl+Option on macOS, not Option alone', () => {
    // Option alone composes accented characters on macOS, so it cannot be
    // claimed while someone is writing French.
    expect(resolveShortcut(letter('q', CTRL_OPT), true)).toBe('quote');
    expect(resolveShortcut(letter('q', ALT), true)).toBeNull();
  });

  it('ignores Ctrl+Alt off macOS, where it is AltGr', () => {
    expect(resolveShortcut(letter('q', CTRL_OPT), false)).toBeNull();
  });
});

describe('modifier matching is exact', () => {
  it('never fires with Shift held', () => {
    expect(resolveShortcut(letter('b', { ...CTRL, shiftKey: true }), false)).toBeNull();
    expect(resolveShortcut(letter('q', { ...ALT, shiftKey: true }), false)).toBeNull();
  });

  it('never fires with no modifier at all', () => {
    // The one that would make the composer unusable: plain typing.
    expect(resolveShortcut(letter('b', {}), false)).toBeNull();
    expect(resolveShortcut(letter('q', {}), false)).toBeNull();
  });

  it('never fires with both primary modifiers held', () => {
    expect(
      resolveShortcut(letter('b', { ctrlKey: true, metaKey: true }), false),
    ).toBeNull();
  });
});

describe('keyboard layouts', () => {
  it('reads the letter the user pressed, not the physical key (AZERTY)', () => {
    // On AZERTY the key labelled A sits where QWERTY has Q. Matching by `code`
    // would fire the quote binding for someone asking for the letter A.
    expect(
      resolveShortcut(press({ key: 'a', code: 'KeyQ', ...ALT }), false),
    ).toBeNull();
    // …and the key labelled Q reports code KeyA, which must still be quote.
    expect(
      resolveShortcut(press({ key: 'q', code: 'KeyA', ...ALT }), false),
    ).toBe('quote');
  });

  it('falls back to the physical key when the modifier composed a character', () => {
    // macOS: Option can turn the event's `key` into the composed glyph.
    expect(
      resolveShortcut(press({ key: 'ç', code: 'KeyC', ...CTRL_OPT }), true),
    ).toBe('code');
  });

  it('ignores keys that are not letters', () => {
    expect(
      resolveShortcut(press({ key: 'Enter', code: 'Enter', ...CTRL }), false),
    ).toBeNull();
    expect(
      resolveShortcut(press({ key: '1', code: 'Digit1', ...ALT }), false),
    ).toBeNull();
  });
});

describe('the keymap itself', () => {
  it('claims no reserved letter', () => {
    // The guard that outlives this change: Ctrl+Z, Ctrl+C and friends stay the
    // composer's, and no binding is parked on a combo the browser will eat.
    for (const shortcut of KEYMAP) {
      expect(
        RESERVED_LETTERS[shortcut.row].includes(shortcut.letter),
        `${shortcut.row} "${shortcut.letter}" (${shortcut.bbcode}) is reserved`,
      ).toBe(false);
    }
  });

  it('binds each combo once', () => {
    const combos = KEYMAP.map((shortcut) => `${shortcut.row}+${shortcut.letter}`);
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('uses only lowercase single letters', () => {
    for (const shortcut of KEYMAP) {
      expect(shortcut.letter).toMatch(/^[a-z]$/);
    }
  });
});

describe('combo formatting', () => {
  /** Look a binding up rather than indexing, so reordering KEYMAP is harmless. */
  function binding(row: Row, char: string): Shortcut {
    const found = KEYMAP.find((s) => s.row === row && s.letter === char);
    if (found === undefined) throw new Error(`no ${row} binding for "${char}"`);
    return found;
  }

  const bold = binding('primary', 'b');
  const quote = binding('secondary', 'q');

  it('spells the primary row per platform', () => {
    expect(formatCombo(bold, false)).toBe('Ctrl+B');
    expect(formatCombo(bold, true)).toBe('⌘B');
  });

  it('spells the secondary row per platform', () => {
    expect(formatCombo(quote, false)).toBe('Alt+Q');
    expect(formatCombo(quote, true)).toBe('⌃⌥Q');
  });

  it('spells aria-keyshortcuts in its own fixed vocabulary', () => {
    expect(ariaCombo(bold, false)).toBe('Control+B');
    expect(ariaCombo(bold, true)).toBe('Meta+B');
    expect(ariaCombo(quote, false)).toBe('Alt+Q');
    expect(ariaCombo(quote, true)).toBe('Control+Alt+Q');
  });
});
