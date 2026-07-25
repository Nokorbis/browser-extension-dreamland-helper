# 0004. Thin content script, feature registry

Status: Accepted

Date: 2026-07-23

## Context

The extension is a bag of loosely related writing aids (exit guard, highlighting, BBCode
presets, colour grabbing) that will grow over time. If the single content script grew a
branch per feature, it would become a tangle where features share state implicitly, one
feature's crash could take down the rest, and the popup would need its own hand-maintained
copy of "what features exist."

## Decision

We will keep **one thin content script** (`src/entrypoints/content.ts`) that only calls
`bootFeatures()`. Each feature is a self-contained folder under `src/features/` implementing
a common `Feature` interface (`setup()` returning an optional cleanup). A single
`ALL_FEATURES` array in `src/features/registry.ts` is the only enumeration of features;
`bootFeatures` reads settings and calls `setup()` for each enabled feature, wiring its
cleanup to `scriptCtx.onInvalidated` (SPA-nav / HMR teardown). A throw in one feature is
logged and never blocks the others.

## Consequences

- Adding a feature touches a small, known set of places — its folder, `ALL_FEATURES`, and its
  default in the settings (see [[0006-typed-settings-storage]]) at minimum, plus whatever later
  cross-cutting layers add their own touchpoint (locale keys per [[0009-i18n-wxt-i18n]], an
  optional popup panel per [[0014-popup-accordion-options-page]]) — see the "Adding a feature"
  checklist in CLAUDE.md for the current, authoritative list. The popup picks a new feature up
  for free because it iterates the same array (see [[0003-svelte-5-popup-ui]]).
- Feature isolation is real: independent lifecycles, independent failures.
- The `Feature.id` is a persisted settings key, so it is effectively permanent — renaming a
  shipped id silently resets users' toggles.
- Shared services (page context today) flow through the `FeatureContext` handed to `setup()`,
  giving one place to grow cross-feature capabilities.

Related: [[0005-centralize-phpbb-dom]], [[0006-typed-settings-storage]], [[0003-svelte-5-popup-ui]], [[0009-i18n-wxt-i18n]], [[0014-popup-accordion-options-page]]
