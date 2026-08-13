/**
 * The reply page's layout preferences: where the composer sits and which way
 * the topic review reads.
 *
 * A feature that owns *data* gets its own `storage.local` key and its own typed
 * module rather than a field in the settings blob — see
 * docs/adr/0012-feature-owned-data-stores.md. Like `@/lib/emoji-recents` this is
 * a small-prefs instance of that idiom rather than the full record store: the
 * version lives inside the payload, a repair pass runs on every read, and
 * `toPlainLayoutPrefs` rebuilds a plain object inside `saveLayoutPrefs`.
 *
 * The three flags are deliberately independent of `sideBySide`'s own effect:
 * `reverseOrder` always sorts the review oldest-first, and *additionally* moves
 * the composer below it when the columns are stacked. Storing "composer at the
 * bottom" separately would let the two disagree.
 */
import { isRecord, loadStore, readInt, runMigrations, saveStore, watchStore } from './store-kit';

export const COMPOSER_LAYOUT_KEY = 'composerLayout';
export const COMPOSER_LAYOUT_SCHEMA_VERSION = 1;

/** Which side of the review the composer takes when the two sit side by side. */
export type ComposerSide = 'left' | 'right';

export interface LayoutPrefs {
  version: number;
  /** Review oldest-first, and composer below it when the columns are stacked. */
  reverseOrder: boolean;
  /** Composer beside the review instead of above or below it. */
  sideBySide: boolean;
  /**
   * Drop the forum skin's centred fixed width, so the page — one column or two
   * — spans the window. Independent of `sideBySide`: it widens a stacked layout
   * just as well.
   */
  fullWidth: boolean;
  /** Only meaningful while `sideBySide` is on. Kept when it is off, so
   * re-enabling the column layout restores the side that was chosen. */
  composerSide: ComposerSide;
}

/** A factory, not a constant — callers mutate what they get back. */
export function emptyLayoutPrefs(): LayoutPrefs {
  return {
    version: COMPOSER_LAYOUT_SCHEMA_VERSION,
    reverseOrder: false,
    sideBySide: false,
    fullWidth: false,
    composerSide: 'right',
  };
}

/**
 * Migrations keyed by the version being upgraded *from*, mirroring
 * `@/lib/emoji-recents`. Empty at v1; `runMigrations` already runs below so
 * adding one is a single entry rather than a refactor.
 */
const MIGRATIONS: Record<number, (prefs: LayoutPrefs) => LayoutPrefs> = {};

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Repair whatever `storage.local` hands back. Never throws — a corrupt payload
 * costs the chosen layout, not the feature. Unlike the other stores this one
 * repairs silently: every field has a sane default and a bad one is invisible
 * to the writer, so a warning would only be noise on every page load.
 */
export function normalizeLayoutPrefs(raw: unknown): LayoutPrefs {
  if (!isRecord(raw)) return emptyLayoutPrefs();

  const defaults = emptyLayoutPrefs();
  const prefs = runMigrations(
    {
      version: readInt(raw.version) ?? 0,
      reverseOrder: readBool(raw.reverseOrder, defaults.reverseOrder),
      sideBySide: readBool(raw.sideBySide, defaults.sideBySide),
      fullWidth: readBool(raw.fullWidth, defaults.fullWidth),
      composerSide: raw.composerSide === 'left' ? 'left' : defaults.composerSide,
    },
    readInt(raw.version),
    COMPOSER_LAYOUT_SCHEMA_VERSION,
    MIGRATIONS,
  );
  prefs.version = COMPOSER_LAYOUT_SCHEMA_VERSION;
  return prefs;
}

/**
 * Rebuild as a plain object. Called from *inside* `saveLayoutPrefs` so the guard
 * sits at the storage boundary and not at one call site — see the `$state`
 * `DataCloneError` note in docs/adr/0012 and CLAUDE.md.
 */
export function toPlainLayoutPrefs(prefs: LayoutPrefs): LayoutPrefs {
  return {
    version: prefs.version,
    reverseOrder: prefs.reverseOrder,
    sideBySide: prefs.sideBySide,
    fullWidth: prefs.fullWidth,
    composerSide: prefs.composerSide,
  };
}

export async function loadLayoutPrefs(): Promise<LayoutPrefs> {
  return loadStore(COMPOSER_LAYOUT_KEY, normalizeLayoutPrefs);
}

export async function saveLayoutPrefs(prefs: LayoutPrefs): Promise<void> {
  await saveStore(COMPOSER_LAYOUT_KEY, toPlainLayoutPrefs(prefs));
}

export function watchLayoutPrefs(onChange: (prefs: LayoutPrefs) => void): () => void {
  return watchStore(COMPOSER_LAYOUT_KEY, normalizeLayoutPrefs, onChange);
}
