/**
 * The emoji picker's own data: which emoji this writer reached for last.
 *
 * A feature that owns *data* gets its own `storage.local` key and its own typed
 * module rather than a field in the settings blob — see
 * docs/adr/0012-feature-owned-data-stores.md. This is the smallest instance of
 * that idiom (`@/lib/presets` is the full one): the version lives inside the
 * payload, a repair pass runs on every read, `toPlainEmojiPrefs` rebuilds a
 * plain object inside `saveEmojiPrefs`, and `pushRecent` is a pure
 * `prefs → prefs` mutation.
 *
 * Only the *characters* are stored, never labels or ids: the dataset can be
 * regenerated, re-translated or version-capped underneath a saved list without
 * invalidating it, and an emoji that later leaves the dataset simply stops
 * being offered.
 */
import { isRecord, loadStore, readInt, saveStore, watchStore } from './store-kit';
import { warn } from './log';

export const EMOJI_KEY = 'emojiPicker';
export const EMOJI_SCHEMA_VERSION = 1;

/**
 * How many recents to keep. Deliberately larger than the row the panel shows
 * (RECENT_SHOWN): the tail is what a returning writer's list is rebuilt from
 * after a few one-off insertions push their staples out of view.
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

/**
 * Migrations keyed by the version being upgraded *from*, mirroring
 * `@/lib/presets`. Empty at v1; the loop below already exists so adding one is
 * a single entry rather than a refactor.
 */
const MIGRATIONS: Record<number, (prefs: EmojiPrefs) => EmojiPrefs> = {};

/**
 * Repair whatever `storage.local` (or an imported backup file) hands back.
 * Never throws — a corrupt payload costs the recents list, not the feature.
 */
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
    // A non-string, an empty string, or a repeat: all three would show up as a
    // blank or duplicated cell in the grid, so drop them here rather than
    // making the component defensive.
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

  let prefs: EmojiPrefs = {
    version: readInt(raw.version) ?? 0,
    recent,
  };

  while (prefs.version < EMOJI_SCHEMA_VERSION) {
    const migrate = MIGRATIONS[prefs.version];
    if (migrate === undefined) break;
    prefs = migrate(prefs);
  }
  prefs.version = EMOJI_SCHEMA_VERSION;

  if (repairs.length > 0) warn('emoji recents repaired on read', repairs);
  return prefs;
}

/**
 * Rebuild as a plain object. Called from *inside* `saveEmojiPrefs` so the guard
 * sits at the storage boundary and not at one call site: a Svelte `$state`
 * value is a `Proxy`, which Firefox refuses to structured-clone into
 * `storage.local` while Chrome accepts it — a bug that shows up on one browser
 * only (CLAUDE.md).
 */
export function toPlainEmojiPrefs(prefs: EmojiPrefs): EmojiPrefs {
  return { version: prefs.version, recent: [...prefs.recent] };
}

/**
 * Record a use. Pure: `prefs → prefs`.
 *
 * Most-recent-first, deduped (re-using an emoji moves it to the front rather
 * than adding a second cell), capped at `limit`.
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

export function watchEmojiPrefs(
  onChange: (prefs: EmojiPrefs) => void,
): () => void {
  return watchStore(EMOJI_KEY, normalizeEmojiPrefs, onChange);
}
