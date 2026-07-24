# 0017. Keyboard shortcuts drive phpBB's own toolbar buttons

Status: Accepted

Date: 2026-07-24

## Context

The composer's BBCode row is mouse-first. phpBB puts an `accesskey` on ten of its buttons
(`b i u q c l o y p w`), which sounds like the problem is already solved, and isn't:

- the activation combo is different in every browser — `Alt+key` on Chromium, `Alt+Shift+key`
  on Firefox, `Ctrl+Option+key` on macOS — so no instruction we could write is true for
  everyone;
- this forum's **admin-added** BBCodes (`center`, `justify`, `mp3`, `s`, `spoiler`) and the
  colour palette have no `accesskey` at all, and are unreachable from the keyboard;
- nothing maps to `Ctrl+B` / `Ctrl+I`, which every other editor has spent decades teaching.

Two questions had to be answered.

**How the shortcut inserts.** [[0013-undo-safe-text-insertion]] anticipated this feature and
assumed it would render text and hand it to `insertAtRange`. That is possible — the open/close
tags could be derived from each button's `bbcode-*` class or parsed out of the `[b]texte[/b]`
help text in its `title` — and it would guarantee Ctrl+Z keeps working. It also means owning a
second implementation of phpBB's wrapping semantics, one that quietly diverges the day an admin
redefines a BBCode or adds one we have never heard of. The alternative is to send the key
straight to the button that already exists.

**Which keys.** There is no room for eighteen bindings under `Ctrl` alone, and `Ctrl+Shift` is
worse than it looks: `Ctrl+Shift+I/J/C` (devtools), `N/T/W` (windows and tabs) and `P`
(private browsing) are reserved by the browser and cannot be intercepted by a page at all, so a
binding parked there is simply dead. A leader-key chord (`Ctrl+M`, then a letter) would scale
without collisions, at the cost of an extra keystroke and a mechanism nothing else on the forum
uses.

## Decision

We will implement shortcuts as a **route to the existing buttons, not a second way to insert
text**. `src/features/editor-shortcuts/index.ts` resolves each binding to a live toolbar button
at setup and calls `button.click()`. The inline `onclick="bbstyle(n)"` is a listener on the
page's own node, so the click runs phpBB's handler despite the content script living in an
isolated world; untrusted events reach inline handlers exactly like trusted ones, and `bbstyle`
does not check `isTrusted`. Nothing in this feature writes to the textarea, so the rule from
[[0013-undo-safe-text-insertion]] is untouched rather than bent.

The map has **two modifier rows**:

- **primary** — `Ctrl`, `Cmd` on macOS: `B` bold, `I` italic, `U` underline, `K` link,
  `E` code. The five conventions people already have.
- **secondary** — `Alt`, `Ctrl+Option` on macOS (plain Option composes accented characters,
  which someone writing French will be doing): everything else. Its letters reuse phpBB's own
  accesskey letters wherever one exists, so the only thing that changes for an existing user is
  that the modifier is now the same in both browsers.

Five rules make it safe, and all of them live in the pure `./keymap.ts` so they are testable
without a DOM:

1. **The listener is on the textarea**, not on `document`. These overrides exist only while
   composing; everywhere else on the forum the browser keeps every key.
2. **`preventDefault()` only after a binding has matched** — including matching a button that
   is actually present. A BBCode this forum does not have leaves its key alone entirely.
3. **Modifier matching is exact.** No binding fires with `Shift` held, and `Ctrl+B` is ignored
   on macOS, where it means "move backward one character".
4. **The letter is read from `event.key` first, `event.code` only as a fallback.** `key` is
   what makes AZERTY correct — the key labelled A reports `code: 'KeyQ'`, and matching by code
   would fire "quote" — while the `code` fallback catches macOS composing `Ctrl+Option+C` into
   `key: 'ç'`.
5. **A reserved-letter list is enforced by a unit test**, covering both the editing essentials
   (`Ctrl+A/C/V/X/Z/Y`) and the combos a page cannot intercept anyway.

On the buttons we bind we **remove the `accesskey` we now shadow**, restoring it on teardown:
on Chromium, `Alt+L` would otherwise reach our handler *and* the native accesskey. Buttons we
did not bind keep theirs. Their `title` gains the combo (`… (Ctrl+B)`) and they get an
`aria-keyshortcuts`; the originals are stashed and restored by the feature's cleanup.

The map is fixed — no remapping UI. It is one table in one file, so making it configurable
later needs no change to the `editor-shortcuts` id or to anything persisted.

## Consequences

- A shortcut does **exactly** what clicking does, for every BBCode on the toolbar, including
  ones added after this was written — we never learn what `[spoiler]` means. The price is that
  we inherit phpBB's insertion behaviour wholesale, including its effect on the native undo
  stack: `editor.js` has historically assigned `textarea.value`, which wipes it. If that is what
  the live forum does, Ctrl+Z after a shortcut behaves exactly as badly as Ctrl+Z after a click
  — no regression, but no fix either, and the fix is the option this ADR turned down: render
  the wrap ourselves and go through `insertAtRange`, delegating only the stateful buttons
  (palette, list item, size). That door stays open and [[0013-undo-safe-text-insertion]]
  already governs how to walk through it.
- macOS users get `Ctrl+Option` for the secondary row, which is what Safari and Chrome already
  use for accesskeys there, but is two modifiers rather than one. Accepted: Option alone is not
  claimable on a French-language forum.
- The `<select class="bbcode-size">` has no binding. It is not a button, and one shortcut per
  size is noise. Our own presets trigger has none either — it is reachable from the toolbar and
  from the panel, and adding a row to the table later is trivial.
- `findFormatButton` in `src/lib/phpbb.ts` is now the addressing scheme for the whole toolbar,
  and depends on phpBB deriving each button's class from the BBCode tag name. A skin that
  renames those classes silently costs every shortcut — the feature degrades to nothing rather
  than misfiring, and [[0005-centralize-phpbb-dom]] means there is one file to fix.
- Shortcuts are discoverable only by hovering a button. There is no cheat sheet in the popup or
  in the page; if the tooltips prove too quiet, that is where to add one.
- Whoever adds the eighteenth-plus binding has to think about the reserved list, not just find
  a free letter — `Alt+F`, `Alt+E`, `Alt+V`, `Alt+S`, `Alt+B`, `Alt+T`, `Alt+H` and `Alt+D`
  open browser menus even when the menu bar is hidden. The list and the test exist so that
  thinking is done once.

Related: [[0013-undo-safe-text-insertion]], [[0005-centralize-phpbb-dom]], [[0004-feature-registry]]
