# 0013. Preserve the native undo stack with `execCommand('insertText')`

Status: Accepted

Date: 2026-07-24

## Context

The BBCode presets feature is the first thing in this extension that *writes* into the forum's
composer rather than only reading it. The colour-grab feature (#4) will do the same, and a
future keyboard-shortcut system — the user wants one covering both presets and plain BBCode
tags, which the forum lacks entirely — will lean on it hardest.

The obvious ways to insert text are `textarea.value = …` and `textarea.setRangeText()`. Both
work, and both **silently destroy the browser's native undo history**. After either one, the
writer's next Ctrl+Z does nothing useful — at best it is a no-op, at worst it jumps back past
everything they typed before the insertion. For someone several paragraphs into a roleplay
post, that is a data-loss bug wearing a formatting bug's clothes, and it sits badly next to a
project whose first shipped feature exists to stop posts being lost
([[0008-beforeunload-exit-guard]]).

`document.execCommand()` is deprecated. It is also the only API that inserts programmatically
while keeping the edit history: MDN carries an explicit carve-out for exactly this, and the
`beforeinput`-based approach that replaces it applies to editors that own their own document
model — not to writing into someone else's `<textarea>`. The relevant history is that Firefox
only supported `insertText` on plain `<input>`/`<textarea>` from **version 89** (bug 1220696);
Chrome has supported it for far longer.

We also had to decide where the helper lives. `src/lib/phpbb.ts` is the natural-looking home
since the target is phpBB's `#message`, but that module is scoped to *forum markup*
([[0005-centralize-phpbb-dom]]).

## Decision

We will route **every programmatic write to a textarea** through a single helper,
`insertAtRange` in `src/lib/textarea.ts`, which uses
`document.execCommand('insertText', false, value)`.

The helper is deliberately fussy about four things, each of which is a real failure we would
otherwise hit:

- **Focus first, then set the selection.** `execCommand` acts on the *focused* editable element
  and on its current selection. Skipping either is the usual reason it silently does nothing.
- **The range is a parameter, not read from the element.** Callers snapshot `{start, end}` when
  the menu *opens* and pass it in, because by the time an item is clicked the selection may
  already be gone. Callers additionally `preventDefault()` on the trigger's `mousedown` so the
  textarea never loses focus in the first place.
- **Line endings are normalized** to `\n` before anything is measured — a preset body pasted
  from Windows carries CRLF and browsers differ on how a textarea's value counts it.
- **`maxlength` is checked and the insertion refused** if it would overflow, because
  `execCommand` truncates silently, and half a BBCode structure in a post is worse than no
  insertion at all.

When `execCommand` returns `false` or throws, we fall back to `setRangeText` plus a synthesized
`InputEvent('input')`, and **log a warning** saying undo was not preserved. The fallback exists
so the feature degrades to "works, but no undo" rather than "does nothing"; the log is what
makes the degradation diagnosable instead of mysterious.

The helper lives in `src/lib/textarea.ts`, **not** in `src/lib/phpbb.ts`. Reading a selection
out of a textarea is identical on every website; it is not knowledge about phpBB's markup, and
mixing it in would dilute the one job that module has. Only the *selectors* —
`findFormatButtons`, `FORMAT_BUTTON_CLASS`, `findMessageBox` — go to `phpbb.ts`.

## Consequences

- Firefox **89** becomes a floor for the insertion path. Well below any current ESR, so this
  costs nothing today, but it is a real constraint now written down.
- We depend on a deprecated API in a place with no successor. The mitigation is that the
  dependency is one function call in one file: if `insertText` is ever withdrawn, there is
  exactly one place to change, and the fallback already there becomes the main path.
- Insertion is a single undo unit, so Ctrl+Z removes a whole preset and restores the prior
  selection. This is what makes the "a preset with no `{SELECTION}` replaces the selection"
  rule ([[0015-preset-placeholder-syntax]]) safe rather than destructive — the two decisions
  depend on each other.
- The pure/impure split is now explicit: `renderPreset` decides *what* text to insert,
  `insertAtRange` decides *how*. A keyboard-shortcut feature inserting plain `[b]…[/b]` reuses
  both without new insertion code, and so does colour grab.
- The rule "never write to a textarea except through `insertAtRange`" is only as good as its
  observance; it is easy to reach for `setRangeText` in a hurry and reintroduce the bug in a
  way no type check catches. This is recorded in CLAUDE.md for that reason.
- phpBB itself needs nothing from us — its `editor.js` registers no `input` listener and does
  no autosave or character counting. The synthesized event in the fallback is insurance against
  a skin extension that does, not a present requirement.

Related: [[0005-centralize-phpbb-dom]], [[0015-preset-placeholder-syntax]], [[0008-beforeunload-exit-guard]]
