# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Dreamland Reborn QoL** is a cross-browser (Brave/Chromium + Firefox) extension of writing
aids for the PHPBB 3.20 roleplay forum at **dreamland-reborn.net**. It is built with
[WXT](https://wxt.dev) (Vite-based) and Svelte 5.

Planned features (only #1 is implemented; #2–#4 are stubs awaiting design with the user):

1. **Message loss protection** (`exit-guard`) — keep a written post from being lost: warn
   before leaving the editor with unsaved text, and verify the forum is reachable before a
   send (if it's down, hold the post back and offer to keep the text or send anyway). _(done)_
2. **Highlight GM text** — persistently highlight passages of another post while replying.
3. **BBCode presets** — insert complex BBCode structures in one click.
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
```

`pnpm check` is the type gate — there is no standalone `tsc` build step (WXT/Vite bundles
without one). Run it after any change to `.ts`/`.svelte`.

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
  the content script reads it on boot.
- `src/lib/phpbb.ts` is the **only** place that knows phpBB's DOM. All selectors
  (`#message` textarea, `.username-coloured`, etc.) and the forum origin (`FORUM_MATCHES`,
  reused by the content-script manifest) live here. Features must go through it rather than
  querying the DOM directly — when the forum skin changes, this is the one file to update.
- `src/locales/<lang>.yml` is the **single source of truth for user-facing text** (the forum
  is French, so we ship `fr.yml` only; `manifest.default_locale` is `fr`). Strings are
  referenced by key via the typed `#imports`-style helper `import { i18n } from '#i18n'` and
  `i18n.t('features.exitGuard.name')`; `@wxt-dev/i18n` compiles the catalog to `_locales/` and
  generates the key types. Key segments must be **camelCase** (`exitGuard`, not the
  kebab `Feature.id` `exit-guard`) — compiled message-key names allow only `[A-Za-z0-9_]`.
  Never hardcode UI text in a component — add a key. See `docs/adr/0009-i18n-wxt-i18n.md`.

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
- `beforeunload` (used by exit-guard) is the only cross-browser way to veto navigation
  including the back button; browsers ignore any custom message, so the prompt wording is
  the browser's own.
- Icons live in `public/icon/{16,32,48,96,128}.png` (WXT's default `public/` dir, at repo
  root — **not** `src/public/`). Regenerate from the source with:
  `for s in 16 32 48 96 128; do rsvg-convert -w $s -h $s icon.svg -o public/icon/$s.png; done`
