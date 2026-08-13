# 0029. Quote a selected passage, recovering its BBCode when possible

Status: Accepted

Date: 2026-08-13

## Context

phpBB's quote button quotes the **whole** post. On this forum a post routinely runs to a couple of
thousand words, so replying to one line means quoting a wall and hand-deleting the rest — enough
friction that people stop quoting, and threads get harder to follow.

Three questions had to be settled before a "quote just this passage" button could exist.

**Where it can work.** A quote has to land in a composer. `viewtopic` has none, so quoting from
the thread page would mean stashing the passage somewhere and injecting it after a navigation.
The reply page is different: its topic review and its composer are on the same page, so the whole
flow is one write at the caret.

**What to emit.** `[quote="Nom"]…[/quote]` renders an attribution and nothing else. phpBB's own
button emits more: its topic review carries the attributes inline, verified against the live forum
(`real_snippets/posting.html:848`):

```
onclick="addquote(201246, 'Aetos', 'a écrit', {post_id:201246,time:1784931867,user_id:1939});"
```

A quote carrying that triple renders with the "a écrit" header **and** an arrow back to the source
post.

**What the selection actually gives us.** A browser selection over a rendered post yields plain
text. Posts here are heavily formatted — `color-grab` exists precisely because colour carries
meaning on this forum — so quoting the rendered text silently strips what the passage was written
with. The raw source *is* reachable: the topic review ships each post's BBCode in a hidden
`div#message_<post_id>` (`posting.html:869`), which is what `addquote` itself quotes from.

What is not reachable is a reliable mapping between the two. Rendered text and tag-stripped BBCode
genuinely diverge: a smiley renders as an `<img>` and contributes no text while the source still
says `:)`; `[img]` renders a picture where the source holds a URL; a nested `[quote]` renders an
`X a écrit :` cite line the source never contains; and `<br>` contributes no text node at all
where the source has a newline.

## Decision

We will ship `quote-selection` as its own feature, contributing **one button to the shared
selection toolbar** ([[0028-shared-selection-toolbar]]), with three specific choices.

**Reply page only.** `findMessageTextarea()` returning null is the entire gate, plus a check that
the post sits inside `#topicreview`. Quoting from `viewtopic` is left for later, if at all.

**Emit phpBB's own quote form.** `readQuoteAttributes` in `phpbb.ts` reads `post_id`/`time`/
`user_id` off the review's own `addquote(…)` handler, and `formatQuote` emits
`[quote="Nom" post_id=… time=… user_id=…]`, escaping the author value the way phpBB's
`format_quote_attribute_value` does. The author itself comes from `readPostAuthorName` — the same
name appears as `addquote`'s second argument, but *there* it is a JS string literal with `\uXXXX`
escapes, so the rendered text is the cheaper source of truth. It degrades one step at a time:
without attributes, `[quote="Nom"]`; without an author, a bare `[quote]`.

**Recover the BBCode, and give up rather than guess.** `source.ts` strips the raw source to a
plain projection with an index map, removes **all** whitespace from both sides (not collapses it —
a `<br>` leaves nothing in the rendered text where the source has `\n`), locates the selection with
`nearestOccurrence` hinted by roughly where it starts in the post, maps the match back to raw
offsets, and repairs the slice: reopen the tags it started inside, verbatim so `[color=#BFBFBF]`
keeps its value, and close whatever it leaves open. `quote`, `list` and `*` are never reopened —
that would nest a stray block inside our quote — and closers orphaned by that refusal are dropped.

A tag is only recognised if the source closes that name somewhere, so `il rit [nerveusement]`
stays prose. That rule also mirrors phpBB, whose parser renders an unclosed BBCode literally.

**When the two cannot be aligned, `sliceQuotableSource` returns null and the caller quotes the
plain rendered text** — exactly the result we would have had without the module. This is the whole
safety property: a wrong slice would put broken markup into someone's post, which is far worse than
losing a colour.

## Consequences

- **Quoting a passage is indistinguishable from using the forum's own button**, backlink included.
  That also means it inherits phpBB's rendering wholesale, including any future change to how
  quotes are displayed.
- **Formatting recovery is best-effort and silent either way.** A passage containing a smiley or an
  `[img]` quietly comes back as plain text. That is the intended behaviour, but it is invisible —
  there is no signal to the user that the fallback fired, and adding one would mean explaining a
  distinction they have no reason to care about.
- **`readQuoteAttributes` reads an `onclick` attribute**, which is markup phpBB could restyle. It
  fails to null rather than throwing, so the worst case is a quote without a backlink. The
  `real_snippets/` capture is the evidence for the current shape, and re-verifying it is the first
  step if attributions ever come back bare.
- **The tag scanner is generic, not a vocabulary**, so admin-added BBCodes are handled without a
  list — but a *newly added* BBCode that is legitimately unclosed would be treated as prose. That
  is the same trade phpBB makes.
- **`source.ts` and `bbcode.ts` are pure and unit-tested**; everything else in the feature is DOM
  glue verified by hand, matching the scoping rule in CLAUDE.md. The null cases in `source.test.ts`
  are load-bearing — they pin the "give up" half of the contract, which is the half that keeps bad
  markup out of posts.
- **Quoting from `viewtopic` remains unbuilt**, and building it would need a different mechanism
  (stash across a navigation) plus a different source of raw BBCode, since `div#message_<id>` does
  not exist there.

Related: [[0028-shared-selection-toolbar]], [[0005-centralize-phpbb-dom]],
[[0013-undo-safe-text-insertion]], [[0023-shared-primitives-in-lib]]
