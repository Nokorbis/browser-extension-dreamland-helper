# 0017. Keyboard shortcuts drive existing toolbar buttons, across composer surfaces

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

**Which composer surfaces.** The forum also runs a non-native chat widget (AJAX Chat, branded
"la Tribune") — same-origin and never an iframe, so already reachable from the same content
script (`FORUM_MATCHES` covers it with no manifest change). It exists in two DOM shapes, both
verified against captured reference snapshots (`real_snippets/index.html`, `real_snippets/chat.html`)
— *[correction, 2026-08-12: this originally said "committed" snapshots. `real_snippets/` is and
always was gitignored, so these are local captures, not repository artefacts. Re-capture them from
the live forum if you need to re-verify. The DOM facts recorded below were checked against them and
are unchanged.]*:

- the shoutbox embedded on the forum homepage: `<textarea id="ajaxChatInputField">`, whose
  toolbar buttons carry **no id and no per-bbcode class** — only a shared
  `class="button button-secondary"`;
- the standalone `/chat/` page: `<textarea id="inputField">`, whose toolbar buttons *do* carry
  individual ids (`#bbCodeBold`, `#bbCodeURL`, …) but not ones derivable from the bbcode string
  the way phpBB's `bbcode-*` class is, and which lacks the `s`/`spoiler` buttons the embedded
  variant has.

Neither shape has anything resembling phpBB's `findFormatButton` addressing scheme. What both do
share, verbatim, is the inline handler itself: `onclick="ajaxChat.insertBBCode('b');"` (etc.),
inside a `<div id="bbCodeContainer">` toolbar identical in both shapes. `chat.js`, the widget's
own script, is not in this repo — only referenced by `<script src>` — so it cannot be statically
confirmed that `insertBBCode` reads the textarea's current selection the same defensive way
phpBB's `bbstyle()` does.

## Decision

We will implement shortcuts as a **route to existing buttons, not a second way to insert text**,
and bind independently against **every composer surface a page has** rather than hardcoding
phpBB as the only one.

`src/features/editor-shortcuts/index.ts` resolves each binding to a live toolbar button per
target and calls `button.click()`. The inline `onclick` — phpBB's `bbstyle(n)`, the chat's
`insertBBCode(...)` — is a listener on the page's own node, so the click runs the page's own
handler despite the content script living in an isolated world; untrusted events reach inline
handlers exactly like trusted ones. Nothing in this feature writes to the textarea, so the rule
from [[0013-undo-safe-text-insertion]] is untouched rather than bent.

**A sibling module, `src/lib/chatbox.ts`,** holds the chat widget's DOM knowledge
(`findChatTextarea`, `findChatBBCodeContainer`, `findChatBBCodeButton`), following `phpbb.ts`'s
shape but not folded into it: the chat widget is a structurally distinct system with its own id
scheme and global (`window.ajaxChat`), and `phpbb.ts`'s own header scopes it to "phpBB's markup."
Per [[0005-centralize-phpbb-dom]]'s spirit of one module per DOM system, a second system gets a
second module. `findChatBBCodeButton` matches `input[onclick*="insertBBCode('${bbcode}')"]`
scoped inside `#bbCodeContainer` — the one addressing scheme identical across both DOM shapes —
validating `bbcode` against the same `/^[a-z0-9-]+$/` guard `findFormatButton` uses, for the same
reason (an invalid literal would make `querySelector` throw and take the feature down).

`src/features/editor-shortcuts/index.ts` resolves a list of independent `Target`s
(`{ textarea, toolbar, findButton }`), one for phpBB and one for the chat. Each target is
resolved and bound (or skipped) on its own; a page with only one of the two composer surfaces
still works, and a page with neither is a silent no-op. One shared `AbortController` covers every
target's listener, so a single cleanup call tears all of them down.

The map has **two modifier rows**:

- **primary** — `Ctrl`, `Cmd` on macOS: `B` bold, `I` italic, `U` underline, `K` link,
  `E` code. The five conventions people already have.
- **secondary** — `Alt`, `Ctrl+Option` on macOS (plain Option composes accented characters,
  which someone writing French will be doing): everything else. Its letters reuse phpBB's own
  accesskey letters wherever one exists, so the only thing that changes for an existing user is
  that the modifier is now the same in both browsers.

`KEYMAP` (`./keymap.ts`) needs no per-surface knowledge. Every bbcode the chat toolbar supports
(`b, i, u, s, quote, code, url, img, spoiler`) is already in the table; the ones it lacks (`list,
list-, asterisk, color, center, justify, mp3`) hit the existing "no matching button → leave the
key alone" tolerance — the same mechanism that already lets a phpBB forum lack some custom BBCode
without misfiring. `keymap.ts` was designed forum/surface-agnostic from the start.

Five rules make it safe, and all of them live in the pure `./keymap.ts` so they are testable
without a DOM:

1. **The listener is on the textarea**, not on `document`. These overrides exist only while
   composing; everywhere else on the forum the browser keeps every key.
2. **`preventDefault()` only after a binding has matched** — including matching a button that
   is actually present. A BBCode a surface does not have leaves its key alone entirely.
3. **Modifier matching is exact.** No binding fires with `Shift` held, and `Ctrl+B` is ignored
   on macOS, where it means "move backward one character".
4. **The letter is read from `event.key` first, `event.code` only as a fallback.** `key` is
   what makes AZERTY correct — the key labelled A reports `code: 'KeyQ'`, and matching by code
   would fire "quote" — while the `code` fallback catches macOS composing `Ctrl+Option+C` into
   `key: 'ç'`.
5. **A reserved-letter list is enforced by a unit test**, covering both the editing essentials
   (`Ctrl+A/C/V/X/Z/Y`) and the combos a page cannot intercept anyway.

On the phpBB buttons we bind we **remove the `accesskey` we now shadow**, restoring it on
teardown: on Chromium, `Alt+L` would otherwise reach our handler *and* the native accesskey.
Buttons we did not bind keep theirs. Their `title` gains the combo (`… (Ctrl+B)`) and they get an
`aria-keyshortcuts`; the originals are stashed and restored by the feature's cleanup.

The map is fixed — no remapping UI. It is one table in one file, so making it configurable
later needs no change to the `editor-shortcuts` id or to anything persisted.

## Consequences

- A shortcut does **exactly** what clicking does, for every BBCode on every bound surface,
  including ones added after this was written — we never learn what `[spoiler]` means. The price
  is that we inherit each surface's insertion behaviour wholesale, including its effect on the
  native undo stack: phpBB's `editor.js` has historically assigned `textarea.value`, which wipes
  it. If that is what the live forum does, Ctrl+Z after a shortcut behaves exactly as badly as
  Ctrl+Z after a click — no regression, but no fix either, and the fix is the option this ADR
  turned down: render the wrap ourselves and go through `insertAtRange`, delegating only the
  stateful buttons (palette, list item, size). That door stays open and
  [[0013-undo-safe-text-insertion]] already governs how to walk through it.
- The `insertBBCode`-reads-the-selection assumption for the chat widget is carried forward
  unverified by static analysis — `chat.js` isn't in this repo. If AJAX Chat's insertion turns
  out to work differently from phpBB's `bbstyle` (e.g. it doesn't restore focus/selection the way
  a click from the mouse does), that would surface as a chat-only bug report rather than
  something this design could have caught. Manual verification against the live forum is the only
  check that closes this gap.
- macOS users get `Ctrl+Option` for the secondary row, which is what Safari and Chrome already
  use for accesskeys there, but is two modifiers rather than one. Accepted: Option alone is not
  claimable on a French-language forum.
- The `<select class="bbcode-size">` has no binding. It is not a button, and one shortcut per
  size is noise. Our own presets trigger has none either — it is reachable from the toolbar and
  from the panel, and adding a row to the table later is trivial.
- `findFormatButton` in `src/lib/phpbb.ts` is now the addressing scheme for phpBB's toolbar, and
  depends on phpBB deriving each button's class from the BBCode tag name; `findChatBBCodeButton`
  in `src/lib/chatbox.ts` plays the same role for the chat, coupled instead to AJAX Chat's exact
  `insertBBCode('<bbcode>');` call form. A skin or widget update that renames those degrades the
  affected surface's shortcuts to nothing rather than misfiring — [[0005-centralize-phpbb-dom]]
  means there is one file per system to fix.
- `editor-shortcuts`'s `setup()` resolves a list of targets, each independently optional, rather
  than one target it must find or bail on — a third composer surface, if one ever appears, is one
  more entry in the `targets` array, not a rewrite. It warns once, only if literally nothing bound
  on any target, and logs once with the total buttons bound across all surfaces that matched; a
  reader debugging "why didn't shortcuts bind here" needs to check per-target absence (missing
  textarea or toolbar) rather than a single message naming the cause.
- Shortcuts are discoverable only by hovering a button. There is no cheat sheet in the popup or
  in the page; if the tooltips prove too quiet, that is where to add one.
- Whoever adds the eighteenth-plus binding has to think about the reserved list, not just find
  a free letter — `Alt+F`, `Alt+E`, `Alt+V`, `Alt+S`, `Alt+B`, `Alt+T`, `Alt+H` and `Alt+D`
  open browser menus even when the menu bar is hidden. The list and the test exist so that
  thinking is done once.

Related: [[0013-undo-safe-text-insertion]], [[0005-centralize-phpbb-dom]], [[0004-feature-registry]]
