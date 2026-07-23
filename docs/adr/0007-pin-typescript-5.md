# 0007. Pin TypeScript to the 5.x line

Status: Accepted

Date: 2026-07-23

## Context

TypeScript's native port (the "TypeScript 7" line) is available, but `svelte-check` — the
type gate for this project (`pnpm check`) — and much of the surrounding tooling is not yet
compatible with it. Running the checker against the native port crashes with
`Cannot read properties of undefined (reading 'useCaseSensitiveFileNames')`, which breaks
the only type-verification step we have.

## Decision

We will pin `typescript` to the `^5` line in `package.json` and not bump it to `^7` until
`svelte-check` supports the native port. `pnpm check` (svelte-check) remains the sole type
gate; there is no standalone `tsc` build step, since WXT/Vite bundles without one.

## Consequences

- The type check stays reliable across local runs and CI.
- We forgo the native port's speed and newest features until the toolchain catches up; this
  ADR should be revisited (and superseded) when `svelte-check` is compatible.
- Anyone bumping TypeScript must know this constraint — it is also recorded as a gotcha in
  CLAUDE.md.

Related: [[0003-svelte-5-popup-ui]]
