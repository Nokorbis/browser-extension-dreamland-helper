/**
 * Tests for the emoji picker's recents store: the pure mutation and the repair
 * pass every read goes through.
 *
 * `loadEmojiPrefs`/`saveEmojiPrefs` are thin wrappers over `store-kit` and are
 * left to hand-verification in a real browser — the Firefox `DataCloneError`
 * they guard against needs a real `storage.local`, not a mock.
 */
import { describe, it, expect } from 'vitest';
import {
  EMOJI_SCHEMA_VERSION,
  emptyEmojiPrefs,
  normalizeEmojiPrefs,
  pushRecent,
  RECENT_LIMIT,
  toPlainEmojiPrefs,
} from './emoji-recents';

describe('pushRecent', () => {
  it('puts the newest first', () => {
    let prefs = emptyEmojiPrefs();
    prefs = pushRecent(prefs, '😀');
    prefs = pushRecent(prefs, '❤️');
    expect(prefs.recent).toEqual(['❤️', '😀']);
  });

  it('moves a repeat to the front instead of duplicating it', () => {
    let prefs = emptyEmojiPrefs();
    prefs = pushRecent(prefs, '😀');
    prefs = pushRecent(prefs, '❤️');
    prefs = pushRecent(prefs, '😀');
    expect(prefs.recent).toEqual(['😀', '❤️']);
  });

  it('caps the list at the limit, dropping the oldest', () => {
    let prefs = emptyEmojiPrefs();
    for (let i = 0; i < RECENT_LIMIT + 5; i += 1) {
      prefs = pushRecent(prefs, `e${i}`);
    }
    expect(prefs.recent).toHaveLength(RECENT_LIMIT);
    expect(prefs.recent[0]).toBe(`e${RECENT_LIMIT + 4}`);
    expect(prefs.recent).not.toContain('e0');
  });

  it('honours an explicit limit', () => {
    let prefs = emptyEmojiPrefs();
    prefs = pushRecent(prefs, 'a', 2);
    prefs = pushRecent(prefs, 'b', 2);
    prefs = pushRecent(prefs, 'c', 2);
    expect(prefs.recent).toEqual(['c', 'b']);
  });

  it('is pure — the input is left alone', () => {
    const prefs = emptyEmojiPrefs();
    const next = pushRecent(prefs, '😀');
    expect(prefs.recent).toEqual([]);
    expect(next).not.toBe(prefs);
  });

  it('ignores an empty character', () => {
    const prefs = emptyEmojiPrefs();
    expect(pushRecent(prefs, '')).toBe(prefs);
  });
});

describe('normalizeEmojiPrefs', () => {
  it('returns an empty store for anything that is not a record', () => {
    for (const raw of [undefined, null, 'nope', 42, []]) {
      expect(normalizeEmojiPrefs(raw)).toEqual(emptyEmojiPrefs());
    }
  });

  it('stamps the current schema version', () => {
    expect(normalizeEmojiPrefs({ recent: [] }).version).toBe(EMOJI_SCHEMA_VERSION);
    expect(normalizeEmojiPrefs({ version: 'x', recent: [] }).version).toBe(
      EMOJI_SCHEMA_VERSION,
    );
  });

  it('drops entries that would render as blank or duplicated cells', () => {
    const prefs = normalizeEmojiPrefs({
      version: 1,
      recent: ['😀', '', '😀', 7, null, '❤️'],
    });
    expect(prefs.recent).toEqual(['😀', '❤️']);
  });

  it('survives a recent field of the wrong type', () => {
    expect(normalizeEmojiPrefs({ version: 1, recent: 'nope' }).recent).toEqual([]);
  });

  it('trims a list longer than the limit', () => {
    const recent = Array.from({ length: RECENT_LIMIT + 10 }, (_, i) => `e${i}`);
    expect(normalizeEmojiPrefs({ version: 1, recent }).recent).toHaveLength(
      RECENT_LIMIT,
    );
  });
});

describe('toPlainEmojiPrefs', () => {
  it('rebuilds rather than aliasing — the storage-boundary guard', () => {
    const prefs = { version: 1, recent: ['😀'] };
    const plain = toPlainEmojiPrefs(prefs);
    expect(plain).toEqual(prefs);
    expect(plain.recent).not.toBe(prefs.recent);
  });
});
