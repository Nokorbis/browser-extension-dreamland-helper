/**
 * Re-locating a known string inside a text that may have shifted underneath it — how
 * `highlight` re-anchors after a post was edited or across the viewtopic/topic-review split.
 */

/**
 * The occurrence of `needle` nearest to `hint`, or null if absent; ties prefer the earlier
 * one. When text moved because earlier text was added or removed, the match nearest the old
 * offset is almost always the intended one.
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
    // Past the hint the distance only grows, so nothing later can win — stop scanning
    // a long post for every occurrence of a common word.
    else if (i > hint) break;
    i = haystack.indexOf(needle, i + 1);
  }
  return best;
}
