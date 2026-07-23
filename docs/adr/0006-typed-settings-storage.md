# 0006. Typed settings layer over browser.storage.local

Status: Accepted

Date: 2026-07-23

## Context

The popup writes which features are enabled and the content script reads that on boot, in
two different extension contexts and across two browsers. Reading and writing
`browser.storage.local` ad hoc from both sides invites drift: mismatched keys, missing
defaults for a newly added feature, and duplicated shape assumptions.

## Decision

We will funnel all persistence through one typed module, `src/lib/storage.ts`, exposing a
`Settings` type (`{ features: Record<id, boolean> }`) and `loadSettings` /
`saveSettings` / `setFeatureEnabled`. `DEFAULT_SETTINGS` is the single source of truth for
default enabled state — shipped features default `true`, stubs default `false` — and
`loadSettings` merges stored values over the defaults so an id absent from storage falls
back rather than being `undefined`.

## Consequences

- The popup and content script share one schema and one set of defaults; neither reaches
  into `browser.storage` directly.
- Adding a feature requires adding its default here (one of the three touch-points from
  [[0004-feature-registry]]); forgetting means it has no default state.
- Uses the cross-browser `browser.*` API, so the layer is browser-agnostic
  (see [[0002-chrome-mv3-firefox-mv2]]).
- The merge-over-defaults strategy means new default-`true` features light up for existing
  users automatically on upgrade.

Related: [[0004-feature-registry]], [[0002-chrome-mv3-firefox-mv2]]
