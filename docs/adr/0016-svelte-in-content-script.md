# 0016. Svelte in the content script, mounted in a Shadow root

Status: Accepted

Date: 2026-07-24

## Context

Until now the extension's only in-page UI was `server-down-modal.ts`: a static, two-button,
one-shot dialog, hand-written as vanilla DOM inside a Shadow root and styled entirely through
the `.style` property. [[0011-presend-server-reachability-check]] recorded that approach and
suggested future in-page dialogs follow it.

The BBCode presets feature needs something different in kind. Its menu is **data-driven** — it
must re-render whenever the preset library changes in another tab — and **recursive**, because
folders nest to arbitrary depth. A floating panel beside the editor has the same two
properties. Written by hand, that is a recursive DOM builder plus a full re-render path plus
listener bookkeeping at every depth, and the same recursive tree has to be written a second
time in Svelte for the options page.

The counter-pressure was real: `content.js` currently ships **no UI runtime at all**, and it
loads on every page of the forum.

## Decision

We will mount **Svelte 5 components inside a Shadow root** for data-driven in-page UI, using
WXT's `createShadowRootUi` (already available from `#imports` — no new dependency). The
presets menu is the first; the floating panel follows.

`server-down-modal.ts` **stays as it is**, and hand-written inline-styled DOM remains the right
pattern for static, one-shot dialogs. This decision *narrows* the forward-looking guidance in
[[0011-presend-server-reachability-check]] rather than reversing it — that ADR's actual
decision, the reachability preflight, is untouched.

Three specifics are load-bearing:

- **The trigger button is not in the shadow root.** It is plain DOM in the page, carrying
  phpBB's own `button button-icon-only` classes so it inherits whatever the skin looks like.
  Inside a shadow root the skin's styles cannot reach it, so it would be guaranteed to look
  foreign no matter how carefully we styled it.
- **`cssInjectionMode: 'ui'`** on the content script, so component CSS is handed to the shadow
  root instead of the page. This adds `content-scripts/content.css` to
  `web_accessible_resources` (origin-scoped on Chrome), a visible manifest change.
- **`isolateEvents: ['keydown', 'keyup', 'keypress']`**, so our arrow keys never reach phpBB's
  `onkeyup="storeCaret(this)"` handler or its accesskeys. The consequence is that Escape must
  be handled *inside* the component as well as on the document — the isolation cuts both ways.

`createShadowRootUi` is async (it fetches the built CSS) while `Feature.setup()` returns its
cleanup synchronously. Features that use it must check a `disposed` flag after the await, or a
fast navigation leaks a mounted UI.

## Consequences

- **The content script grew from 9.1 kB to 58.5 kB raw — 3.6 kB to 22.4 kB gzipped.** That is a
  6× increase on a script that runs on every forum page, and it is the real price of this
  decision. It is accepted because it remains a fraction of what the forum itself loads
  (jQuery and FontAwesome dwarf it), and because the alternative was two hand-maintained
  recursive tree implementations. If a future feature can be built without UI, it should not
  pull this in further.
- WXT injects a `<style>` element inside the shadow root, which is exactly what
  `server-down-modal.ts` avoids on purpose. This is safe: `<style>` elements created by a
  content script live in the isolated world and are not subject to the page's `style-src`.
  Checked against the live forum before adopting this — it sends **no `Content-Security-Policy`
  header at all**, and its own toolbar buttons carry inline `onclick="bbstyle(0)"` handlers,
  which a strict policy would already have broken. So the risk this guards against is not
  merely theoretical-but-handled; it is absent on the only site the extension runs on.
  The older belt-and-braces approach was never a measured failure, so both patterns now
  coexist — a reader seeing two styles of in-page UI is seeing a deliberate split, not drift.
- The recursive folder tree is written once and shared between the in-page menu and the options
  page. That was the main argument for this decision and should stay true; if the two ever
  diverge enough to need separate components, the trade-off is worth revisiting.
- Svelte HMR does not apply inside content scripts — WXT reloads the whole script on change.
  The dev loop is unchanged, neither better nor worse.
- Outside-click detection must use `event.composedPath()`, never `contains(event.target)`:
  targets are retargeted to the shadow host for anything inside the root. This is the single
  most common bug in shadow-DOM menus and is easy to reintroduce.

Related: [[0011-presend-server-reachability-check]], [[0003-svelte-5-popup-ui]], [[0014-popup-accordion-options-page]]
