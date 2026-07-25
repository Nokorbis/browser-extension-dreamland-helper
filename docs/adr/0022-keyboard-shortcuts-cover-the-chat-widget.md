# 0022. Keyboard shortcuts cover the chat widget too

Status: Accepted

Date: 2026-07-25

## Context

[[0017-keyboard-shortcuts-delegate-to-toolbar]] bound `editor-shortcuts` to exactly one
composer: phpBB's `#message` textarea and `#format-buttons` toolbar, addressed through
`findMessageTextarea`/`findFormatButtons`/`findFormatButton` in `src/lib/phpbb.ts`.

The forum also runs a non-native chat widget — AJAX Chat (blueimp), branded "la Tribune" —
same-origin and never an iframe, so already reachable from the same content script
(`FORUM_MATCHES` covers it with no manifest change). It exists in two DOM shapes, both
verified against committed reference snapshots (`real_snippets/index.html`,
`real_snippets/chat.html`):

- the shoutbox embedded on the forum homepage: `<textarea id="ajaxChatInputField">`, whose
  toolbar buttons carry **no id and no per-bbcode class** — only a shared
  `class="button button-secondary"`;
- the standalone `/chat/` page: `<textarea id="inputField">`, whose toolbar buttons *do* carry
  individual ids (`#bbCodeBold`, `#bbCodeURL`, …) but not ones derivable from the bbcode string
  the way phpBB's `bbcode-*` class is, and which lacks the `s`/`spoiler` buttons the embedded
  variant has.

Neither shape has anything resembling `findFormatButton`'s addressing scheme. What both do
share, verbatim, is the inline handler itself: `onclick="ajaxChat.insertBBCode('b');"` (etc.),
inside a `<div id="bbCodeContainer">` toolbar identical in both shapes.

`chat.js`, the widget's own script, is not in this repo — only referenced by `<script src>` —
so it cannot be statically confirmed that `insertBBCode` reads the textarea's current selection
the same defensive way phpBB's `bbstyle()` does.

## Decision

We will extend `editor-shortcuts` to bind independently against every composer surface a page
has, rather than hardcoding phpBB as the only one.

**A new sibling module, `src/lib/chatbox.ts`.** It follows `phpbb.ts`'s shape exactly
(`findChatTextarea`, `findChatBBCodeContainer`, `findChatBBCodeButton`), but is not folded
into `phpbb.ts`: the chat widget is a structurally distinct system with its own id scheme and
global (`window.ajaxChat`), and `phpbb.ts`'s own header scopes it to "phpBB's markup." Per
[[0005-centralize-phpbb-dom]]'s spirit of one module per DOM system, a second system gets a
second module rather than stretching the first one's contract. `findChatBBCodeButton` matches
`input[onclick*="insertBBCode('${bbcode}')"]` scoped inside `#bbCodeContainer` — the one
addressing scheme that is identical across both DOM shapes — validating `bbcode` against the
same `/^[a-z0-9-]+$/` guard `findFormatButton` uses, for the same reason (an invalid literal
would make `querySelector` throw and take the feature down).

**`src/features/editor-shortcuts/index.ts` generalizes from one hardcoded target to a list of
independent `Target`s** (`{ textarea, toolbar, findButton }`), one for phpBB and one for the
chat. Each target is resolved and bound (or skipped) on its own; a page with only one of the
two composer surfaces still works, and a page with neither is a silent no-op — the same
tolerance the single-target version already had for "no toolbar here." The per-bbcode
`buttons`/`combos` maps, the tooltip/`aria-keyshortcuts`/`accesskey`-removal decoration loop,
and the `MARKER` re-entry guard are unchanged, just run once per target inside an extracted
`bindTarget` function; one shared `AbortController` still covers every target's listener, so a
single cleanup call tears all of them down.

**Click-delegation (0017's core mechanism) extends unmodified to `ajaxChat.insertBBCode`.**
Nothing here inserts text; a shortcut still resolves to a live toolbar button and calls
`.click()`, relying on the same fact 0017 established for `bbstyle`: an untrusted synthetic
click still reaches a plain inline `onclick` handler on the page's own node, regardless of
which isolated-world script dispatched it.

`KEYMAP` (`./keymap.ts`) needs no changes. Every bbcode the chat toolbar supports (`b, i, u, s,
quote, code, url, img, spoiler`) is already in the table; the ones it lacks (`list, list-,
asterisk, color, center, justify, mp3`) already hit the existing "no matching button → leave
the key alone" tolerance — the same mechanism that already lets a phpBB forum lack some custom
BBCode without misfiring. `keymap.ts` was already forum/surface-agnostic by design; this
change is the proof.

The per-target bail/warn granularity changed shape: the old version warned separately for "no
toolbar" and "toolbar found but nothing matched." With two independent targets, neither
absence is remarkable on its own — most pages only have one composer surface — so those
per-target warnings are gone. `setup()` now warns once, only if literally nothing bound on
either target, and logs once with the total buttons bound across all surfaces that did match.

## Consequences

- A shortcut in the chat widget does exactly what clicking its toolbar button does, on both
  DOM shapes, without the feature ever needing to special-case which shape it's looking at.
- The `insertBBCode`-reads-the-selection assumption is carried forward unverified by static
  analysis — `chat.js` isn't in this repo. If AJAX Chat's insertion turns out to work
  differently from phpBB's `bbstyle` (e.g. it doesn't restore focus/selection the way a click
  from the mouse does), that would surface as a chat-only bug report rather than something this
  change could have caught. Manual verification against the live forum is the only check that
  closes this gap.
- `findChatBBCodeButton`'s `onclick*=` substring match is coupled to AJAX Chat's exact call
  form (`insertBBCode('<bbcode>');`, single-quoted, no extra whitespace). A widget update that
  reformats its own template would silently drop every chat shortcut, the same "degrades to
  nothing rather than misfiring" failure mode 0017 already accepted for `findFormatButton`.
- `editor-shortcuts`'s `setup()` is no longer "resolve one target or bail" but "resolve a list
  of targets, each independently optional" — a third composer surface (if one ever appears)
  is one more entry in the `targets` array, not a rewrite.
- The single end-of-`setup()` log line now reports a total across surfaces rather than one
  surface's count; a future reader debugging "why didn't shortcuts bind here" needs to check
  per-target absence (missing textarea or toolbar) rather than reading one warning message that
  named the cause.

Related: [[0017-keyboard-shortcuts-delegate-to-toolbar]], [[0005-centralize-phpbb-dom]]
