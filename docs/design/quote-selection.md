# Design — Quote a selected passage

Status: **Proposed**, not started. Sketch, not a contract — an ADR follows if it ships.

## Problem

phpBB's quote button quotes the **whole** post. On this forum a post is routinely a couple of
thousand words, so replying to one line means quoting a wall and hand-deleting the rest —
enough friction that people stop quoting and the thread gets harder to follow.

## Design

Not a new feature: **a third button on `highlight`'s existing selection toolbar.**

That toolbar already does all the hard parts. It appears over a selection inside a post's
`.content`, and `highlight/index.ts` already resolves `locate(range) → { content, postId }`
and holds the selected text as `pending.quote`. `toolbar.ts` already builds and places the
row (now via the shared `placeAnchored`). The increment is one swatch-sized button plus the
insertion.

**Insertion.** Build `[quote="<author>"]<selection>[/quote]\n` and hand it to `insertAtRange`
at the composer's current caret — undo-safe, same path presets use.

**Author.** Needs the post's display name. `phpbb.ts` already knows `.username-coloured` for
colour-grab; a `readPostAuthor(post: HTMLElement)` alongside `readPostId` is the natural
addition, and it belongs there rather than in the feature (ADR 0005).

**Which surface first.** Ship the **reply page's topic review** only. The composer is on the
same page, so the whole flow is a caret write. `viewtopic` has no composer, so it would need
to stash the quote and inject it after a navigation — a different, larger problem. Do it
second, if at all.

## Open questions

1. **Coupling.** This puts a quoting concern inside the `highlight` feature. Acceptable
   (they share a selection toolbar) or does the toolbar itself move to `src/lib` with
   highlight and quote as two callers? ADR 0023 would say the latter once there is a second
   caller — which this is.
2. Toggling `highlight` off would take quoting with it. Surprising? Or fine, since the
   toolbar is highlight's?
3. Does the forum's BBCode accept `[quote="Nom"]`, and what happens to a name containing a
   quote character? Check against a real post before building.
4. Nested quotes: quoting a passage that is *itself* inside a `[quote]` — strip or keep?
5. Does the caret land after the quote block, ready to reply? (Almost certainly yes.)

## Effort

Small — the smallest of the remaining ideas, and the one that reuses the most shipped machinery. Mostly
a button, a string, and `readPostAuthor`. Question 1 is the only real design decision.
