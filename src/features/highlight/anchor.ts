/**
 * Anchoring a highlight to text that survives a reload and travels between the
 * thread page and the reply composer.
 *
 * A highlight is stored as a character range `[start, end)` into a post's
 * `.content` **text** — the concatenation of its Text nodes in document order —
 * plus the exact `quote` it covered. `serializeSelection` turns a live DOM
 * selection into that triple; `resolveRange` turns it back into a `Range` at
 * load time.
 *
 * The text is the raw concatenation of Text nodes (what `Range.toString()` and
 * `Node.textContent` give — *not* `innerText`, which invents whitespace at block
 * boundaries). phpBB renders the same stored message HTML into `.content` on both
 * viewtopic and the topic review, so those offsets line up across the two pages.
 * When they don't — a post edited between the two reads, or a whitespace quirk —
 * `resolveRange` falls back to searching for the `quote` string, so a highlight
 * degrades to "not shown" rather than "shown on the wrong words". Nothing here
 * mutates the DOM; painting is the CSS Custom Highlight API's job (`render.ts`).
 *
 * `locateOffset` and `nearestOccurrence` are the pure arithmetic, split out and
 * unit-tested (`anchor.test.ts`); the Range/TreeWalker glue around them is
 * DOM work verified by hand (the test env has no DOM — see CLAUDE.md).
 */

export interface SerializedRange {
  start: number;
  end: number;
  quote: string;
}

/** Collapse whitespace runs so a newline-vs-space boundary difference matches. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Which text node (by index) and offset within it a character offset lands on,
 * given each node's length in order. Returns null when `target` is out of range.
 * A target at a node boundary resolves to the end of the earlier node, which is
 * an equivalent range position.
 */
export function locateOffset(
  lengths: number[],
  target: number,
): { index: number; local: number } | null {
  if (target < 0) return null;
  let acc = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    if (target <= acc + lengths[i]) return { index: i, local: target - acc };
    acc += lengths[i];
  }
  return null;
}

/**
 * The index of the occurrence of `quote` in `full` nearest to `hint`, or null if
 * absent. Ties prefer the earlier occurrence. Used as the re-anchor fallback: if
 * the same text moved (earlier text was added/removed), the nearest match to the
 * old offset is almost always the intended one.
 */
export function nearestOccurrence(
  full: string,
  quote: string,
  hint: number,
): number | null {
  if (quote === '') return null;
  let best: number | null = null;
  let i = full.indexOf(quote);
  while (i !== -1) {
    if (best === null || Math.abs(i - hint) < Math.abs(best - hint)) best = i;
    i = full.indexOf(quote, i + 1);
  }
  return best;
}

function textNodesOf(content: HTMLElement): Text[] {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    nodes.push(n as Text);
  }
  return nodes;
}

function pointAt(
  nodes: Text[],
  target: number,
): { node: Text; offset: number } | null {
  const loc = locateOffset(
    nodes.map((n) => n.data.length),
    target,
  );
  if (loc === null) return null;
  return { node: nodes[loc.index], offset: loc.local };
}

function rangeAt(nodes: Text[], start: number, end: number): Range | null {
  const s = pointAt(nodes, start);
  const e = pointAt(nodes, end);
  if (s === null || e === null) return null;
  const range = document.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  return range;
}

/**
 * The character offset of a DOM boundary `(node, offset)` into `content`'s text.
 * Measured with a range from the start of `content` to the boundary, whose
 * `.toString().length` is exactly that offset. Null if the boundary is unusable.
 */
function offsetOf(
  content: HTMLElement,
  node: Node,
  offset: number,
): number | null {
  try {
    const r = document.createRange();
    r.setStart(content, 0);
    r.setEnd(node, offset);
    return r.toString().length;
  } catch {
    return null;
  }
}

/**
 * Serialize a live selection to a `[start, end)` range + quote, relative to
 * `content`. Returns null if the selection escapes `content`, is collapsed /
 * whitespace-only, or is otherwise degenerate — the caller shows no toolbar.
 */
export function serializeSelection(
  content: HTMLElement,
  range: Range,
): SerializedRange | null {
  if (
    !content.contains(range.startContainer) ||
    !content.contains(range.endContainer)
  ) {
    return null;
  }
  const start = offsetOf(content, range.startContainer, range.startOffset);
  const end = offsetOf(content, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;

  const quote = range.toString();
  if (normalizeWhitespace(quote) === '') return null;

  return { start, end, quote };
}

/**
 * Rebuild a `Range` for a stored highlight inside `content`.
 *
 * Offset-first: build the range at `[start, end)` and accept it only if its text
 * still matches `quote` (whitespace-normalised). Otherwise fall back to the
 * `quote` occurrence nearest the old `start`. Returns null when neither resolves,
 * so an edited post simply stops painting that highlight.
 */
export function resolveRange(
  content: HTMLElement,
  start: number,
  end: number,
  quote: string,
): Range | null {
  const nodes = textNodesOf(content);
  if (nodes.length === 0) return null;

  const direct = rangeAt(nodes, start, end);
  if (direct !== null && normalizeWhitespace(direct.toString()) === normalizeWhitespace(quote)) {
    return direct;
  }

  const full = nodes.map((n) => n.data).join('');
  const found = nearestOccurrence(full, quote, start);
  if (found === null) return null;
  return rangeAt(nodes, found, found + quote.length);
}
