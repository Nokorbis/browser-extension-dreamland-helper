/**
 * Which emoji this writer reached for last. The smallest instance of the store idiom in
 * `@/lib/store-kit` (docs/adr/0012).
 *
 * Only the *characters* are stored, never labels or ids: the dataset can be regenerated,
 * re-translated or version-capped underneath a saved list without invalidating it, and an
 * emoji that later leaves the dataset simply stops being offered.
 */
import {
  isRecord,
  loadStore,
  readInt,
  runMigrations,
  saveStore,
  watchStore,
} from './store-kit';
import { warn } from './log';

export const EMOJI_KEY = 'emojiPicker';
export const EMOJI_SCHEMA_VERSION = 1;

/**
 * Deliberately larger than `RECENT_SHOWN`: the tail is what a returning writer's list is
 * rebuilt from after a few one-off insertions push their staples out of view.
 */
export const RECENT_LIMIT = 24;

/** How many of them the panel's "Récents" row displays. */
export const RECENT_SHOWN = 12;

export interface EmojiPrefs {
  version: number;
  /** Most recently used first. Plain Unicode characters. */
  recent: string[];
}

/** A factory, not a constant — callers mutate what they get back. */
export function emptyEmojiPrefs(): EmojiPrefs {
  return { version: EMOJI_SCHEMA_VERSION, recent: [] };
}

/** Keyed by the version being upgraded *from*. Empty at v1. */
const MIGRATIONS: Record<number, (prefs: EmojiPrefs) => EmojiPrefs> = {};

/** Never throws — a corrupt payload costs the recents list, not the feature. */
export function normalizeEmojiPrefs(raw: unknown): EmojiPrefs {
  if (!isRecord(raw)) return emptyEmojiPrefs();

  const repairs: string[] = [];

  const seen = new Set<string>();
  const recent: string[] = [];
  const rawRecent = Array.isArray(raw.recent) ? raw.recent : [];
  if (!Array.isArray(raw.recent) && raw.recent !== undefined) {
    repairs.push('recent was not an array');
  }
  for (const entry of rawRecent) {
    // A non-string, an empty string or a repeat would each show up as a blank or
    // duplicated cell, so drop them here rather than making the component defensive.
    if (typeof entry !== 'string' || entry === '' || seen.has(entry)) {
      repairs.push(`dropped an unusable recent entry`);
      continue;
    }
    seen.add(entry);
    recent.push(entry);
  }

  if (recent.length > RECENT_LIMIT) {
    repairs.push(`trimmed ${recent.length - RECENT_LIMIT} recents over the limit`);
    recent.length = RECENT_LIMIT;
  }

  const prefs = runMigrations(
    { version: readInt(raw.version) ?? 0, recent },
    readInt(raw.version),
    EMOJI_SCHEMA_VERSION,
    MIGRATIONS,
  );
  prefs.version = EMOJI_SCHEMA_VERSION;

  if (repairs.length > 0) warn('emoji recents repaired on read', repairs);
  return prefs;
}

/**
 * Plain object only: a Svelte `$state` Proxy is not cloneable and Firefox throws. Called
 * from *inside* `saveEmojiPrefs`, so the guard sits at the boundary rather than a call site.
 */
export function toPlainEmojiPrefs(prefs: EmojiPrefs): EmojiPrefs {
  return { version: prefs.version, recent: [...prefs.recent] };
}

/**
 * Most-recent-first, deduped (re-using an emoji moves it to the front rather than adding a
 * second cell), capped at `limit`.
 */
export function pushRecent(
  prefs: EmojiPrefs,
  char: string,
  limit: number = RECENT_LIMIT,
): EmojiPrefs {
  if (char === '') return prefs;
  const recent = [char, ...prefs.recent.filter((entry) => entry !== char)];
  if (limit > 0) recent.length = Math.min(recent.length, limit);
  return { ...prefs, recent };
}

export async function loadEmojiPrefs(): Promise<EmojiPrefs> {
  return loadStore(EMOJI_KEY, normalizeEmojiPrefs);
}

export async function saveEmojiPrefs(prefs: EmojiPrefs): Promise<void> {
  await saveStore(EMOJI_KEY, toPlainEmojiPrefs(prefs));
}

export function watchEmojiPrefs(onChange: (prefs: EmojiPrefs) => void): () => void {
  return watchStore(EMOJI_KEY, normalizeEmojiPrefs, onChange);
}
