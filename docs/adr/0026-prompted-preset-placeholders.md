# 0026. Prompted preset placeholders — `{PROMPT:label}`

Status: Accepted

Date: 2026-08-12

This record **extends** [[0015-preset-placeholder-syntax]] rather than reversing it. 0015 stays
Accepted and its text stands; everything here is additive, and the one behaviour 0015 described
that changes is the one it explicitly parked for this purpose.

## Context

Presets are organised one folder per character, and a character template is nearly always
*almost* right: the same structure with a different place, interlocutor or mood filled in. Today
that means inserting the preset and then editing it in place — which is exactly the friction the
feature exists to remove.

0015 designed `{PROMPT:label}` for this and **reserved it without implementing**, because it
"needs an in-page dialog and a multi-field flow". That reason has expired. `src/lib/popover.ts`
now exists — an anchored surface in a shadow root with dismissal, positioning and the async mount
already solved, shared by two features ([[0023-shared-primitives-in-lib]]) — and
`emoji-picker/Picker.svelte` is a working precedent for a focusable `<input>` inside one.

Two things made this worth a record of its own rather than ordinary feature work.

First, **it is a genuine grammar extension, not a new token.** 0015 froze
`placeholder := "{" NAME ( "|" filter )* "}"` where `NAME` is one of two exact uppercase words.
`{PROMPT:label}` carries a `:` and an argument, which that production does not describe. The
regex has to change shape, not just gain an alternative.

Second, **the syntax cannot be redefined later.** Preset bodies are typed by the user and live in
their browser ([[0012-feature-owned-data-stores]]); there is no corpus to migrate and the damage
from getting it wrong shows up as corrupted text in a published forum post. Every question below
is answered once.

What made it *safe* to answer them now is that 0015 put `{PROMPT:x}` in the **"left byte-for-byte
literal"** bucket and said so in its Consequences. No stored body can be relying on it doing
anything, so giving it a meaning cannot rewrite what anyone's presets already do.

## Decision

We will extend the frozen grammar to:

```
placeholder := "{" ( NAME | PROMPT ) ( "|" filter )* "}"
NAME        := "SELECTION" | "CURSOR"     -- uppercase, exact
PROMPT      := "PROMPT:" LABEL
LABEL       := [^{}|]*                    -- trimmed; spaces and accents allowed
filter      := [a-z]+                     -- lowercase, chained left to right
```

**Filters chain onto a prompt exactly as onto a selection**, applied to the answer. Not because
consistency is pretty, but because the alternative is a trap: shipping without filters would
leave `{PROMPT:x|upper}` in the literal bucket *permanently*, and adding them afterwards would be
the silent redefinition 0015 forbids. There is no version of "decide later" here.

**`LABEL` allows spaces and accents** — these labels are French and read like questions ("Nom du
personnage") — and is **trimmed**, so `{PROMPT:lieu}` and `{PROMPT: lieu }` are one field.

**`LABEL` matches zero characters (`*`, not `+`)** on purpose. It is what lets `{PROMPT:}` be
*matched*, so the engine can report it as an authoring mistake while still emitting the token
byte-for-byte. With `+` it would fall out of the grammar and degrade silently, and a writer would
have no way to learn why nothing was asked.

The engine stays **pure and DOM-free**, which is what makes the contract testable even though
prompting needs a dialog. It splits in two, both in `template.ts`:

- `collectPrompts(body) → string[]` — the distinct labels, in document order. **De-duplication
  happens here**, so "one field per label" is true for every caller at once.
- `renderPreset({ body, selection, answers }) → { text, caretOffset, warnings }` — `answers` is
  keyed by trimmed label and substituted like `{SELECTION}`.

The caller does the asking. Degradation extends 0015's table, in its spirit — quiet where it
would embarrass, loud where it can still be fixed:

| Situation | Behaviour |
|---|---|
| prompt answered | substituted, filters applied to the answer |
| answered with an empty string | substituted as empty — the writer chose that |
| no answer supplied at all | substituted as empty, no warning — mirrors `{SELECTION}` with nothing selected |
| **cancelled** | **nothing is inserted**, not a half-filled template; the caller simply never renders |
| same label more than once | asked **once**; the one answer fills every occurrence, each applying its own filter chain |
| `{PROMPT:}`, or a label of only spaces | left **byte-for-byte literal** + warning |
| unknown filter on a prompt | skipped, rest of the chain applies + warning — unchanged from 0015 |
| `{prompt:x}`, `{PROMPT:x` | left literal, silently — unchanged from 0015 |

Answers are **never persisted**. Every insertion starts blank. Remembering them would mean a
third feature-owned store to version, repair and fold into the export bundle
([[0021-json-export-import]]) in exchange for pre-filling a field that is wrong more often than
right — the whole point is that this insertion differs from the last one.

The **options-page preview substitutes the label as a stand-in** (`‹lieu›`) rather than growing
live inputs. The preview exists to check the template's shape; filters still visibly apply to the
stand-in, so `{PROMPT:humeur|upper}` shows up shouted and the chain is verifiable at authoring
time.

### Where the dialog anchors

`createPopover` wants a **persistent light-DOM element**: it inserts the shadow host after it,
re-measures it on scroll and resize, and allowlists it in the outside-click test via
`composedPath()`. The prompt dialog is the first surface here that is opened by *code* rather than
by clicking that element, and the three obvious candidates are all wrong:

- the **menu item** that was clicked — what the design note first sketched — is transient and
  lives in another shadow root; it is gone by the time the dialog is up;
- the **toolbar button** already belongs to the presets menu, so one click would fire both
  popovers' `onToggle`;
- **`#message-box`** contains the textarea, so `composedPath()` would read clicking into the
  message as "inside the surface", leaving the dialog open over a caret that has since moved.

So the anchor is an element of our own: an empty, zero-size, `aria-hidden` `<span>` that nobody
can click, parked under the toolbar button (or at the top of the editor container when there is
no toolbar), with a no-op `onToggle`. We will **not** teach `popover.ts` an "open
programmatically" mode for a single caller: it has no automated coverage by design, so every edit
there costs a hand re-verification of the presets menu *and* both emoji-picker surfaces, in two
themes and two browsers.

`fit` is **on** for this surface, unlike the menu: a form is as tall as it has fields, and the
no-toolbar anchor can sit well down the page.

## Consequences

- **The snapshotted selection survives an arbitrary wait.** `range` is captured when the menu
  opens, and the dialog may sit there for a minute. That is safe only because any pointerdown
  outside the dialog dismisses it — the writer cannot move the caret without cancelling first.
  Anything that later makes the dialog non-dismissing has to re-snapshot instead.
- **One test row was deleted**, `['the reserved prompt token', '[b]{PROMPT:nom}[/b]']` in
  `template.test.ts`'s "malformed input stays literal" table. That file's header forbids changing
  an expectation without a record; this is the record. A comment in its place says so, and the
  lowercase and unclosed spellings were added to the table to keep the surrounding rows honest.
- **`{PROMPT:}` is now the only shape that is both matched and emitted verbatim.** It is a third
  category alongside 0015's "warned skip" and "silent literal", and it exists because the label is
  the question — an empty one cannot be asked, but it must still round-trip.
- **Two spellings of "wrong" still degrade two ways**, and now three. `{prompt:x}` is a silent
  literal, `{PROMPT:}` is a warned literal, `{PROMPT:x|bold}` is a warned skip. This is the same
  wart 0015 accepted, extended rather than fixed, for the same reason: tightening it would break
  bodies that currently round-trip untouched.
- **Both surfaces got prompting for free**, because the menu and the panel already funnelled
  through one insertion function. That function splits into `beginInsert` / `performInsert`, and
  the panel needed no changes of its own.
- The feature now mounts **three** shadow roots on a composer page rather than two. The dialog is
  cheap — it renders nothing until opened — but it is one more thing the cleanup has to take
  down, along with its anchor span.
- A composer with no BBCode toolbar *and* no editor container would have nowhere to put the
  dialog. That case degrades to the pre-0026 behaviour — insert unfilled, edit in place — rather
  than opening a dialog nobody can see. In practice it is unreachable: the feature already returns
  early without a textarea, and `findMessageBox()` falls back to the textarea's parent.
- No `planInsertion` pre-check guards the write, unlike the emoji picker's. `#message` carries no
  `maxlength` on this forum, so `insertAtRange` cannot refuse. If presets ever reach the Tribune,
  whose chatbox caps at 1040 characters, the dialog must check **before** dismissing itself or the
  writer's typing is lost with no feedback.

Related: [[0015-preset-placeholder-syntax]], [[0012-feature-owned-data-stores]],
[[0013-undo-safe-text-insertion]], [[0023-shared-primitives-in-lib]]
