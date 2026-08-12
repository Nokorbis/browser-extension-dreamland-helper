/**
 * The shape of `public/emoji/emoji.json`, as produced by `scripts/gen-emoji.mjs`
 * and repaired by `data.ts`.
 *
 * Field names are one or two characters because the file is downloaded at
 * runtime and the keys repeat ~1900 times — `"c"`/`"g"`/`"k"` save roughly a
 * fifth of the payload over spelled-out names. Everything reading them goes
 * through this file, so the terseness stops here.
 */

/** One CLDR category, in display order. */
export interface EmojiGroup {
  /** CLDR key, e.g. `smileys-emotion`. Stable across regenerations. */
  id: string;
  /** French display name. */
  fr: string;
  /** English display name. */
  en: string;
}

export interface EmojiRecord {
  /** The emoji itself — the only thing ever inserted or persisted. */
  c: string;
  /** Index into `EmojiData.groups`. */
  g: number;
  /** French CLDR label. */
  fr: string;
  /** English CLDR label. */
  en: string;
  /** Space-joined search keywords from every locale, minus words already in the labels. */
  k: string;
}

export interface EmojiData {
  version: number;
  groups: EmojiGroup[];
  emoji: EmojiRecord[];
}

export function emptyEmojiData(): EmojiData {
  return { version: 0, groups: [], emoji: [] };
}
