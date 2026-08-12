/**
 * Tests for emoji search — the decision-making half of the picker.
 *
 * The fixtures below are copied verbatim out of `public/emoji/emoji.json` so
 * the accents, ligatures and CLDR phrasings under test are the real ones. The
 * grid, the panel and the insertion stay untested: DOM glue, verified by hand
 * (see vitest.config.ts).
 */
import { describe, it, expect } from 'vitest';
import { fold, searchEmoji } from './search';
import type { EmojiRecord } from './types';

const HEART: EmojiRecord = {
  c: '❤️',
  g: 0,
  fr: 'cœur rouge',
  en: 'red heart',
  k: 'amour sentiment emotion love',
};
const GRIN: EmojiRecord = {
  c: '😀',
  g: 0,
  fr: 'visage rieur',
  en: 'grinning face',
  k: 'content dents grand sourire smile happy',
};
const CAT: EmojiRecord = {
  c: '🐱',
  g: 2,
  fr: 'tête de chat',
  en: 'cat face',
  k: 'animal félin minou kitty pet',
};
const BLACK_CAT: EmojiRecord = {
  c: '🐈‍⬛',
  g: 2,
  fr: 'chat noir',
  en: 'black cat',
  k: 'malchance superstition unlucky',
};
const CAFE: EmojiRecord = {
  c: '☕',
  g: 3,
  fr: 'boisson chaude',
  en: 'hot beverage',
  k: 'café thé tasse coffee tea',
};

const ALL = [HEART, GRIN, CAT, BLACK_CAT, CAFE];

describe('fold', () => {
  it('lowercases and strips accents', () => {
    expect(fold('CAFÉ')).toBe('cafe');
    expect(fold('félin')).toBe('felin');
    expect(fold('tête')).toBe('tete');
  });

  it('spells out ligatures NFD leaves alone', () => {
    // The one that matters most in French: nobody types the ligature.
    expect(fold('cœur')).toBe('coeur');
    expect(fold('nævus')).toBe('naevus');
  });

  it('flattens punctuation to separators', () => {
    expect(fold("il y a quelqu'un ?")).toBe('il y a quelqu un');
    expect(fold('flag: Wales')).toBe('flag wales');
  });

  it('collapses and trims whitespace', () => {
    expect(fold('  red   heart  ')).toBe('red heart');
  });
});

describe('searchEmoji', () => {
  it('finds a French label through its accents and ligature', () => {
    expect(searchEmoji(ALL, 'coeur', 10)).toEqual([HEART]);
    expect(searchEmoji(ALL, 'CŒUR', 10)).toEqual([HEART]);
  });

  it('finds the same emoji by its English label', () => {
    // The reason the dataset carries both locales: plenty of writers here know
    // the English name and not the French one.
    expect(searchEmoji(ALL, 'heart', 10)).toEqual([HEART]);
  });

  it('matches keywords in either language', () => {
    expect(searchEmoji(ALL, 'amour', 10)).toEqual([HEART]);
    expect(searchEmoji(ALL, 'coffee', 10)).toEqual([CAFE]);
    expect(searchEmoji(ALL, 'cafe', 10)).toEqual([CAFE]);
  });

  it('ranks a label match above a keyword-only match', () => {
    // "chat" names both cats; it is only a keyword on the paw print. Ordering
    // the other way round would bury the obvious answer under an association.
    const paw: EmojiRecord = {
      c: '🐾',
      g: 2,
      fr: 'empreintes de pattes',
      en: 'paw prints',
      k: 'chat chien animal',
    };
    const found = searchEmoji([paw, CAT, BLACK_CAT], 'chat', 10);
    expect(found.map((record) => record.c)).toEqual(['🐈‍⬛', '🐱', '🐾']);
  });

  it('ranks a label prefix above the same word mid-label', () => {
    // "chat noir" leads with the query; "tête de chat" only contains it.
    const found = searchEmoji([CAT, BLACK_CAT], 'chat', 10);
    expect(found.map((record) => record.c)).toEqual(['🐈‍⬛', '🐱']);
  });

  it('ranks a whole-label match above a prefix and a substring', () => {
    const exact: EmojiRecord = { c: '1', g: 0, fr: 'chat', en: 'chat', k: '' };
    const prefix: EmojiRecord = { c: '2', g: 0, fr: 'chaton mignon', en: '', k: '' };
    const inside: EmojiRecord = { c: '3', g: 0, fr: 'un gros chat', en: '', k: '' };
    const found = searchEmoji([inside, prefix, exact], 'chat', 10);
    expect(found.map((record) => record.c)).toEqual(['1', '2', '3']);
  });

  it('treats a multi-word query as AND, ranked by its worst term', () => {
    expect(searchEmoji(ALL, 'chat noir', 10)).toEqual([BLACK_CAT]);
    // "chat" matches, "bleu" matches nothing — so neither cat survives.
    expect(searchEmoji(ALL, 'chat bleu', 10)).toEqual([]);
  });

  it('keeps dataset order between records of equal rank', () => {
    const found = searchEmoji(ALL, 'a', 10);
    const positions = found.map((record) => ALL.indexOf(record));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('honours the limit', () => {
    expect(searchEmoji(ALL, 'a', 2)).toHaveLength(2);
    expect(searchEmoji(ALL, 'a', 0)).toEqual([]);
  });

  it('returns nothing for an empty or whitespace query', () => {
    // The panel shows a category in this case; returning the whole set here
    // would render 1900 cells behind a search box the user has not used yet.
    expect(searchEmoji(ALL, '', 10)).toEqual([]);
    expect(searchEmoji(ALL, '   ', 10)).toEqual([]);
    expect(searchEmoji(ALL, '???', 10)).toEqual([]);
  });

  it('returns nothing when the query matches nothing', () => {
    expect(searchEmoji(ALL, 'zzzz', 10)).toEqual([]);
  });
});
