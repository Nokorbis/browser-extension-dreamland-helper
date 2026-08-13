/**
 * Where the composer sits and which way the topic review reads. A small-prefs instance of
 * the store idiom in `@/lib/store-kit` (docs/adr/0012).
 *
 * The flags are deliberately independent of `sideBySide`: `reverseOrder` always sorts the
 * review oldest-first and *additionally* moves the composer below it when the columns are
 * stacked. Storing "composer at the bottom" separately would let the two disagree.
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
   * Drop the skin's centred fixed width so the page spans the window. Independent of
   * `sideBySide`: it widens a stacked layout just as well.
   */
  fullWidth: boolean;
  /** Only meaningful while `sideBySide` is on, but kept when it is off so re-enabling
   * the column layout restores the side that was chosen. */
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

/** Keyed by the version being upgraded *from*. Empty at v1. */
const MIGRATIONS: Record<number, (prefs: LayoutPrefs) => LayoutPrefs> = {};

function readBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Never throws — a corrupt payload costs the chosen layout, not the feature. Repairs
 * silently, unlike the other stores: every field has a sane default and a bad one is
 * invisible to the writer, so a warning would only be noise on every page load.
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

/** Plain object only: a Svelte `$state` Proxy is not cloneable and Firefox throws. */
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
