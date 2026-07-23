# 0001. Build the extension on WXT

Status: Accepted

Date: 2026-07-23

## Context

Dreamland Reborn QoL must ship to two stores from one codebase (Chrome/Brave and Firefox),
bundle TypeScript and Svelte, and offer a fast edit-reload loop during development.
Hand-rolling this means owning a Vite/Rollup config, a manifest generator, per-browser
build targets, HMR wiring for content scripts, and the `chrome.*`/`browser.*` polyfill —
all before writing a single feature. The alternatives considered were a bare Vite +
`@crxjs/vite-plugin` setup and a plain manual MV3 project.

## Decision

We will build on [WXT](https://wxt.dev), a Vite-based framework purpose-built for web
extensions. It provides file-based entrypoints, per-browser build/zip commands, manifest
generation, content-script HMR, and the webextension-polyfill out of the box.

## Consequences

- Almost no build config to maintain: `wxt.config.ts` is small and declarative.
- Cross-browser output, dev servers, and store zips are single commands
  (see [[0002-chrome-mv3-firefox-mv2]]).
- We accept WXT's conventions as constraints: entrypoints live where WXT expects, APIs are
  imported from `#imports`, and `public/` is the asset root. We opt out of one convention —
  auto-imports are disabled — in favour of explicit ES imports.
- We take on WXT (and its Vite major) as an upgrade surface; framework churn is now our churn.

Related: [[0002-chrome-mv3-firefox-mv2]], [[0003-svelte-5-popup-ui]]
