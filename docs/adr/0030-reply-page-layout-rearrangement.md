# 0030. The reply page is re-arranged by wrapping, never by re-rendering

Status: Accepted

Date: 2026-08-13

## Context

phpBB renders `posting.php?mode=reply` in one fixed shape: the composer on top, the topic review
below it, posts newest-first. On this forum a post runs to thousands of words, so answering one
means scrolling between what is being written and what is being answered, and reading the thread
backwards.

The `composer-layout` feature offers two choices above the form — put the composer *below* the
review with the posts oldest-first, and put it *beside* the review on a chosen side. Every other
feature so far either reads the forum's DOM (`color-grab`), paints over it
without touching it (`highlight`), or adds a control of its own to it (`bbcode-presets`,
`emoji-picker`). This is the first that changes **where the forum's own elements sit**, and the
page it changes is the one holding text the writer has already typed. Three questions had to be
settled before writing any of it:

1. **How to move the two halves.** Re-rendering them — reading the composer's markup and building
   it again in a new container — would drop the textarea's text, break phpBB's own script
   references, and re-submit nothing (the hidden `form_token` and `creation_time` fields live in
   that half). Placing them purely in CSS with `grid` was the alternative: `#postform`'s children
   have no wrapper of their own, so each would need an explicit `grid-row`, and the row a child
   lands on depends on how many siblings phpBB rendered — which varies with the `#preview` panel,
   attachment panels and error boxes.
2. **How to reverse the posts.** `#topicreview`'s posts are anchored by numeric post id in
   `highlight`, and located by post id by anything reading the review; a DOM reorder is a mutation
   all of them would have to survive.
3. **Where the checkboxes go.** `<form id="postform">` POSTs every named control inside it and
   submits on any control that is not `type="button"` — the hazard `createFormatButton` exists to
   make unrepresentable.

## Decision

**Wrap, don't re-render.** At setup the feature inserts one wrapper and two column `div`s into
`#postform` and **moves** the form's existing children into them. Elements are moved, never
re-created: the textarea keeps its value, the hidden fields keep their place in the form, and
phpBB's scripts keep their references. The already-executed inline `<script>` inside `#topicreview`
moves with it and does not re-run. Teardown moves everything back and drops the wrappers.

**The split is positional, at `h3#review`.** Every child of the form before that heading is the
composer half; the heading and everything after it is the review half. Reading the boundary off the
DOM instead of listing the composer's own ids is what makes a `#preview` panel — inserted near the
top after an Aperçu — land in the composer column with no extra code. `findReviewHeading()` joins
`src/lib/phpbb.ts` as the one new piece of forum knowledge.

With the two halves wrapped, placement is four flex directions on the wrapper (`column`,
`column-reverse`, `row`, `row-reverse`), toggled by class. Below 900px a media query forces the
stacked pair back, so side-by-side never survives into a width that cannot hold it.

Side by side, the two columns are **equal height**: they stretch to the taller one (the composer)
and the review fills that height with `flex: 1 1 0` instead of prosilver's fixed
`.topicreview { height }`, scrolling inside its own box. The zero basis is load-bearing in the
other direction too — it stops a hundred-post thread from stretching the pair to a hundred posts
tall. Stacked, prosilver's own height is the right one, so this is scoped to the wide media query.

**Full width is a break-out on the wrapper**, not a relaxed `#wrap`. Widening the skin's centred
container is the shorter rule, but it restyles an element the feature does not own and drags the
forum's header, nav and footer wide with it. Instead the wrapper keeps `width: auto` and pushes
both margins out by `calc(50% - var(--dlh-viewport-width) / 2)`, which makes it exactly as wide as
the window while every other element on the page stays where the skin put it. The viewport width
is **measured** (`document.documentElement.clientWidth`, kept current on `resize`) rather than
taken from `100vw`, which includes the vertical scrollbar and would add a horizontal one. It is
independent of the column count: one column or two, the layout spans the window.

**The post order flips in CSS**: `#topicreview { display: flex; flex-direction: column-reverse }`.
No node moves, so `highlight`'s ranges and every other feature's post lookups are untouched by the
setting and the toggle is instant.

**The controls live outside the form**, mounted immediately before `#postform` as a Shadow-DOM bar
built through `@/lib/shadow-ui` — the vanilla `.style` path of [[0016-svelte-in-content-script]],
themed off the forum's own dark class. Nothing they carry can be POSTed or submit anything.

Preferences are a feature-owned store (`src/lib/composer-layout.ts`, key `composerLayout`) under
[[0012-feature-owned-data-stores]], in the small-prefs shape `@/lib/emoji-recents` uses.

## Consequences

- **The rules that place the page are page-level CSS**, in a `<style>` injected into `<head>` like
  `highlight/render.ts`'s. They style the forum's own elements, so a shadow root cannot hold them;
  this forum's CSP allows it ([[0016-svelte-in-content-script]]).
- **`#postform` gains two nested `div`s while the feature is on.** Anything selecting a *direct*
  child of the form breaks. Nothing does today, and `phpbb.ts` reaches the composer through
  `findMessageTextarea().form` rather than by structure — but a future selector must not assume the
  form's children are phpBB's.
- **The reversed reading order is visual only.** DOM order — and therefore tab order and the order
  a screen reader reads — stays newest-first. Reversing the nodes instead would fix that and cost
  the guarantee that highlights and quoting are untouched; the trade was made deliberately, and the
  posts are static prose either way.
- **phpBB's own "Agrandir / Réduire" control still resizes `#topicreview`**, now inside a flex
  container reading bottom-up. It works, but the collapsed view shows a different end of the thread
  than it does unreversed — a consequence to accept, not a bug to chase.
- **Feature-owned prefs are deliberately absent from the export bundle.** `ExportBundleV1`
  ([[0021-json-export-import]]) is settings, presets and emoji recents; adding three flags would
  cost a bundle version bump for a preference that is re-set with two clicks.
- **The layout glue has no automated coverage, by design** — it is DOM work and the suite has no
  DOM environment ([[0028-shared-selection-toolbar]] made the same call). Only the prefs store is
  unit-tested. Editing `layout.ts`, `styles.ts` or `controls.ts` means re-verifying the four
  combinations by hand, in both themes and both browsers, *and* re-posting a reply.

Related: [[0012-feature-owned-data-stores]], [[0016-svelte-in-content-script]],
[[0028-shared-selection-toolbar]], [[0021-json-export-import]]
