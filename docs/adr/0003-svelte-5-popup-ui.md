# 0003. Svelte 5 for the popup UI

Status: Accepted

Date: 2026-07-23

## Context

The extension needs a small toolbar popup that lists features and toggles them. The surface
is tiny (one list, checkboxes, storage reads/writes), so a heavy UI runtime would be
disproportionate. Options ranged from hand-written DOM to React to Svelte. The maintainer
also has a standing preference for Svelte when a project needs UI.

## Decision

We will build the popup with **Svelte 5** (using runes, e.g. `$state`), wired in through
WXT's `@wxt-dev/module-svelte`. The popup renders the shared feature list and persists
toggles via the settings layer.

## Consequences

- Compiled output is small with no virtual-DOM runtime — appropriate for a popup.
- Svelte 5 runes are the assumed model; contributors need to know them, and the version is
  a coupled upgrade (Svelte and `svelte-check` move together — see [[0007-pin-typescript-5]]).
- The popup consumes the same `ALL_FEATURES` array the content script boots, so the UI and
  runtime never drift (see [[0004-feature-registry]]).

Related: [[0001-build-on-wxt]], [[0004-feature-registry]], [[0007-pin-typescript-5]]
