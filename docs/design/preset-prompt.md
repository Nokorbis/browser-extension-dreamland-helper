# Design — `{PROMPT:label}` in presets

Status: **Proposed**, not started. Sketch, not a contract — amends ADR 0015 if it ships.

## Problem

Presets are organised one folder per character, and a character template is nearly always
*almost* right — the same structure with a different place, interlocutor or mood filled in.
Today that means inserting the preset and then editing it in place.

ADR 0015 designed `{PROMPT:label}` for exactly this and **reserved it without implementing**,
because it "needs an in-page dialog and a multi-field flow".

**That reason has largely expired.** `src/lib/popover.ts` now exists — an anchored surface in
a shadow root with dismissal, positioning and the async mount already solved, shared by two
features. The dialog is no longer the hard part.

## Why it is safe to add

ADR 0015 froze the grammar but left this door open on purpose: `{PROMPT:x}` currently falls in
the **"left byte-for-byte literal"** bucket. No existing preset can be relying on it doing
anything, so giving it meaning cannot rewrite anyone's stored bodies. That is stated in 0015's
Consequences and is the whole reason it was reserved rather than dropped.

Note the grammar is `placeholder := "{" NAME ( "|" filter )* "}"` — `{PROMPT:label}` carries a
`:` and an argument, which the frozen grammar does **not** describe. So this is a genuine
*extension* of the grammar, not just an added token, and needs its own careful pass through
0015's degradation table.

## Design

**Engine (`template.ts`).** `renderPreset` must stay **pure and DOM-free** — that is what makes
the frozen contract testable. So the flow splits in two:

1. a new pure `collectPrompts(body) → { name, label }[]`, exported and tested;
2. `renderPreset({ body, selection, answers })` — answers passed *in*, substituted like
   `{SELECTION}`. A prompt with no answer degrades per the table below.

The caller (`bbcode-presets/index.ts`) does the asking. Purity is preserved.

**UI.** A `createPopover` surface anchored to the preset's menu item: one labelled input per
prompt, Enter/Valider to insert, Escape to cancel. The picker's "re-snapshot the range and
restore focus" gotcha applies — the panel takes focus, so the selection must be captured
before it opens (the presets menu already snapshots on open).

**Degradation** — must extend 0015's table, in its spirit (quiet where it would embarrass,
loud where it can still be fixed):

| Situation | Behaviour |
|---|---|
| prompt answered | substituted |
| answered with empty string | substituted as empty — the writer chose that |
| cancelled | insert nothing at all, rather than a half-filled template |
| same `NAME` twice | asked once, substituted everywhere |
| `{PROMPT:}` (no label) | literal, + authoring warning |
| filters on a prompt (`{PROMPT:x|upper}`) | apply, if the grammar admits it — decide explicitly |

## Open questions

1. Does `{PROMPT:x|upper}` parse? The frozen grammar's `NAME` has no `:`, so the regex changes.
   Get this exactly right — 0015 exists because this syntax cannot be redefined later.
2. Field order — document order, presumably. Worth stating.
3. Does the options-page preview prompt too, or show labels as placeholders? (Probably the
   latter: the preview is for checking the template, not exercising it.)
4. Remember prior answers per preset, or always blank? Blank is simpler and less surprising.

## Effort

Moderate. The engine change is small, pure and well-covered by the existing
`template.test.ts` discipline; the popover is a known quantity. The care goes into the grammar
extension, because ADR 0015 makes it irreversible.
