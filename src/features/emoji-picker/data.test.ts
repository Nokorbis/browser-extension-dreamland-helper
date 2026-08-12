/**
 * The emoji dataset's repair pass.
 *
 * `normalizeEmojiData` is structurally the same kind of function as
 * `normalizePresetStore` and `normalizeEmojiPrefs` — both of which are tested — but it
 * had no coverage at all, despite running against a ~250 kB asset fetched at runtime
 * rather than a payload this code wrote itself. `loadEmojiData` around it is fetch glue
 * and stays hand-verified; this is the half that makes decisions.
 */
import { describe, it, expect } from 'vitest';
import { normalizeEmojiData } from './data';

const group = (id: string) => ({ id, fr: `${id}-fr`, en: `${id}-en` });
const record = (c: string, g: number) => ({ c, g, fr: 'visage', en: 'face', k: 'smile' });

describe('normalizeEmojiData on a well-formed payload', () => {
  it('passes groups and records through intact', () => {
    const data = normalizeEmojiData({
      version: 2,
      groups: [group('faces'), group('animals')],
      emoji: [record('😀', 0), record('🐈', 1)],
    });
    expect(data.version).toBe(2);
    expect(data.groups).toHaveLength(2);
    expect(data.emoji).toHaveLength(2);
    expect(data.emoji[0]).toEqual({
      c: '😀',
      g: 0,
      fr: 'visage',
      en: 'face',
      k: 'smile',
    });
  });

  it('keeps a ZWJ sequence as one record', () => {
    // '🐈‍⬛' is three code points. Nothing here may split or re-encode it — the string
    // is the identity a recents entry is matched on.
    const data = normalizeEmojiData({
      groups: [group('animals')],
      emoji: [record('🐈‍⬛', 0)],
    });
    expect(data.emoji).toHaveLength(1);
    expect(data.emoji[0].c).toBe('🐈‍⬛');
  });
});

describe('normalizeEmojiData on a malformed payload', () => {
  it('returns an empty dataset for a non-object', () => {
    for (const raw of [null, undefined, 'x', 42, []]) {
      const data = normalizeEmojiData(raw);
      expect(data.groups).toEqual([]);
      expect(data.emoji).toEqual([]);
    }
  });

  it('defaults a missing version to 0', () => {
    expect(normalizeEmojiData({ groups: [], emoji: [] }).version).toBe(0);
    expect(normalizeEmojiData({ version: 'two', groups: [], emoji: [] }).version).toBe(0);
  });

  it('treats non-array groups and emoji as empty', () => {
    const data = normalizeEmojiData({ groups: { a: 1 }, emoji: 'nope' });
    expect(data.groups).toEqual([]);
    expect(data.emoji).toEqual([]);
  });

  it('drops a group with no id, and non-object entries', () => {
    const data = normalizeEmojiData({
      groups: [group('faces'), { fr: 'sans id' }, { id: '' }, null, 'x'],
      emoji: [],
    });
    expect(data.groups.map((g) => g.id)).toEqual(['faces']);
  });

  it('falls back to the id for a missing label, in either language', () => {
    // Better a tab labelled `animals` than a blank one.
    const data = normalizeEmojiData({ groups: [{ id: 'animals' }], emoji: [] });
    expect(data.groups[0]).toEqual({ id: 'animals', fr: 'animals', en: 'animals' });
  });

  it('drops a record whose group index is out of range', () => {
    // The interesting one: such a record would render in no tab at all, so it is
    // dropped rather than given an invented home.
    const data = normalizeEmojiData({
      groups: [group('faces')],
      emoji: [record('😀', 0), record('🐈', 1), record('🎉', -1)],
    });
    expect(data.emoji.map((e) => e.c)).toEqual(['😀']);
  });

  it('drops every record when there are no groups at all', () => {
    const data = normalizeEmojiData({ groups: [], emoji: [record('😀', 0)] });
    expect(data.emoji).toEqual([]);
  });

  it('drops a record with no character or an unusable group', () => {
    const data = normalizeEmojiData({
      groups: [group('faces')],
      emoji: [
        record('', 0),
        { c: '😀' },
        { c: '😀', g: 'zero' },
        { c: '😀', g: NaN },
        null,
        record('😀', 0),
      ],
    });
    expect(data.emoji).toHaveLength(1);
  });

  it('defaults missing search fields to empty strings rather than dropping the emoji', () => {
    // A record with no keywords is still usable — it just matches less.
    const data = normalizeEmojiData({
      groups: [group('faces')],
      emoji: [{ c: '😀', g: 0 }],
    });
    expect(data.emoji[0]).toEqual({ c: '😀', g: 0, fr: '', en: '', k: '' });
  });

  it('truncates a fractional group index the way readInt does', () => {
    const data = normalizeEmojiData({
      groups: [group('faces'), group('animals')],
      emoji: [{ c: '🐈', g: 1.9 }],
    });
    expect(data.emoji[0].g).toBe(1);
  });
});
