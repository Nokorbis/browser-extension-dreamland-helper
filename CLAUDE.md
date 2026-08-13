# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Dreamland Reborn QoL** is a cross-browser (Brave/Chromium + Firefox) extension of writing
aids for the PHPBB 3.20 roleplay forum at **dreamland-reborn.net**. It is built with
[WXT](https://wxt.dev) (Vite-based) and Svelte 5.

Features (all implemented):

1. **Message loss protection** (`exit-guard`) — keep a written post from being lost. **Three
   mechanisms, one switch**: warn before leaving the editor with unsaved text; verify the forum
   is reachable before a send (if it's down, hold the post back and offer to keep the text or
   send anyway); and **autosave** the composer as it's typed, offering it back on the next
   visit. Autosave is *not* a separate feature — its clearing is only correct at the submit
   guard's own decision point, and two toggles made it silently breakable. ⚠ A draft is
   **offered, never restored silently** (phpBB may have pre-filled the box). Keyed by a derived
   composer key (`reply:<t>` / `new:<f>` / `edit:<p>`, `quote` normalising to `reply`); the
   guard *marks* on a genuine post and the draft is retired only once a `viewtopic` page loads,
   so a rejected post keeps its text. Code in `src/features/exit-guard/drafts.ts`; see
   `docs/adr/0027-draft-autosave-and-recovery.md`. _(done)_
2. **Text highlights** (`highlight`) — select a passage in a post's message body and keep it
   highlighted in a chosen colour, persisting across reloads and shared between the thread page
   and the reply composer's topic review (keyed by phpBB's numeric post id). Painted with the
   CSS Custom Highlight API — no DOM mutation — and cleared per-thread or globally. See
   `docs/adr/0020-persistent-text-highlights.md`. _(done)_
3. **BBCode presets** (`bbcode-presets`) — insert complex BBCode structures in one click, from a button in
   phpBB's BBCode toolbar or a panel beside the editor. Presets live in nested folders and
   are authored in the options page. A body can carry `{SELECTION}` / `{CURSOR}` and
   `{PROMPT:label}` fields, the last of which put up a small form before inserting; the grammar
   is a **frozen contract** — see `docs/adr/0015-preset-placeholder-syntax.md` and its extension
   `docs/adr/0026-prompted-preset-placeholders.md`. _(done)_
4. **Color grabber** (`color-grab`) — reuse a colour already used in the thread: a checkbox
   ("Sur la page") in phpBB's own font-colour palette filters the swatches down to the colours
   used in the topic review, appends any the fixed grid lacks, and each surviving swatch's
   tooltip lists who used it and how often. See
   `docs/adr/0019-color-grab-augments-native-palette.md`. _(done)_
5. **Keyboard shortcuts** (`editor-shortcuts`) — Ctrl+B / Ctrl+I / Alt+Q… over phpBB's BBCode
   toolbar **and the Tribune chatbox's**, consistent across browsers. It *clicks* the forum's
   own buttons rather than inserting text, so it inherits their behaviour and covers
   admin-added BBCodes for free. Surfaces are enumerated, not detected: each is bound if its
   selectors resolve, so a missing button just leaves that key alone.
   See `docs/adr/0017-keyboard-shortcuts-delegate-to-toolbar.md`. _(done)_
6. **Emoji picker** (`emoji-picker`) — a searchable **Unicode** emoji panel on both writing
   surfaces (composer and chatbox), from a toolbar button or **Alt+I**. Distinct from the
   forum's own image emoticons, which are left alone. Search is bilingual (fr + en) and
   accent-blind; recents persist. The ~1900-emoji table is a `public/` asset fetched on first
   open rather than bundled — see `docs/adr/0022-lazy-loaded-data-assets.md`. _(done)_
7. **Quote a selected passage** (`quote-selection`) — quote one line instead of a thousand-word
   post. A button on the **shared selection toolbar** (`src/lib/selection-toolbar.ts`, see the
   architecture note below): select a passage in the reply page's topic review and it lands at the
   composer's caret as `[quote="Nom" post_id=… time=… user_id=…]`, the same extended form phpBB's
   own button emits, so it renders with the "a écrit" header *and* the backlink. Those attributes
   are read off the review's own `addquote(…)` handler. ⚠ A selection gives *rendered* text, so the
   passage's BBCode is **recovered** from the hidden `div#message_<postId>` the review carries —
   best-effort: when rendered text and source can't be aligned (a smiley, an `[img]`), it silently
   falls back to quoting plain text rather than emitting a wrong slice. Reply page only; `viewtopic`
   has no composer. See `docs/adr/0029-quote-a-selected-passage.md`. _(done)_
8. **Reply page layout** (`composer-layout`) — write next to what you are answering. Three
   checkboxes in a bar above `<form id="postform">`: *ordre inversé* (composer below the review,
   posts oldest-first), *côte à côte* (composer beside the review, on a chosen side) and *pleine
   largeur* (the wrapper breaks out of the skin's centred column with symmetric negative margins
   against a *measured* viewport width — never `100vw`, which counts the scrollbar), with the
   choice persisted in its own store (`src/lib/composer-layout.ts`). The page is **re-wrapped,
   never re-rendered**: the form's children are *moved* into two column divs, split at
   `h3#review`, so the textarea keeps its text and phpBB's scripts keep their references. The post
   order flips in **CSS** (`flex-direction: column-reverse` on `#topicreview`), so `highlight` and
   `quote-selection` never see a mutation. ⚠ The controls sit **outside** the form — a named or
   non-`button` control inside it would be POSTed or would submit. Reply pages only.
   See `docs/adr/0030-reply-page-layout-rearrangement.md`. _(done)_

## Commands

```bash
pnpm dev             # Chromium/Brave dev with HMR (auto-opens a browser profile)
pnpm dev:firefox     # Firefox dev with HMR
pnpm build           # Production build → .output/chrome-mv3/
pnpm build:firefox   # Production build → .output/firefox-mv2/
pnpm zip             # Distributable zip for Chrome Web Store
pnpm zip:firefox     # Distributable zip for AMO
pnpm check           # svelte-check type check (run this instead of `tsc`)
pnpm lint            # eslint + prettier --check (CI gate)
pnpm format          # prettier --write, to fix what `pnpm lint` complains about
pnpm test            # vitest — pure logic only (see below)
pnpm gen:emoji       # regenerate public/emoji/emoji.json (committed; not part of the build)
pnpm release         # tag-and-push a release; see docs/PUBLISHING.md
                     # `postinstall` runs `wxt prepare` for you after every install
```

`pnpm check` is the type gate — there is no standalone `tsc` build step (WXT/Vite bundles
without one). Run it after any change to `.ts`/`.svelte`.

⚠ **`pnpm check` is not the whole compiler.** svelte-check validates types, not every rune
rule: a `$state(…)` returned directly from a function (rather than assigned to a declaration
first) type-checks cleanly and then fails `pnpm build` with `state_invalid_placement`. After
touching a `.svelte` or `.svelte.ts` file, run a build too — CI does.

`pnpm lint` is the second gate. ESLint's rule set is deliberately small: `pnpm check` already
owns type errors and Prettier owns layout, so `eslint.config.js` carries only rules that catch
a *class of defect* neither can see (a dropped promise rejection, a `const` used before its
declaration, an `as` on unvalidated data). Prettier skips `*.md` and `src/locales/*.yml` on
purpose — see `.prettierignore` for why. Details in
`docs/adr/0024-lint-and-format-gate.md`.

`pnpm test` covers **pure logic only** — the preset template engine
(`src/features/bbcode-presets/template.ts`), the preset, highlight, emoji-recents and draft
store invariants (`src/lib/presets.ts`, `src/lib/highlights.ts`, `src/lib/emoji-recents.ts`,
`src/lib/drafts.ts` — including `draftKey` mode by mode and `pruneDrafts` on both axes), the
draft age bucketing (`src/features/exit-guard/age.ts`), the
settings and backup layers (`src/lib/storage.ts`, `src/lib/backup.ts`), the shared store
plumbing (`src/lib/store-kit.ts`), the insertion arithmetic (`planInsertion` /
`wrapSelection` in `src/lib/textarea.ts`), keymap resolution and cross-feature shortcut
collisions (`src/features/editor-shortcuts/keymap.ts`, `src/lib/keys.ts`), highlight
anchoring (`src/features/highlight/anchor.ts`) and the re-anchor search it shares with
quoting (`src/lib/text-search.ts`), emoji search and dataset repair
(`src/features/emoji-picker/search.ts`, `src/features/emoji-picker/data.ts`), popover
placement (`src/lib/anchor-position.ts`), the colour-grab palette filter
(`src/features/color-grab/palette-filter.ts`), and the quote block plus its BBCode recovery
(`src/features/quote-selection/bbcode.ts`, `src/features/quote-selection/source.ts` — where the
*null* cases are load-bearing: they pin the "give up rather than guess" half of the contract),
and the reply-layout prefs (`src/lib/composer-layout.ts`).
That scoping is deliberate — everything else is
DOM/browser glue that is cheaper to verify by hand against a real forum page. Don't backfill
tests for it; do keep new pure logic covered. `pnpm check`, `pnpm lint` and `pnpm test` are
all CI gates.

The suite runs on plain node with **no DOM environment**, and adding one isn't the way to
cover DOM-adjacent code. When a module mixes real arithmetic with DOM work, extract the
arithmetic into a pure exported function and test that instead — `planInsertion` is the
reference: it owns the range clamping and the `maxlength` projection, while `insertAtRange`
keeps only the `execCommand` and focus handling.

**Loading unpacked for manual testing:** build, then in the browser load `.output/chrome-mv3`
(Brave: `brave://extensions` → Developer mode → Load unpacked) or `.output/firefox-mv2`
(Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → pick `manifest.json`).
`pnpm dev` does this automatically with live reload.

**Checking a selector without the live forum:** `real_snippets/` holds saved HTML of the four
pages that matter — `viewtopic.html`, `posting.html`, `chat.html` (the standalone `/chat/`
page) and `index.html` (the homepage, which carries the embedded shoutbox). Every selector in
`phpbb.ts` and `chatbox.ts` was verified against them, and several ADRs cite them as evidence.
It is **gitignored** (it is a few hundred kB of real forum content, including member posts), so
it exists only on a machine where someone saved it — re-save from the forum if it's missing.

## Architecture

**One content script, many features.** `src/entrypoints/content.ts` is deliberately thin —
it only calls `bootFeatures()`. All behavior lives in `src/features/*`, each feature a
self-contained folder implementing the `Feature` interface (`src/features/types.ts`).

The flow that ties multiple files together:

- `src/features/registry.ts` holds `ALL_FEATURES` (the single list) and `bootFeatures()`.
  `bootFeatures` reads settings, and for each **enabled** feature calls `setup()`, wiring the
  returned cleanup to `scriptCtx.onInvalidated` so it runs on SPA-nav/HMR teardown. One
  feature throwing is logged and never blocks the others.
- **The same `ALL_FEATURES` array drives the popup** (`src/entrypoints/popup/App.svelte`),
  which lists features and toggles them. Nothing else enumerates features — add a feature in
  one place and both the runtime and the UI pick it up.
- `src/lib/storage.ts` is the typed settings layer over `browser.storage.local`
  (`{ features: Record<id, boolean> }`). `DEFAULT_SETTINGS` is the source of truth for what's
  on by default: shipped features default `true`, stubs default `false`. The popup writes it;
  the content script reads it on boot. It holds **only** on/off flags — a feature that owns
  *data* gets its own key and module (see below).
- **Feature-owned data** goes in its own `browser.storage.local` key with its own typed
  module — `src/lib/presets.ts` is the reference, `src/lib/highlights.ts` the second, and
  `src/lib/drafts.ts` the third (which is also the one place a record id is **derived** rather
  than minted with `newId`, because a composer has to recompute its own draft's key). The
  version lives *inside* the payload, the shape is flat records linked by id, every read runs a
  repair pass, and mutations are pure (`store → store`). The identical plumbing every such
  module needs — `isRecord`/`readString`/`readInt` and the `loadStore`/`saveStore`/`watchStore`
  helpers — lives in `src/lib/store-kit.ts`; a module still owns its key, its shape, its
  `normalize`, its own explicit `toPlain…`, and its mutations. Follow that shape rather than
  inventing a second idiom. See `docs/adr/0012-feature-owned-data-stores.md`.
- `src/lib/phpbb.ts` is the **only** place that knows phpBB's DOM. All selectors
  (`#message` textarea, `#format-buttons`, `.username-coloured`, etc.) and the forum origin
  (`FORUM_MATCHES`, reused by the content-script manifest) live here. Features must go through
  it rather than querying the DOM directly — when the forum skin changes, this is the one file
  to update. Its sibling `src/lib/chatbox.ts` does the same for the AJAX Chat ("la Tribune"),
  which is a *different* system with its own id scheme — and two DOM shapes of its own, the
  homepage shoutbox (`#ajaxChatInputField`) and the standalone `/chat/` page (`#inputField`),
  both handled there. A feature that works on both writing surfaces imports from both.
  Both also own how to *build* a button that matches their toolbar — `createFormatButton` /
  `FORMAT_BUTTON_CLASS` in `phpbb.ts`, `CHAT_BUTTON_CLASS` in `chatbox.ts`. A feature that
  hardcodes those classes is a place the next skin change gets missed.
- **A primitive moves to `src/lib` as soon as a *second* feature needs it** — never
  `import … from '@/features/<other>/…'`, which is the wrong dependency edge and stops a feature
  being deletable. See `docs/adr/0023-shared-primitives-in-lib.md`; `src/lib` takes what is
  feature-agnostic, and anything encoding what *one* feature means stays in its folder.
- `src/lib/keys.ts` owns keyboard-combo primitives — the modifier rows, `RESERVED_LETTERS`,
  layout-independent letter reading, and the tooltip/`aria-keyshortcuts` spellings. Any feature
  claiming a shortcut goes through it and registers its combo in `src/lib/keys.test.ts`'s
  `CLAIMED` list, which is the one place collisions across features are checked. Which BBCode a
  combo drives stays private to `editor-shortcuts/keymap.ts`, which deliberately does **not**
  re-export the shared names — there is one import path for them.
- `src/lib/selection-toolbar.ts` owns the **selection toolbar**: the one floating row that appears
  over a selection inside a post's `.content`. It is a **singleton with registration** — a feature
  calls `registerSelectionToolbarGroup({ id, buttonsFor })` and the module asks every group what it
  offers for the current selection, so `highlight` (swatches + eraser) and `quote-selection` (the
  quote button) share one bar instead of fighting over one selection. It owns the document event
  wiring, locating the post, placement and the theme watch; a feature owns only what its buttons
  mean. Created on the first registration, torn down by the last unregister. **No automated
  coverage by design**, exactly like `popover.ts` — editing it means re-verifying *both* features by
  hand, in both themes and both browsers. See `docs/adr/0028-shared-selection-toolbar.md`.
- `src/lib/popover.ts` (`createPopover`) owns the **anchored popover**: a Svelte surface in a
  shadow root, `position: fixed` against a trigger button in the page, dismissed on outside click
  or Escape, re-measured on scroll/resize, mounted through the async `createShadowRootUi` dance
  that has to survive a navigation landing mid-`await`. Both `bbcode-presets`' menu and
  `emoji-picker`'s panel go through it; the optional `fit` (flip above the trigger, clamp
  horizontally) is on only for the picker, whose chat surface sits at the page bottom. It is
  separate from `src/lib/shadow-ui.ts`, which serves the *vanilla* `.style`-built controls.
  **Its event plumbing has no automated coverage by design** — editing the mount or dismissal
  path means re-verifying both surfaces by hand, in both themes and both browsers. Its
  *geometry* is a different matter and does not live here: `src/lib/anchor-position.ts`
  (`placeAnchored`) owns where a floating surface goes — preferred side, flip when it would
  leave the viewport, horizontal clamp — as pure arithmetic on plain numbers, shared with
  `selection-toolbar.ts` and unit-tested. Callers measure, call it, and assign; that is the
  same split as `planInsertion` / `insertAtRange`.
- **Bulk feature data ships as a `public/` asset, not in the bundle.** Content scripts build as
  a single IIFE, so an imported data table is parsed on every forum page whether or not it is
  used. Generate it with a committed script, commit the output, declare it in
  `web_accessible_resources` scoped to the forum, and `fetch` it through
  `browser.runtime.getURL` on first use. `src/features/emoji-picker/data.ts` +
  `scripts/gen-emoji.mjs` are the reference; see `docs/adr/0022-lazy-loaded-data-assets.md`.
- `src/lib/textarea.ts` is how anything writes **into** the editor. Never assign `.value` or
  call `setRangeText` directly: both destroy the browser's undo stack. `insertAtRange` uses
  `execCommand('insertText')`, which is deprecated but the only API that keeps Ctrl+Z working.
  It is separate from `phpbb.ts` because reading a textarea selection is not forum knowledge.
  See `docs/adr/0013-undo-safe-text-insertion.md`.
- `src/locales/<lang>.yml` is the **single source of truth for user-facing text** (the forum
  is French, so we ship `fr.yml` only; `manifest.default_locale` is `fr`). Strings are
  referenced by key via the typed `#imports`-style helper `import { i18n } from '#i18n'` and
  `i18n.t('features.exitGuard.name')`; `@wxt-dev/i18n` compiles the catalog to `_locales/` and
  generates the key types. Key segments must be **camelCase** (`exitGuard`, not the
  kebab `Feature.id` `exit-guard`) — compiled message-key names allow only `[A-Za-z0-9_]`.
  Never hardcode UI text in a component — add a key. See `docs/adr/0009-i18n-wxt-i18n.md`.
- **UI surfaces.** The popup (`src/entrypoints/popup/`) is an accordion: one row per feature,
  with an optional settings panel. Panels are registered in
  `src/entrypoints/popup/panels.ts` (`featureId → Component`) — **never** as a field on
  `Feature`, because `src/features/*` is in the content script's module graph and content
  scripts build as a single IIFE, so any Svelte reference there lands in `content.js` even if
  lazily imported. The popup also carries a cog that does nothing but open the options page.
  The options page (`src/entrypoints/options/`, opened with
  `browser.runtime.openOptionsPage()`) is the extension's **general** options page: a page
  `<h1>` and one `<section>` per area, with a nav between them — today `#presets` (the preset
  editor, inline in `App.svelte`) and `#backup` (`BackupSection.svelte`). Substantial editing,
  and anything needing a native dialog, belongs there rather than in the popup; adding an area
  means adding a section, a heading and a nav entry.
  See `docs/adr/0014-popup-accordion-options-page.md` and
  `docs/adr/0021-json-export-import.md`.

### Adding a feature

This list is authoritative (`docs/adr/0004-feature-registry.md` says so) — steps 6 and 7 are
conditional, the rest always apply.

1. Create `src/features/<id>/index.ts` exporting a `Feature` (`implemented: true` once real).
   Write it as `export const x = { … } satisfies Feature` with `id: '<id>' as const` — see
   step 4 for why the literal matters.
2. Add its `name`/`description` keys under `features.<camelCaseName>` in `src/locales/fr.yml`
   (camelCase, **not** the kebab id — message keys forbid `-`), and set `name`/`description`
   on the feature to `i18n.t('features.<camelCaseName>.name')` / `.description`.
3. Add it to `ALL_FEATURES` in `src/features/registry.ts`.
4. Add its default enabled state to `DEFAULT_SETTINGS.features` in `src/lib/storage.ts`.
   `DEFAULT_SETTINGS` is typed `Record<FeatureId, boolean>` against the union derived from
   `ALL_FEATURES`, so **forgetting this is a compile error** naming the missing id. It used
   to be a silent failure: the feature shipped and simply never booted.
5. Put any new DOM knowledge in `src/lib/phpbb.ts` (or `src/lib/chatbox.ts` for the Tribune),
   and any new UI text in `src/locales/fr.yml` — not in the feature or component.
6. **If it has settings**, register a popup panel in `src/entrypoints/popup/panels.ts`
   (`featureId → Component`) — never as a field on `Feature`, for the reason in the UI
   surfaces note above. See `docs/adr/0014-popup-accordion-options-page.md`.
7. **If it claims a keyboard combo**, build it through `src/lib/keys.ts` and register it in
   the `CLAIMED` list in `src/lib/keys.test.ts` — the one place collisions across features
   are checked. Nothing enforces this registration; an unregistered combo passes the gate
   silently. See `docs/adr/0023-shared-primitives-in-lib.md`.

The `Feature.id` is the persisted settings key — **never rename an id once shipped**.
A routine feature that stays within this pattern needs no ADR; a feature that introduces a
*new* cross-cutting pattern does (see below).

## Architecture Decision Records

Significant technical decisions are recorded as ADRs in `docs/adr/` — numbered
`NNNN-kebab-title.md`, lightweight Nygard format (**Context → Decision → Consequences**),
indexed in `docs/adr/README.md`. They exist so the *why* behind a choice survives; each
record is immutable once accepted.

**Write an ADR when a change** picks a framework or dependency with real lock-in, introduces
or alters a cross-cutting pattern (how features are structured, where a kind of knowledge
lives, how state is persisted), changes the build/target matrix, or codifies a lasting
constraint or gotcha. **Not** for routine feature code that stays within an existing pattern,
nor for small fixes.

**How:** copy `docs/adr/template.md` to the next number, fill it in, set `Status: Accepted`,
add a row to the index, and link related ADRs with `[[nnnn-slug]]`. To reverse a past
decision, add a *new* ADR and set the old one's status to `Superseded by NNNN` — never
delete or rewrite an existing record.

**The rule for Claude:** when a decision matching the above is made or approved during a
task, create or update the ADR **in the same change** — do not defer it.

## Cross-browser specifics

- WXT emits **Chrome MV3** and **Firefox MV2** from the same source (its sensible default;
  MV2 is fully supported on Firefox and avoids MV3 background friction). Use the `browser.*`
  API (WXT injects the webextension-polyfill) — never `chrome.*`.
- WXT APIs (`defineContentScript`, `browser`, `ContentScriptContext`, …) are imported
  explicitly from `#imports` because auto-imports are **disabled** (`imports: false` in
  `wxt.config.ts`) — prefer explicit ES imports over relying on globals.
- `manifest.browser_specific_settings.gecko` (id + `data_collection_permissions`) is Firefox-
  only config; Chrome ignores it. The `host_permissions` origin is store-review-visible —
  keep it narrow.

## Gotchas

- **TypeScript is pinned to 5.x on purpose.** `svelte-check` (and much tooling) is not yet
  compatible with the TypeScript 7 native port, which crashes with
  `Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')`. Do not bump
  `typescript` to `^7`.
- **Run `pnpm exec wxt prepare` after editing `src/locales/fr.yml`.** A bare `pnpm check`
  does *not* regenerate `.wxt/i18n/structure.d.ts`, so new keys fail type-check until you do.
  (`pnpm dev` and `pnpm install` run it for you.) This bites every single time.
- **Never write a bare `{SELECTION}` / `{CURSOR}` in `fr.yml`.** `@wxt-dev/i18n` parses
  `/\{[A-Za-z0-9_]+\}/` as a *named substitution* and then makes the argument mandatory, so
  the string stops type-checking. It's intermittent, too: `{SELECTION|upper}` does **not**
  match (the `|` is outside the character class) but `{SELECTION}` does. Lean into it — write
  a lowercase named substitution and fill it from the constants:
  `i18n.t('…syntaxHelp', { sel: SELECTION_TOKEN, cur: CURSOR_TOKEN })`.
- **A button injected into phpBB's composer must be `type="button"` with no `name`.**
  `<form id="postform">` is where our toolbar trigger lives; a submit-type button there fires
  a submit event that exit-guard reads as a genuine post (its `GUARDED_SUBMITTER_NAMES`
  check short-circuits on a *recognised* name, so a `null` name falls through to being
  guarded) and **sends the half-written message**. Build such buttons with
  `createFormatButton` in `src/lib/phpbb.ts`, which sets the type and never accepts a name
  — the hazard is structural there rather than something to remember at each call site.
- **phpBB regenerates the colour palette grid.** `registerPalette` (core.js) replaces
  `#color_palette_placeholder`'s server-rendered table on DOM-ready and binds each swatch's
  click *per-anchor*, and a content script can run either side of that. Anything decorating the
  palette (color-grab's "Sur la page" filter) must install idempotently and re-run when the grid
  is rebuilt — watch the placeholder with a `MutationObserver`, and keep injected controls
  *outside* it so they survive. See `docs/adr/0019` and `findColourPalette` in `phpbb.ts`.
- **The highlight paint layer is a page-level `<style>`, not shadow-scoped.** `::highlight()`
  is a pseudo-element rule the page's own style engine applies to the *post* text, so it cannot
  live in a shadow root or an element's `.style` — `highlight/render.ts` injects one `<style>`
  into `<head>` (CSP-safe on this forum per ADR 0016). The feature **feature-detects** the CSS
  Custom Highlight API (`isHighlightApiSupported`) and no-ops on Firefox < 140 / Chrome < 105,
  so a highlight is never created where it couldn't be shown. Its ranges are anchored by numeric
  post id + `.content` char offsets + the quoted text (`highlight/anchor.ts`), which is what
  lets a highlight survive a reload and appear on the same post in both viewtopic and the topic
  review. See `docs/adr/0020-persistent-text-highlights.md`.
- `beforeunload` (used by exit-guard) is the only cross-browser way to veto navigation
  including the back button; browsers ignore any custom message, so the prompt wording is
  the browser's own.
- Toggling a feature in the popup — or importing settings from a backup — only takes effect on
  the **next page load**: `bootFeatures` reads settings once at boot. Both UIs say so; making
  toggles live would mean watching settings in `registry.ts`.
- **The action popup closes the instant it loses focus, and a native `<input type="file">` dialog
  steals focus** — most reliably reproducible on Linux, where that dialog is a separate top-level
  window, but not guaranteed safe on any platform. A file picker (or any other OS-level dialog)
  triggered from the popup opens fine, but the popup — and everything waiting inside it, including
  whatever was meant to receive the picked file — is already gone by the time the user finishes.
  Anything that needs a native dialog belongs on the options page (a real tab), not the popup; see
  `docs/adr/0021-json-export-import.md`, which shipped broken in the popup once before landing here.
- **`web_accessible_resources` is emitted differently per target.** WXT rewrites the MV3 object
  form (`[{ resources, matches }]`) into MV2's bare array (`['…']`) for the Firefox build, so
  the two manifests genuinely differ here — check **both** `.output/*/manifest.json` after
  touching it. A missing entry is not a build error: the `fetch` just fails at runtime, which
  is why `emoji-picker/data.ts` names that cause in its warning.
- **A panel that stays open across insertions must re-snapshot the range *and* restore focus
  after each one.** The emoji picker only closes on Escape or an outside click, so every insert
  has to (a) read the caret back off the textarea — `insertAtRange` moved it, and reusing the
  stale range makes each emoji overwrite the last — and (b) hand focus back to its search box,
  which `insertAtRange` had to take to run `execCommand`. The `bbcode-presets` menu needs
  neither because it closes on select and has nothing to type into; it takes the opposite
  approach throughout (never focus, keep the selection alive via `preventDefault` on mousedown).
  Copying either pattern without its counterpart loses the user's selection.
- In shadow-DOM UI, test containment with `event.composedPath()`, never
  `element.contains(event.target)` — targets are retargeted to the shadow host.
- Likewise use `root.activeElement` (the `ShadowRoot`), not `document.activeElement`,
  which reports the shadow *host* for anything focused inside.
- **Never pass Svelte `$state` straight to `browser.storage`.** `$state` deep-proxies its
  object, and a `Proxy` is not structured-cloneable: Firefox clones on the way into
  `storage.local` and throws `DataCloneError`, while Chrome serializes by reading properties
  and persists it happily. The result is a feature that saves nothing **on Firefox only**.
  Rebuild a plain object first — `toPlainStore` in `src/lib/presets.ts` and `toPlainSettings` in
  `src/lib/storage.ts` are the pattern, each called from **inside** its own `save…` so the guard
  sits at the boundary and not at one call site. Test both browsers whenever a UI writes to
  storage.
- **Report save failures, and only report what has resolved.** `.finally()` does not catch, so
  chaining it onto a write shows a success message even when the write rejected — exactly how the
  bug above stayed invisible. Equally, never announce a result over a write that is still queued:
  a debounced write (the preset editor's `commit`) reports through its own status line, so a
  one-shot bulk operation should `await` its own `save…` rather than borrow that machinery.
- Custom properties inherit **downwards only**: a `--dlh-*` palette set on a component root is
  invisible to `<body>`. The theme class therefore sits on `<html>` in the popup/options HTML.
- **In-page UI must follow the forum's theme, not the OS's.** The skin marks dark mode with
  a `dark` class on `<html>` (`isDarkTheme` / `watchTheme` in `phpbb.ts`);
  `@media (prefers-color-scheme: dark)` would invert the UI for a light forum on a dark
  desktop. CSS can't read the host page's classes from inside a shadow root portably
  (`:host-context()` is unsupported in Firefox), so the flag is detected in JS and pushed in
  as a `.dark` class. Colours come from the shared `--dlh-*` palette
  (`src/lib/palette.css`): `.dlh-theme` for in-page surfaces (class-driven),
  `.dlh-theme-auto` for the popup and options page (media-query-driven). Components should
  read `var(--dlh-…)` and never hardcode a colour.
- Icons live in `public/icon/{16,32,48,96,128}.png` (WXT's default `public/` dir, at repo
  root — **not** `src/public/`). Regenerate from the source with:
  `for s in 16 32 48 96 128; do rsvg-convert -w $s -h $s icon.svg -o public/icon/$s.png; done`
- There are **two** icon sources at repo root, both 128×128 and sharing one traced mark (the
  forum's flame, vectorised from `dreamland-reborn.net/favicon.ico`):
  `icon.svg` is the shipped extension icon — bare mark, transparent, so it sits on the
  browser toolbar. `icon-store.svg` is the **listing** icon for the AMO/Chrome Web Store
  pages, the same mark on a dark badge (a transparent icon disappears on a white listing
  page). It is not bundled; render it when filling in a listing with
  `rsvg-convert -w 512 -h 512 icon-store.svg -o store/icon-512.png`.
  The mark keeps a white rim *and* a dark outline on purpose — that is what makes it legible
  on both light and dark toolbars. Don't drop either when editing.
- **Listing assets live in `store/`**, rendered from committed sources, never hand-edited as
  PNGs. `store/promo-tile.svg` is the third source (440×280 Chrome promo tile: the same mark,
  re-inlined from `icon-store.svg`, plus a wordmark baked in DejaVu Sans). Regenerate with:
  `rsvg-convert -w 440 -h 280 store/promo-tile.svg -o store/promo-440x280.png` and
  `rsvg-convert -w 96 -h 96 icon-store.svg | magick png:- -background none -gravity center -extent 128x128 store/icon-128-cws.png`.
  The two 128px icons are **not** interchangeable: `icon-128.png` is full-bleed (AMO), while
  Chrome wants 96×96 of artwork inside 16px of transparent padding (`icon-128-cws.png`).
  `store/listing-fr.md` holds every store field, and it is only true if kept true — when a
  feature ships or is dropped, update the description *and* the single-purpose answer there,
  since an inaccurate listing is itself a policy violation. See `docs/adr/0018`.
