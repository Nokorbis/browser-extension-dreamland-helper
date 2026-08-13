/**
 * Re-locating a known string inside a larger text.
 *
 * The problem it solves: hold a passage that *was* at some offset, and a text
 * that may have shifted underneath it. `highlight` re-anchors a stored highlight
 * after a post was edited or after crossing from viewtopic to the topic review.
 * It was lifted out of `highlight/anchor.ts` when a second caller appeared and
 * kept here since — it encodes nothing about what any one feature means, which
 * is the test in docs/adr/0023.
 *
 * Pure arithmetic on strings, so it is unit-tested (`text-search.test.ts`).
 */

/**
 * The index of the occurrence of `needle` in `haystack` nearest to `hint`, or
 * null if absent. Ties prefer the earlier occurrence. If the same text moved
 * because earlier text was added or removed, the match nearest the old offset is
 * almost always the intended one.
 */
export function nearestOccurrence(
  haystack: string,
  needle: string,
  hint: number,
): number | null {
  if (needle === '') return null;
  let best: number | null = null;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    if (best === null || Math.abs(i - hint) < Math.abs(best - hint)) best = i;
    i = haystack.indexOf(needle, i + 1);
  }
  return best;
}
