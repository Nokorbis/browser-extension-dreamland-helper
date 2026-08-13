/**
 * Anchoring a highlight to text that survives a reload and travels between viewtopic and the
 * reply composer. A highlight is a character range `[start, end)` into a post's `.content`
 * text plus the exact `quote` it covered; `serializeSelection` produces that triple and
 * `resolveRange` turns it back into a `Range`.
 *
 * ⚠ The text is the raw concatenation of Text nodes — what `Range.toString()` and
 * `textContent` give, *not* `innerText`, which invents whitespace at block boundaries.
 * phpBB renders the same message HTML on both pages, so the offsets line up; when they don't
 * (a post edited between the two reads, a whitespace quirk) `resolveRange` falls back to
 * searching for the `quote`, degrading to "not shown" rather than "shown on the wrong
 * words". Nothing here mutates the DOM — painting is `render.ts`'s job.
 */
import { nearestOccurrence } from '@/lib/text-search';

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
 * Which text node (by index) and offset within it a character offset lands on, given each
 * node's length in order; null when out of range. A target at a node boundary resolves to
 * the end of the earlier node, an equivalent range position.
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
 * A post's text nodes with their lengths, read once. `render` resolves every highlight on a
 * post against one of these rather than re-walking the tree per range.
 */
export interface ContentText {
  nodes: Text[];
  lengths: number[];
}

export function readContentText(content: HTMLElement): ContentText {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
    nodes.push(n as Text);
  }
  return { nodes, lengths: nodes.map((n) => n.data.length) };
}

function pointAt(
  text: ContentText,
  target: number,
): { node: Text; offset: number } | null {
  const loc = locateOffset(text.lengths, target);
  if (loc === null) return null;
  return { node: text.nodes[loc.index], offset: loc.local };
}

function rangeAt(text: ContentText, start: number, end: number): Range | null {
  const s = pointAt(text, start);
  const e = pointAt(text, end);
  if (s === null || e === null) return null;
  const range = document.createRange();
  range.setStart(s.node, s.offset);
  range.setEnd(e.node, e.offset);
  return range;
}

/**
 * Measured with a range from the start of `content` to the boundary, whose
 * `.toString().length` is exactly that offset. Null if the boundary is unusable.
 */
function offsetOf(content: HTMLElement, node: Node, offset: number): number | null {
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
 * Null when the selection escapes `content`, is collapsed or whitespace-only, or is
 * otherwise degenerate — the caller then shows no toolbar.
 */
export function serializeSelection(
  content: HTMLElement,
  range: Range,
): SerializedRange | null {
  if (!content.contains(range.startContainer) || !content.contains(range.endContainer)) {
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
 * Offset-first: build the range at `[start, end)` and accept it only if its text still
 * matches `quote` (whitespace-normalised), otherwise fall back to the occurrence nearest the
 * old `start`. Null when neither resolves, so an edited post stops painting that highlight.
 */
export function resolveRange(
  text: ContentText,
  start: number,
  end: number,
  quote: string,
): Range | null {
  if (text.nodes.length === 0) return null;

  const direct = rangeAt(text, start, end);
  if (
    direct !== null &&
    normalizeWhitespace(direct.toString()) === normalizeWhitespace(quote)
  ) {
    return direct;
  }

  const full = text.nodes.map((n) => n.data).join('');
  const found = nearestOccurrence(full, quote, start);
  if (found === null) return null;
  return rangeAt(text, found, found + quote.length);
}
