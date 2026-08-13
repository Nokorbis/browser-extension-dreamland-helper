/**
 * Recovering the **BBCode** behind a selection made on the rendered post.
 *
 * A selection in the browser gives plain text: pick a coloured, bolded line out
 * of a post and `range.toString()` hands back bare characters, so a naive quote
 * strips the formatting the passage was written with. On a forum whose posts are
 * heavily coloured that is a real loss — hence this module.
 *
 * The raw source is available: the topic review ships each post's BBCode in a
 * hidden `div#message_<post_id>` (`readPostSource` in `@/lib/phpbb`). What is
 * *not* available is a mapping between the two, and one cannot be derived
 * reliably — rendered text and tag-stripped BBCode genuinely diverge. A smiley
 * renders as an `<img>` and so contributes no text at all, while the source
 * still says `:)`; `[img]` renders a picture where the source holds a URL; a
 * nested `[quote]` renders an `X a écrit :` cite line the source never contains.
 *
 * So the design is **align or give up**: locate the selected text inside the
 * tag-stripped source, and return null the moment that fails. The caller then
 * quotes the plain rendered text — exactly the result we would have had without
 * this module. Guessing through a mismatch would emit garbage into someone's
 * post, which is far worse than losing a colour.
 *
 * All of it is pure string work, so it is unit-tested (`source.test.ts`).
 * See docs/adr/0029.
 */
import { nearestOccurrence } from '@/lib/text-search';

/**
 * Tags that must not be *reopened* around a slice.
 *
 * When a selection starts inside `[color=…]`, prepending that opener is what
 * preserves the colour. Doing the same for a `[quote]` would nest a stray quote
 * block inside ours, and for a `[list]` would leave a list wrapper with no
 * items. `*` is here because phpBB's list item never closes at all, so it can
 * never be balanced by appending a closer.
 *
 * Tunable: anything block-structural belongs here, anything inline does not.
 */
const NEVER_REOPENED = new Set(['quote', 'list', '*']);

/** A tag that opens nothing and closes nothing — phpBB's list item. */
const VOID_TAGS = new Set(['*']);

/**
 * What a BBCode tag looks like: `[b]`, `[/b]`, `[*]`, `[color=#BFBFBF]`,
 * `[quote="Aetos" post_id=1 time=2 user_id=3]`. Generic over the *name*, so
 * admin-added BBCodes — of which this forum has several — need no list.
 */
const TAG = /^\[(\/?)(\*|[a-z][a-z0-9_]*)((?:=|\s)[^\]]*)?\]/i;

export interface Tag {
  name: string;
  closing: boolean;
  /** The tag's full source text, kept verbatim so `[color=#BFBFBF]` survives. */
  source: string;
}

/**
 * The tag names the source actually closes somewhere — the vocabulary every
 * scan below is read against.
 *
 * Without it, prose in brackets is eaten: `il rit [nerveusement]` parses as an
 * opener and vanishes from the plain projection, which is exactly the kind of
 * silent divergence that turns into a wrong slice. Requiring a matching closer
 * also mirrors phpBB, whose parser renders an unclosed BBCode as literal text.
 * `[*]` is the one exception, since a list item never closes.
 */
export function closedTagNames(raw: string): Set<string> {
  const names = new Set<string>();
  for (const match of raw.matchAll(/\[\/([a-z][a-z0-9_]*)\]/gi)) {
    names.add(match[1].toLowerCase());
  }
  return names;
}

function tagAt(text: string, index: number, vocabulary: Set<string>): Tag | null {
  const match = TAG.exec(text.slice(index));
  if (match === null) return null;
  const name = match[2].toLowerCase();
  if (name !== '*' && !vocabulary.has(name)) return null;
  return { name, closing: match[1] === '/', source: match[0] };
}

/**
 * The source with its tags removed, plus `map[i]` — the offset in `raw` of the
 * i-th surviving character. Every plain character maps to exactly one raw
 * character, which is what lets a plain range be turned back into a raw slice.
 */
export function stripBBCode(raw: string): { plain: string; map: number[] } {
  const vocabulary = closedTagNames(raw);
  let plain = '';
  const map: number[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '[') {
      const tag = tagAt(raw, i, vocabulary);
      if (tag !== null) {
        i += tag.source.length;
        continue;
      }
    }
    plain += raw[i];
    map.push(i);
    i += 1;
  }
  return { plain, map };
}

/**
 * The text with **all** whitespace removed, plus `map[j]` — the offset in
 * `text` of the j-th surviving character.
 *
 * Removing whitespace rather than collapsing it is what makes the two sides
 * comparable at all: a source newline is a `<br>` in the rendered post, and a
 * `<br>` contributes no text node, so `range.toString()` simply has nothing
 * where the source has `\n`. Collapsing would leave a space on one side and
 * nothing on the other.
 */
export function squeeze(text: string): { squeezed: string; map: number[] } {
  let squeezed = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (/\s/.test(text[i])) continue;
    squeezed += text[i];
    map.push(i);
  }
  return { squeezed, map };
}

/**
 * The tags still open at `index`, outermost first, each as its verbatim opener.
 *
 * A closing tag pops back to its matching opener; one whose opener is missing is
 * ignored, so malformed source degrades instead of throwing.
 */
export function openTagsAt(raw: string, index: number): Tag[] {
  const vocabulary = closedTagNames(raw);
  const stack: Tag[] = [];
  let i = 0;
  while (i < index) {
    if (raw[i] === '[') {
      const tag = tagAt(raw, i, vocabulary);
      if (tag !== null) {
        applyTag(stack, tag);
        i += tag.source.length;
        continue;
      }
    }
    i += 1;
  }
  return stack;
}

/** Push an opener / pop to its matching opener. Void tags do neither. */
function applyTag(stack: Tag[], tag: Tag): void {
  if (VOID_TAGS.has(tag.name)) return;
  if (!tag.closing) {
    stack.push(tag);
    return;
  }
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].name === tag.name) {
      stack.length = i;
      return;
    }
  }
}

/**
 * Copy `body` through, dropping any closing tag whose opener is neither in
 * `body` nor in `seeded` — the openers we are about to prepend. Returns the copy
 * and whatever is still open at the end, so the caller can close it.
 *
 * This is the other half of the repair: prepending openers fixes a slice that
 * *starts* mid-tag, and dropping orphan closers fixes a slice that starts inside
 * a tag we refused to reopen (a `[quote]`, say) and so would otherwise carry a
 * stray `[/quote]`.
 */
function repairBody(
  body: string,
  seeded: Tag[],
  vocabulary: Set<string>,
): { text: string; open: Tag[] } {
  const stack = [...seeded];
  let text = '';
  let i = 0;
  while (i < body.length) {
    if (body[i] === '[') {
      const tag = tagAt(body, i, vocabulary);
      if (tag !== null) {
        const orphan =
          tag.closing &&
          !VOID_TAGS.has(tag.name) &&
          !stack.some((open) => open.name === tag.name);
        if (!orphan) {
          applyTag(stack, tag);
          text += tag.source;
        }
        i += tag.source.length;
        continue;
      }
    }
    text += body[i];
    i += 1;
  }
  return { text, open: stack };
}

/**
 * The BBCode behind `selection`, or null when it can't be located confidently.
 *
 * `hint` is roughly where the selection starts in the post, counted in
 * non-whitespace characters — used to disambiguate a passage that occurs more
 * than once (a repeated line of dialogue). It only has to be approximate.
 */
export function sliceQuotableSource(
  raw: string,
  selection: string,
  hint: number,
): string | null {
  const { plain, map: plainToRaw } = stripBBCode(raw);
  const { squeezed: haystack, map: squeezedToPlain } = squeeze(plain);
  const { squeezed: needle } = squeeze(selection);
  if (needle === '') return null;

  const found = nearestOccurrence(haystack, needle, hint);
  if (found === null) return null;

  const plainStart = squeezedToPlain[found];
  const plainEnd = squeezedToPlain[found + needle.length - 1] + 1;
  const rawStart = plainToRaw[plainStart];
  const rawEnd = plainToRaw[plainEnd - 1] + 1;

  // Reopen what the passage was written inside, verbatim so attribute values
  // survive — minus the block tags that must not be nested into a quote.
  const reopened = openTagsAt(raw, rawStart).filter(
    (tag) => !NEVER_REOPENED.has(tag.name),
  );
  const { text, open } = repairBody(
    raw.slice(rawStart, rawEnd),
    reopened,
    closedTagNames(raw),
  );
  const closers = open
    .map((tag) => `[/${tag.name}]`)
    .reverse()
    .join('');

  return reopened.map((tag) => tag.source).join('') + text + closers;
}
