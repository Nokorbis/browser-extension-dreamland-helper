# 0023. Cross-feature primitives are promoted to `src/lib`

Status: Accepted

Date: 2026-08-12

## Context

Until the sixth feature, every feature under `src/features/*` was genuinely self-contained: the
only things they shared were `src/lib/phpbb.ts` (forum DOM), `src/lib/textarea.ts` (undo-safe
insertion) and `src/lib/storage.ts`. Each of those was in `src/lib` from the start, because each
was written *knowing* it would be shared.

The emoji picker broke that pattern three times over, because it is the first feature that is
structurally a *second copy* of an existing one. It writes into a textarea like `bbcode-presets`,
it claims a keyboard shortcut like `editor-shortcuts`, and it renders a themed panel in a shadow
root like both. Three concerns were already implemented, well, inside a feature folder:

1. **Keyboard-combo primitives.** `editor-shortcuts/keymap.ts` owned the modifier rows, the
   layout-independent letter reading and — the dangerous one — `RESERVED_LETTERS`, the list of
   letters no shortcut may claim. A second feature picking a key needed all of it. Copying
   `RESERVED_LETTERS` is how a binding quietly ends up on Ctrl+Z, and worse, two private copies
   mean **nothing can check the two features against each other** — a collision between
   `Alt+I` and some future keymap entry would be found by a user, not by CI.
2. **The `--dlh-*` colour palette.** It lived in `bbcode-presets/palette.css` and was already
   being imported by the popup and the options page, i.e. it had stopped being that feature's
   property some time ago.
3. **Anchored-popover plumbing.** `bbcode-presets`' toolbar menu and the emoji picker's panel are
   the same object: a Svelte surface in a shadow root, `position: fixed` against a trigger button
   in the page's light DOM, dismissed on outside click or Escape, re-measured on scroll and
   resize, mounted through an async `createShadowRootUi` that has to survive a navigation landing
   mid-`await`. Written twice, that is ~120 lines duplicated **including five verbatim-copied
   comment blocks** — among them the note explaining why closing on Escape must restore focus but
   closing on an outside click must not. Two copies of a subtlety that fine will not stay in step.

The alternative considered for each was to let the second feature import from the first —
`import { RESERVED_LETTERS } from '@/features/editor-shortcuts/keymap'`. It compiles, and it is
the wrong dependency edge: it makes deleting or disabling a feature break an unrelated one, and it
quietly promotes one feature to a library without saying so.

## Decision

We will promote a primitive to `src/lib` as soon as a **second** feature needs it, rather than
importing across `src/features/*` folders. Three modules move or appear under this rule:

- **`src/lib/keys.ts`** — modifier rows, `readRow`/`readLetter`, `RESERVED_LETTERS`, and the
  tooltip / `aria-keyshortcuts` spellings. `editor-shortcuts/keymap.ts` keeps the one thing only
  it knows: which BBCode each combo drives. It does **not** re-export the shared names, so there
  is exactly one import path for them.
- **`src/lib/palette.css`** — moved out of `bbcode-presets/`, unchanged.
- **`src/lib/popover.ts`** — `createPopover`, owning anchoring, dismissal, scroll/resize
  following, and the shadow-root mount. What differs stays at the call site: the trigger element,
  what opening means for the feature's state, `aria-expanded`, and the optional `fit` (flip above
  the trigger and clamp horizontally) that only the emoji picker turns on, because only its chat
  surface sits at the bottom of the page.

The boundary, so this does not become a dumping ground: **`src/lib` takes what is feature-agnostic**
— arithmetic, event plumbing, and knowledge of the browser or the forum. Anything that encodes what
*one* feature means stays in its folder. `popover.ts` knows how to anchor a surface; it does not
know what a preset is. `keys.ts` knows which letters are unsafe; it does not know that `Alt+Q` is
quote.

Alongside `keys.ts` comes the check that motivated it: **`src/lib/keys.test.ts` holds a `CLAIMED`
list of every combo the extension binds, with its owner**, and asserts no reserved letter and no
cross-feature collision. Any feature claiming a key registers there. This is the one place the
whole set is checked, and it only exists because the primitives are shared.

## Consequences

The collision that could not previously be detected now fails CI instead of shipping. That is the
main win, and it is why `keys.ts` is not merely tidier than a copy.

`src/features/*` folders stay free of edges to each other, so a feature remains deletable. `src/lib`
grows instead, and gains a real obligation: a change there now reaches every feature at once, and
`popover.ts` in particular is touched by two surfaces that have **no automated test coverage by
design** (they are DOM glue — see the scoping note in CLAUDE.md). Editing it means re-verifying the
presets menu *and* the emoji panel by hand, in both themes and both browsers. That cost is the
price of the deduplication and should be weighed before the next change lands there.

This record partially overtakes the *file layout* described in
[[0017-keyboard-shortcuts-delegate-to-toolbar]], which states that all five shortcut-safety rules
live in `editor-shortcuts/keymap.ts`; rules 3, 4 and 5 (exact modifier matching, `key` before
`code`, the reserved list) are now in `src/lib/keys.ts`. **0017's decision is unchanged and it
stays Accepted** — shortcuts still drive the forum's own toolbar buttons, and its five rules are
still the rules. Only their address moved.

Deciding *when* something is shared enough to promote stays a judgement call, and the "wait for the
second caller" rule is deliberately lax: promoting on the first caller invents abstractions nobody
needs, which is the failure mode this codebase has avoided so far. `src/lib/shadow-ui.ts` is the
standing reminder that the rule is not "everything shared becomes one helper" — it serves the
*vanilla* injected controls and is deliberately separate from the Svelte popover path.

> **Applied again (2026-08-12).** Three more primitives crossed the "second caller" line and
> moved here under this same rule, with no new decision required:
> `src/lib/anchor-position.ts` (`placeAnchored` — the flip/clamp geometry `popover.ts` and
> `highlight/toolbar.ts` had each grown their own, subtly different version of),
> `createFormatButton` in `phpbb.ts` (the toolbar-trigger markup `bbcode-presets` and
> `emoji-picker` both built by hand, including the `type="button"` hazard both had to remember),
> and `runMigrations` in `store-kit.ts` (the store version loop all three data stores had
> written three different ways). The first is pure arithmetic and is therefore unit-tested,
> which is the point of extracting geometry out of DOM glue at all.

Related: [[0017-keyboard-shortcuts-delegate-to-toolbar]], [[0016-svelte-in-content-script]],
[[0012-feature-owned-data-stores]]
