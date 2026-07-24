# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Dreamland Reborn QoL** is a cross-browser (Brave/Chromium + Firefox) extension of writing
aids for the PHPBB 3.20 roleplay forum at **dreamland-reborn.net**. It is built with
[WXT](https://wxt.dev) (Vite-based) and Svelte 5.

Planned features (#1 and #3 are implemented; #2 and #4 are stubs awaiting design with the user):

1. **Message loss protection** (`exit-guard`) — keep a written post from being lost: warn
   before leaving the editor with unsaved text, and verify the forum is reachable before a
   send (if it's down, hold the post back and offer to keep the text or send anyway). _(done)_
2. **Highlight GM text** — persistently highlight passages of another post while replying.
3. **BBCode presets** — insert complex BBCode structures in one click, from a button in
   phpBB's BBCode toolbar or a panel beside the editor. Presets live in nested folders and
   are authored in the options page. _(done)_
4. **Color grabber** — grab another poster's color and reuse it.

## Commands

```bash
pnpm dev             # Chromium/Brave dev with HMR (auto-opens a browser profile)
pnpm dev:firefox     # Firefox dev with HMR
pnpm build           # Production build → .output/chrome-mv3/
pnpm build:firefox   # Production build → .output/firefox-mv2/
pnpm zip             # Distributable zip for Chrome Web Store
pnpm zip:firefox     # Distributable zip for AMO
pnpm check           # svelte-check type check (run this instead of `tsc`)
pnpm test            # vitest — pure logic only (see below)
```

`pnpm check` is the type gate — there is no standalone `tsc` build step (WXT/Vite bundles
without one). Run it after any change to `.ts`/`.svelte`.

`pnpm test` covers **pure logic only**: the preset template engine
(`src/features/bbcode-presets/template.ts`) and the preset store's tree invariants
(`src/lib/presets.ts`). That scoping is deliberate — everything else is DOM/browser glue that
is cheaper to verify by hand against a real forum page. Don't backfill tests for it; do keep
new pure logic covered. Both are CI gates.

**Loading unpacked for manual testing:** build, then in the browser load `.output/chrome-mv3`
(Brave: `brave://extensions` → Developer mode → Load unpacked) or `.output/firefox-mv2`
(Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → pick `manifest.json`).
`pnpm dev` does this automatically with live reload.

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
  module — `src/lib/presets.ts` is the reference. The version lives *inside* the payload, the
  shape is flat records linked by id, every read runs a repair pass, and mutations are pure
  (`store → store`). Follow that shape rather than inventing a second idiom.
  See `docs/adr/0012-feature-owned-data-stores.md`.
- `src/lib/phpbb.ts` is the **only** place that knows phpBB's DOM. All selectors
  (`#message` textarea, `#format-buttons`, `.username-coloured`, etc.) and the forum origin
  (`FORUM_MATCHES`, reused by the content-script manifest) live here. Features must go through
  it rather than querying the DOM directly — when the forum skin changes, this is the one file
  to update.
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
  lazily imported. Substantial editing belongs in the options page
  (`src/entrypoints/options/`), opened with `browser.runtime.openOptionsPage()`.
  See `docs/adr/0014-popup-accordion-options-page.md`.

### Adding a feature

1. Create `src/features/<id>/index.ts` exporting a `Feature` (`implemented: true` once real).
2. Add its `name`/`description` keys under `features.<camelCaseName>` in `src/locales/fr.yml`
   (camelCase, **not** the kebab id — message keys forbid `-`), and set `name`/`description`
   on the feature to `i18n.t('features.<camelCaseName>.name')` / `.description`.
3. Add it to `ALL_FEATURES` in `src/features/registry.ts`.
4. Add its default enabled state to `DEFAULT_SETTINGS.features` in `src/lib/storage.ts`.
5. Put any new DOM knowledge in `src/lib/phpbb.ts`, and any new UI text in `src/locales/fr.yml`
   — not in the feature or component.

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
  a submit event that exit-guard reads as a genuine post (its `submitterName !== 'post'`
  short-circuit doesn't catch a `null` name) and **sends the half-written message**.
- `beforeunload` (used by exit-guard) is the only cross-browser way to veto navigation
  including the back button; browsers ignore any custom message, so the prompt wording is
  the browser's own.
- Toggling a feature in the popup only takes effect on the **next page load** — `bootFeatures`
  reads settings once at boot. The popup says so; making toggles live would mean watching
  settings in `registry.ts`.
- In shadow-DOM UI, test containment with `event.composedPath()`, never
  `element.contains(event.target)` — targets are retargeted to the shadow host.
- Likewise use `root.activeElement` (the `ShadowRoot`), not `document.activeElement`,
  which reports the shadow *host* for anything focused inside.
- **Never pass Svelte `$state` straight to `browser.storage`.** `$state` deep-proxies its
  object, and a `Proxy` is not structured-cloneable: Firefox clones on the way into
  `storage.local` and throws `DataCloneError`, while Chrome serializes by reading properties
  and persists it happily. The result is a feature that saves nothing **on Firefox only**.
  Rebuild a plain object first — `toPlainStore` in `src/lib/presets.ts` is the pattern (or
  `$state.snapshot()` at the call site). Test both browsers whenever a UI writes to storage.
- **Report save failures.** `.finally()` does not catch, so chaining it onto a write shows a
  success message even when the write rejected — exactly how the bug above stayed invisible.
- Custom properties inherit **downwards only**: a `--dlh-*` palette set on a component root is
  invisible to `<body>`. The theme class therefore sits on `<html>` in the popup/options HTML.
- **In-page UI must follow the forum's theme, not the OS's.** The skin marks dark mode with
  a `dark` class on `<html>` (`isDarkTheme` / `watchTheme` in `phpbb.ts`);
  `@media (prefers-color-scheme: dark)` would invert the UI for a light forum on a dark
  desktop. CSS can't read the host page's classes from inside a shadow root portably
  (`:host-context()` is unsupported in Firefox), so the flag is detected in JS and pushed in
  as a `.dark` class. Colours come from the shared `--dlh-*` palette
  (`src/features/bbcode-presets/palette.css`): `.dlh-theme` for in-page surfaces (class-driven),
  `.dlh-theme-auto` for the popup and options page (media-query-driven). Components should
  read `var(--dlh-…)` and never hardcode a colour.
- Icons live in `public/icon/{16,32,48,96,128}.png` (WXT's default `public/` dir, at repo
  root — **not** `src/public/`). Regenerate from the source with:
  `for s in 16 32 48 96 128; do rsvg-convert -w $s -h $s icon.svg -o public/icon/$s.png; done`
