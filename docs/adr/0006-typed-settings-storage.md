# 0006. Typed settings layer over browser.storage.local

Status: Accepted

Date: 2026-07-23

## Context

The popup writes which features are enabled and the content script reads that on boot, in
two different extension contexts and across two browsers. Reading and writing
`browser.storage.local` ad hoc from both sides invites drift: mismatched keys, missing
defaults for a newly added feature, and duplicated shape assumptions.

## Decision

> **Later scope note (see [[0012-feature-owned-data-stores]]):** "all persistence" was true when
> this was written, when on/off flags were the only state. 0012 later gave each feature that owns
> *data* its own `storage.local` key and typed module, and `storage.ts` itself now borrows its
> plumbing from `src/lib/store-kit.ts`. What survives unchanged is this record's actual subject —
> the settings map is one typed module with one set of defaults, and nothing reaches
> `browser.storage` for it directly. 0012 explicitly leaves `storage.ts` as it is; this is an
> amendment of scope, not a supersession.

We will funnel all persistence through one typed module, `src/lib/storage.ts`, exposing a
`Settings` type (`{ features: Record<id, boolean> }`) and `loadSettings` /
`saveSettings` / `setFeatureEnabled`. `DEFAULT_SETTINGS` is the single source of truth for
default enabled state — shipped features default `true`, stubs default `false` — and
`loadSettings` merges stored values over the defaults so an id absent from storage falls
back rather than being `undefined`.

## Consequences

- The popup and content script share one schema and one set of defaults; neither reaches
  into `browser.storage` directly.
- Adding a feature requires adding its default here (one of the touch-points from
  [[0004-feature-registry]]'s "Adding a feature" checklist); forgetting means it has no
  default state.
- Uses the cross-browser `browser.*` API, so the layer is browser-agnostic
  (see [[0002-chrome-mv3-firefox-mv2]]).
- The merge-over-defaults strategy means new default-`true` features light up for existing
  users automatically on upgrade.

Related: [[0004-feature-registry]], [[0002-chrome-mv3-firefox-mv2]]
