# 0028. One shared selection toolbar, features register buttons into it

Status: Accepted

Date: 2026-08-13

## Context

The `highlight` feature owns a small floating row of buttons that appears over a text selection
inside a post: four colour swatches, plus an eraser when the selection overlaps something already
painted. Building it meant building rather more than a row — the `mouseup`/`mousedown`/`scroll`/
`resize` wiring, the `locate` step that decides which post a selection sits in, the off-screen
measure before `placeAnchored`, and the theme watch.

`quote-selection` (see [[0029-quote-a-selected-passage]]) wants a button in exactly that row, over
exactly that selection. [[0023-shared-primitives-in-lib]] already says what to do when a second
feature needs a primitive: promote it to `src/lib` rather than let one feature import from
another. But this case is not only about duplication. Two features each creating their own bar
would put **two floating rows over one selection**, and each would independently decide when to
show and hide it. The thing that has to be shared is not the widget, it is the *singleton*.

Three options were on the table:

1. **Add the button to `highlight`'s toolbar, inside `highlight`.** Smallest change, but quoting
   then lives in a feature it has nothing to do with, dies when highlighting is switched off, and
   inherits `isHighlightApiSupported()`'s early return — a browser too old to *paint* a highlight
   would also refuse to *quote*, for no reason.
2. **A second feature with a second toolbar.** Rejected on sight: two bars, one selection.
3. **Promote the toolbar to `src/lib` as a shared singleton** that features register into.

## Decision

We will move the selection toolbar to **`src/lib/selection-toolbar.ts`** as a lazily-created
singleton, and features will **register a button group** with it rather than build a bar:

```ts
registerSelectionToolbarGroup({ id, buttonsFor: (selection) => ToolbarButton[] }): () => void
```

`buttonsFor` is asked on every selection and returns the buttons that apply; an empty array
withdraws the group, and the bar hides when every group returns one. Groups render in
registration order. The module owns everything that was never highlight-specific — the document
listeners, locating the post (`.content` → `.post` → `readPostId`), placement via `placeAnchored`,
the `chromeFor` painting and the `watchTheme` subscription — and it is created on the first
registration and torn down by the last unregister, so a page with both features off carries no
host and no listeners.

What stays in a feature is what only it knows: `highlight` keeps its palette, its colour names and
the eraser's overlap test; `quote-selection` keeps everything about quoting. The toolbar knows how
to show a row over a selection in a post; it does not know what a highlight or a quote is — the
same boundary [[0023-shared-primitives-in-lib]] drew for `popover.ts`.

`nearestOccurrence` moves out of `highlight/anchor.ts` to `src/lib/text-search.ts` under the same
rule, with its tests.

## Consequences

- **Quoting and highlighting are genuinely independent.** Either can be switched off in the popup
  without touching the other, and quoting works on a browser without the CSS Custom Highlight API.
  That independence is the reason this record exists; it is not achievable with option 1.
- **A new kind of thing now lives in `src/lib`: a singleton with registration**, rather than a
  factory a feature calls. Registration order is the ordering rule, which means the row's left-to-
  right layout is decided by `ALL_FEATURES` — obscure, and worth remembering before adding a third
  group.
- **The row is rebuilt on every show** instead of built once and toggled. `buttonsFor` is dynamic,
  so this is what makes a per-selection row possible at all; at a handful of buttons the cost is
  irrelevant.
- **`src/lib/selection-toolbar.ts` has no automated coverage, by design** — it is DOM and event
  glue, like `popover.ts`, and the suite has no DOM environment. Its geometry is the deliberate
  exception and lives in `anchor-position.ts`, unit-tested. Editing it now means re-verifying
  **two** features by hand, in both themes and both browsers. That obligation grows with each new
  group and should be weighed before adding one.
- **A feature can no longer see the selection it was not offered.** `buttonsFor` receives a
  resolved `PostSelection` and nothing else; anything needing raw selection events would have to
  extend this module rather than wire its own listeners, which is the point.
- This does not supersede [[0020-persistent-text-highlights]]: the toolbar is still a vanilla
  Shadow-DOM control styled through `.style`, exactly as that record decided. Only its owner moved.

Related: [[0023-shared-primitives-in-lib]], [[0020-persistent-text-highlights]],
[[0029-quote-a-selected-passage]], [[0016-svelte-in-content-script]]
