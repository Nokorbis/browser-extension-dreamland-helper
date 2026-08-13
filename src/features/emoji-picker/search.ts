/**
 * Finding an emoji by name. Pure and DOM-free, which is what makes it the part of this
 * feature worth unit-testing.
 *
 * **Bilingual**, because the forum is French but many writers know emoji by their English
 * names, so a query is matched against both labels and the merged keyword blob. And
 * **accent- and punctuation-blind**, since nobody types `œ` or `à` into a search box in a
 * hurry, so both sides are folded before comparing.
 */
import type { EmojiRecord } from './types';

/**
 * Lowercase, accents removed, ligatures spelled out, punctuation flattened to spaces.
 *
 * NFD decomposes `é` into `e` plus a combining mark `\p{M}` strips, but leaves `œ` and `æ`
 * alone — Unicode treats them as letters in their own right — so those two are spelled out
 * by hand. Without it, "coeur" would never find "cœur rouge".
 */
export function fold(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      // Everything that isn't a letter or digit becomes a separator, so "d'accord"
      // splits on the apostrophe and `hasWord` below can rely on plain spaces.
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
  );
}

/**
 * Match tiers, best first; the value is the sort key. Plain constants rather than an `enum`:
 * WXT builds through esbuild with `isolatedModules`, where a `const enum` cannot be inlined
 * and silently degrades into a runtime object.
 */
const TIER = {
  exactLabel: 0,
  labelPrefix: 1,
  labelWord: 2,
  labelSubstring: 3,
  keywordWord: 4,
  keywordSubstring: 5,
  noMatch: 6,
} as const;

/** True when `term` starts a word in the already-folded `haystack`. */
function hasWord(haystack: string, term: string): boolean {
  return haystack.startsWith(term) || haystack.includes(` ${term}`);
}

/**
 * Cached by record identity: folding ~1900 records × 3 fields on every keystroke would be
 * the only expensive thing this feature does. A `WeakMap`, so it costs nothing once the
 * dataset is dropped and the function stays pure from the outside.
 */
interface Folded {
  labels: string[];
  keywords: string;
}
const foldedCache = new WeakMap<EmojiRecord, Folded>();

function foldRecord(record: EmojiRecord): Folded {
  const cached = foldedCache.get(record);
  if (cached !== undefined) return cached;
  const folded: Folded = {
    labels: [fold(record.fr), fold(record.en)],
    keywords: fold(record.k),
  };
  foldedCache.set(record, folded);
  return folded;
}

/** How well one folded term matches one record. `noMatch` means it doesn't. */
function scoreTerm(folded: Folded, term: string): number {
  let best: number = TIER.noMatch;
  for (const label of folded.labels) {
    if (label === term) return TIER.exactLabel;
    if (label.startsWith(term)) best = Math.min(best, TIER.labelPrefix);
    else if (hasWord(label, term)) best = Math.min(best, TIER.labelWord);
    else if (label.includes(term)) best = Math.min(best, TIER.labelSubstring);
  }
  if (best !== TIER.noMatch) return best;

  if (hasWord(folded.keywords, term)) return TIER.keywordWord;
  if (folded.keywords.includes(term)) return TIER.keywordSubstring;
  return TIER.noMatch;
}

/**
 * Best first, at most `limit`. A multi-word query is an **AND**: every term must match, and
 * the record is ranked by its *worst* term, so "chat noir" beats a record that nails "chat"
 * but only brushes "noir" in a keyword. Ties keep the dataset's CLDR order.
 *
 * An empty query returns nothing — the caller shows a category instead, rather than
 * pretending the whole set is a result.
 */
export function searchEmoji(
  all: readonly EmojiRecord[],
  query: string,
  limit: number,
): EmojiRecord[] {
  const terms = fold(query)
    .split(' ')
    .filter((term) => term !== '');
  if (terms.length === 0 || limit <= 0) return [];

  const scored: { record: EmojiRecord; tier: number; index: number }[] = [];
  for (const [index, record] of all.entries()) {
    const folded = foldRecord(record);

    let worst: number = TIER.exactLabel;
    for (const term of terms) {
      const tier = scoreTerm(folded, term);
      if (tier === TIER.noMatch) {
        worst = TIER.noMatch;
        break;
      }
      worst = Math.max(worst, tier);
    }
    if (worst === TIER.noMatch) continue;

    scored.push({ record, tier: worst, index });
  }

  scored.sort((a, b) => a.tier - b.tier || a.index - b.index);
  return scored.slice(0, limit).map((entry) => entry.record);
}
