# 0025. Feature ids are a type, not a convention

Status: Accepted

Date: 2026-08-12

## Context

[[0004-feature-registry]] made `ALL_FEATURES` the single list of features, and
[[0006-typed-settings-storage]] made `DEFAULT_SETTINGS.features` the single source of truth for
which ones are on by default. Two lists, kept in agreement by a checklist step in CLAUDE.md.

Nothing enforced that agreement. `Feature.id` was typed `string`, and
`DEFAULT_SETTINGS.features` was a `Record<string, boolean>`, so a feature added to
`ALL_FEATURES` and forgotten in `DEFAULT_SETTINGS` type-checked, linted, built, passed the test
suite, and shipped — where `bootFeatures` would read `settings.features[feature.id]`, find
`undefined`, and silently never start it. The failure surfaces as "the feature does nothing",
with nothing logged and nothing to grep for, and the checklist step that prevents it is step 4
of seven.

That is the worst shape a mistake can take in this codebase: silent, shipped, and invisible to
every gate.

## Decision

We will derive the set of feature ids from `ALL_FEATURES` as a type, and pin
`DEFAULT_SETTINGS` to it.

```ts
export const ALL_FEATURES = [ … ] as const satisfies readonly Feature[];
export type FeatureId = (typeof ALL_FEATURES)[number]['id'];
```

Two things make that union real rather than `string`, and both are load-bearing:

- Each feature is written `export const x = { … } satisfies Feature`, **not**
  `: Feature`. An explicit annotation widens the object to the interface and the literal id is
  lost.
- Each `id` is written `'exit-guard' as const`. Object-literal properties widen to `string` on
  inference, and `satisfies Feature` does not prevent that — `Feature.id` is a `string`, so it
  supplies no literal contextual type.

`DEFAULT_SETTINGS` is then typed `{ features: Record<FeatureId, boolean> }`, and a missing entry
is a compile error naming the id.

`Settings.features` stays `Record<string, boolean>`. That is deliberate and is the interesting
half of this decision: it is also the shape read back from `storage.local` and from an imported
backup file, both of which can legitimately carry an id this build has never heard of — one from
a newer version, or one since removed. Narrowing *that* would mean discarding a flag from the
future on every round trip through an older build.

## Consequences

Step 4 of the "Adding a feature" checklist is now enforced by `pnpm check`, by name. The
checklist keeps the step anyway, because a compile error is a worse way to learn a rule than
reading it.

The cost is a small, non-obvious idiom that every future feature has to copy: `satisfies Feature`
plus `as const` on the id. Both are commented at each site, and getting either wrong fails
open — `FeatureId` silently widens back to `string` and the guard stops guarding without
breaking anything. A change to this idiom should be checked by deleting an entry from
`DEFAULT_SETTINGS` and confirming `pnpm check` still fails; that is how the original
implementation here was caught not working.

Only one direction is checked. A *stale* entry — a default for a feature that has since been
removed — still type-checks, because `Record<FeatureId, boolean>` constrains what must be
present, not what may not be. It is harmless (`bootFeatures` never looks it up) and the
alternative costs more than it saves.

A runtime cross-check in the test suite would catch both directions and is deliberately **not**
added: importing `ALL_FEATURES` pulls in every feature module, and those import Svelte
components, which the node-only suite cannot parse. That is the same constraint that keeps
`POPUP_PANELS` off the `Feature` interface ([[0014-popup-accordion-options-page]]) — the
registry is in the content script's module graph, and that graph does not fit in a unit test.

Related: [[0004-feature-registry]], [[0006-typed-settings-storage]],
[[0014-popup-accordion-options-page]]
