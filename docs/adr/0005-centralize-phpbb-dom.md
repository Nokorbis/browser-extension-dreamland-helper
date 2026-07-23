# 0005. Centralize phpBB DOM knowledge in one module

Status: Accepted

Date: 2026-07-23

## Context

Every feature operates on the phpBB 3.20 forum's markup — the `#message` textarea,
`.username-coloured` spans, inline `[color]` output, and the forum origin. phpBB skins and
markup change between versions, and if each feature queried the DOM directly, a skin update
would mean hunting selectors across the whole codebase, with subtle drift between features
that each grew their own copy of a selector.

## Decision

We will keep **all** knowledge of the forum's DOM in a single module,
`src/lib/phpbb.ts`: selectors, DOM-reading helpers (`findMessageTextarea`,
`findColouredUsernames`, `isPostingPage`), and the forum origin (`FORUM_MATCHES`, reused by
the content-script manifest). Features must go through these helpers and never query the DOM
directly.

## Consequences

- When the forum skin changes, there is exactly one file to update.
- `FORUM_MATCHES` is the single source of truth shared by both the runtime and the manifest
  `matches`, so they cannot disagree.
- A small amount of indirection: a feature that needs new DOM must add a helper here first
  (see the "Adding a feature" steps in CLAUDE.md) rather than inlining a selector.

Related: [[0004-feature-registry]]
