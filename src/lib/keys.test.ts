/**
 * The extension-wide shortcut check.
 *
 * `keymap.test.ts` covers how the editor-shortcuts keymap behaves. This file
 * covers the thing no single feature can check for itself: that the combos
 * claimed *across* features don't collide, and that none of them lands on a
 * letter the composer or the browser already owns. Every feature that claims a
 * key must add it to CLAIMED below — that is the whole point of the file.
 */
import { describe, it, expect } from 'vitest';
import { KEYMAP } from '@/features/editor-shortcuts/keymap';
import { EMOJI_COMBO } from '@/features/emoji-picker/shortcut';
import {
  ariaCombo,
  formatCombo,
  matchesCombo,
  readLetter,
  readRow,
  RESERVED_LETTERS,
  type Combo,
  type KeyEventLike,
} from './keys';

/** Every combo the extension claims, labelled by who claims it. */
const CLAIMED: readonly { owner: string; combo: Combo }[] = [
  ...KEYMAP.map((shortcut) => ({
    owner: `editor-shortcuts:${shortcut.bbcode}`,
    combo: shortcut,
  })),
  { owner: 'emoji-picker', combo: EMOJI_COMBO },
];

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

function letter(char: string, modifiers: Partial<KeyEventLike>): KeyEventLike {
  return press({ key: char, code: `Key${char.toUpperCase()}`, ...modifiers });
}

describe('the combos claimed across the whole extension', () => {
  it('claims no reserved letter', () => {
    for (const { owner, combo } of CLAIMED) {
      expect(
        RESERVED_LETTERS[combo.row].includes(combo.letter),
        `${owner} claims reserved ${combo.row} "${combo.letter}"`,
      ).toBe(false);
    }
  });

  it('claims each combo exactly once', () => {
    const seen = new Map<string, string>();
    for (const { owner, combo } of CLAIMED) {
      const key = `${combo.row}+${combo.letter}`;
      const previous = seen.get(key);
      // editor-shortcuts binds `code` and `url` from both rows on purpose, but
      // two *different* owners on one combo is always a bug.
      if (previous !== undefined && previous !== owner) {
        expect.unreachable(`${key} claimed by both ${previous} and ${owner}`);
      }
      seen.set(key, owner);
    }
  });

  it('uses only lowercase single letters', () => {
    for (const { combo } of CLAIMED) {
      expect(combo.letter).toMatch(/^[a-z]$/);
    }
  });
});

describe('the emoji picker binding specifically', () => {
  it('answers Alt+I off macOS', () => {
    expect(matchesCombo(letter('i', { altKey: true }), EMOJI_COMBO, false)).toBe(true);
  });

  it('answers Ctrl+Option+I on macOS, not Option alone', () => {
    expect(
      matchesCombo(letter('i', { ctrlKey: true, altKey: true }), EMOJI_COMBO, true),
    ).toBe(true);
    expect(matchesCombo(letter('i', { altKey: true }), EMOJI_COMBO, true)).toBe(false);
  });

  it('never fires on a bare keypress, or with Shift held', () => {
    expect(matchesCombo(letter('i', {}), EMOJI_COMBO, false)).toBe(false);
    expect(
      matchesCombo(letter('i', { altKey: true, shiftKey: true }), EMOJI_COMBO, false),
    ).toBe(false);
  });

  it('does not answer Ctrl+I, which is italic', () => {
    expect(matchesCombo(letter('i', { ctrlKey: true }), EMOJI_COMBO, false)).toBe(false);
  });

  it('spells itself for a tooltip and for aria-keyshortcuts', () => {
    expect(formatCombo(EMOJI_COMBO, false)).toBe('Alt+I');
    expect(formatCombo(EMOJI_COMBO, true)).toBe('⌃⌥I');
    expect(ariaCombo(EMOJI_COMBO, false)).toBe('Alt+I');
    expect(ariaCombo(EMOJI_COMBO, true)).toBe('Control+Alt+I');
  });
});

describe('the shared primitives', () => {
  it('reads the letter the user pressed, not the physical key (AZERTY)', () => {
    // On AZERTY the key labelled A sits where QWERTY has Q.
    expect(readLetter(press({ key: 'a', code: 'KeyQ' }))).toBe('a');
  });

  it('falls back to the physical key when the modifier composed a character', () => {
    expect(readLetter(press({ key: 'ç', code: 'KeyC' }))).toBe('c');
  });

  it('reads no row when both primary modifiers are held', () => {
    expect(readRow(press({ ctrlKey: true, metaKey: true }), false)).toBeNull();
  });
});
