# 0015. Preset placeholder syntax as a frozen contract

Status: Accepted

Date: 2026-07-24

## Context

A BBCode preset is not a fixed string: the whole point is to wrap *the text the writer just
selected*. A "yell" preset has to mean "put my selection inside
`[b][color=#123456]…[/color][/b]`, shouted", and a dialogue preset has to leave the caret in
the right place so typing can continue immediately. So a preset body needs placeholders, and
placeholders need a syntax.

That syntax is unusually expensive to change. Preset bodies are **typed by the user and
persisted in their browser** ([[0012-feature-owned-data-stores]]); there is no server-side
corpus we can migrate and no way to see what people have written. Re-defining what a token
means silently rewrites what everyone's existing presets do, and the damage surfaces as
corrupted text in a published forum post — the one place a roleplay writer cannot quietly fix
it. Whatever we choose, we are choosing for good.

The options on the table were a minimal `{SELECTION}`-only substitution; the same plus
transformations; and a richer scheme with `{PROMPT:label}` asking the writer for a value at
insertion time. We also had to decide how the engine behaves when a body is *wrong* — a typo
in a filter name, an unclosed brace — since the naive answer (leave it as-is) means publishing
`{SELECTION|bold}` to the forum.

## Decision

We will define the following grammar, and treat it as frozen:

```
placeholder := "{" NAME ( "|" filter )* "}"
NAME        := "SELECTION" | "CURSOR"     -- uppercase, exact
filter      := [a-z]+                     -- lowercase, chained left to right
```

`{SELECTION}` is replaced by the selected text; `{CURSOR}` is removed and marks where the
caret lands. Filters are `upper`, `lower`, `title`, `trim`, applied to the selection in
written order. Token names are **case-sensitive** so that BBCode containing ordinary braces
(`{color}`) is never mangled. `{PROMPT:…}` is **reserved, not implemented** — it needs an
in-page dialog and a multi-field flow, and is deferred to a later iteration.

The engine lives in `src/features/bbcode-presets/template.ts` as a **pure, DOM-free**
`renderPreset({ body, selection }) → { text, caretOffset, warnings }`. Purity is what makes
the contract testable, and it is the seam a future keyboard-shortcut feature will reuse to
insert plain BBCode tags.

Degradation is deliberate in every case:

| Situation | Behaviour |
|---|---|
| `{SELECTION}`, text selected | replaced by the filtered selection, per occurrence |
| `{SELECTION}`, nothing selected | replaced by the empty string |
| no `{SELECTION}`, text selected | the caller replaces the selected range, so the selection is overwritten |
| `{CURSOR}` present | removed; caret lands at that offset |
| `{CURSOR}` absent | caret at the end of the insertion |
| `{CURSOR}` more than once | the first wins; the rest are **removed** (never left visible) + warning |
| filters written on `{CURSOR}` | parsed and ignored, silently |
| unknown filter | **skipped**; other filters in the chain still apply + warning |
| malformed or unmatched (`{SELECTION`, `{selection}`, `{SELECTION|Upper}`, `{PROMPT:x}`) | left byte-for-byte literal |

The asymmetry between the last two rows is the important one. An unknown filter fails **soft**
at insertion — a typo costs one transformation, never a visible `{SELECTION|bold}` in a
published post — but **loud** at authoring time, via the returned `warnings`, which the options
page shows beside the live preview. Fail quietly where it would embarrass the user, fail
noisily where it can still be fixed.

Because this contract is frozen and unusually costly to break, we will **add a test runner** —
vitest, via WXT's own `WxtVitest()` plugin — and lock every row of that table down in
`template.test.ts`. This is the repo's first test suite. It is scoped on purpose: tests cover
**pure logic only** (this engine, and the preset store's tree invariants). We will *not*
backfill tests for the existing DOM and browser glue, which is cheaper to verify by hand
against a real forum page.

## Consequences

- The syntax can be *extended* (a new filter, a new token) but not *redefined*. Adding
  `{PROMPT:…}` later is safe precisely because it is currently in the "left literal" bucket —
  no existing preset can be relying on it doing something else.
- Case-sensitivity buys safety against brace-bearing BBCode at the cost of a small surprise:
  `{selection}` silently does nothing rather than reporting a mistake. The options-page preview
  is the mitigation — a writer sees the literal token sitting in the output.
- Filters must stay lowercase in the grammar, so `{SELECTION|Upper}` is *literal* while
  `{SELECTION|bold}` is a *warned skip*. Two spellings of "wrong" degrade two different ways.
  This is a genuine wart, accepted because tightening it later would break bodies that
  currently round-trip untouched.
- The engine is pure, so it cannot know whether text was selected — the "no `{SELECTION}` but
  text is selected → replace" rule lives in the caller ([[0013-undo-safe-text-insertion]]).
  Anyone reading `template.ts` alone will not see that rule; it is documented in both places.
- French correctness is a standing constraint: casing goes through `toLocale*Case('fr')` and
  `title` matches with `\p{L}` and the `u` flag. Without them, accented initials are skipped.
- `title` **lowercases before capitalising**, so it is idempotent — the same output whether the
  source was typed quietly or shouted. Its word boundaries are whitespace and **hyphens only**:
  `jean-pierre` → `Jean-Pierre`, because compound names are common on this forum. An apostrophe
  is deliberately *not* a boundary, since French elision puts one inside ordinary words far more
  often than at a name break; boundary-ing on it would turn `c'est` into `C'Est`. The cost is
  that `l'atrocité` yields `L'atrocité`, which was judged the lesser evil. All four behaviours
  are pinned by tests.
- `pnpm test` joins `pnpm check` as a CI gate. The cost is one devDependency and one config
  file; the scoping rule above is what keeps that from growing into a testing obligation for
  every DOM helper.

Related: [[0012-feature-owned-data-stores]], [[0013-undo-safe-text-insertion]]
