# 0020. Persistent text highlights via the CSS Custom Highlight API

Status: Accepted

Date: 2026-07-25

## Context

Feature #2 lets a writer select a passage inside a post's message body and keep it highlighted
in a chosen colour — across reloads, and shared between the thread page (`viewtopic.php`) and
the reply composer's topic review (`posting.php`). Only message content is annotatable, and
highlights are cleared per-thread or globally.

Two hard questions had to be settled.

**How to paint a highlight.** The obvious approach — wrap the selected text in a styled
`<span>` — mutates phpBB's post DOM. That means splitting a range across text nodes, unwrapping
cleanly on clear, and risking interference with the forum's own scripts (spoiler toggles, quote
handling) and with other features that read the post DOM (`color-grab`). It also has to guard
against double-wrapping on re-render.

**How to anchor a highlight so it survives a reload and travels between pages.** A highlight
needs a stable identity for *which post* and *which characters*. Text-range anchoring across
reloads is the classic web-annotation problem.

The enabling observation: phpBB encodes each post's numeric id identically as `#p<id>` on
viewtopic and `#pr<id>` in the topic review, and renders the same stored message HTML into
`.content` in both places. So a range expressed relative to `.content` text lines up across the
two pages for free.

## Decision

**Paint with the CSS Custom Highlight API** (`CSS.highlights` + `::highlight()`), not
span-wrapping. `render.ts` registers one `Highlight` per colour in the document registry and
injects **one page-level `<style>`** with a `::highlight(dlh-hl-<hex>)` rule per colour. Nothing
in the post DOM is ever mutated; teardown deletes exactly the registry entries we own and
removes the `<style>`. This requires **Firefox 140+ / Chrome 105+**; on older browsers
`isHighlightApiSupported()` is false and the feature **no-ops** — it does not offer to create
highlights it could not display. (The popup's clear buttons still work; they only touch
storage.)

The `<style>` must be page-level: `::highlight()` is a pseudo-element rule the page's own style
engine applies to the post text, so it cannot live in a shadow root or an element's `.style`.
An injected `<style>` in the isolated world is CSP-safe on this forum, established in
[[0016-svelte-in-content-script]].

**Anchor by numeric post id + a character range into `.content` text + the quoted text.** A
highlight stores `{ postId, start, end, quote, topicId, color }`. `anchor.ts` serializes a
selection to offsets into the concatenation of `.content`'s Text nodes, and rebuilds it
offset-first, validating against `quote` (whitespace-normalised); when the offsets don't line
up it falls back to searching for `quote` nearest the old offset. So an edited post degrades to
"not shown" rather than "shown on the wrong words", and cross-page whitespace differences don't
break resolution.

**Persist in a feature-owned store** (`src/lib/highlights.ts`, key `highlights`) following the
idiom [[0012-feature-owned-data-stores]] set: version inside the payload, a flat id-keyed
record, a normalize-on-read repair pass, and pure `store → store` mutations. `topicId` is
stored so the popup can clear one discussion from the active tab's `t=` param without reading
the page. All forum-DOM knowledge (`readPostId`, `findPostContentElements`, `readTopicId`) lives
in `phpbb.ts` per [[0005-centralize-phpbb-dom]].

The selection toolbar and the corner clear control are **vanilla Shadow-DOM controls** styled
through `.style` (the `server-down-modal` pattern), not Svelte — they are small and static,
which is exactly the case [[0016-svelte-in-content-script]] keeps out of the shadow-root Svelte
path.

## Consequences

- **Highlighting needs a 2025-era browser.** Firefox < 140 / Chrome < 105 get nothing. Accepted:
  the API is the whole reason the post DOM stays untouched, and the degradation is silent and
  safe rather than broken.
- **The post DOM is never mutated**, so highlights can't fight quote/spoiler scripts or
  `color-grab`, clear instantly, and never double-apply on re-render. Re-rendering on every
  store change simply rebuilds the ranges — cheap at realistic counts.
- **Overlapping highlights paint last-wins** (registry/priority order); the store allows
  overlaps and the eraser removes any highlight intersecting the selection. Good enough; a merge
  model was not worth the complexity for v1.
- **An edited post silently stops painting** the highlights whose text moved beyond what the
  quote-search fallback recovers. The records are *kept*, not deleted — conservative, matching
  the preset store's "never lose the user's data to fix a structural problem" stance.
- **Highlights are local, not synced** (same trade-off and reasoning as
  [[0012-feature-owned-data-stores]]).
- Two writers now exist for this store (content script + popup). Today both do read-modify-write
  of the whole store and last-write-wins is acceptable; a future per-highlight editing surface
  would have to reckon with that.

Related: [[0012-feature-owned-data-stores]], [[0016-svelte-in-content-script]], [[0005-centralize-phpbb-dom]], [[0019-color-grab-augments-native-palette]]
