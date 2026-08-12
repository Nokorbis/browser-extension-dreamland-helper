# 0024. A lint and format gate, scoped to what the other gates can't see

Status: Accepted

Date: 2026-08-12

## Context

Until now the project had two automated gates — `pnpm check` (svelte-check) and `pnpm test`
(vitest) — and no linter or formatter at all. Style consistency across ~5,600 lines of source
was maintained entirely by hand, and it genuinely held: an audit found zero `any`, zero
`@ts-ignore`, zero suppressions, zero commented-out code and no stray `console.*`.

It held because one person wrote all of it. Two things argued for automating it anyway:

1. **The defects a linter finds here are real, not stylistic.** A first run over the existing
   tree reported 19 problems, and every one was legitimate. Among them: a floating promise in
   the popup's settings load; an `async` submit listener whose rejection could never surface;
   six cases of a `const` referenced above its own declaration (in `highlight/index.ts`,
   `highlight/toolbar.ts`, `color-grab/index.ts`), each safe only by accident of call order
   and a reorder away from a TDZ `ReferenceError`; three unnecessary type assertions; and two
   stale `svelte-ignore` comments for warnings the compiler no longer emits.
2. **The project's own written rules were being enforced by memory.** CLAUDE.md's "report save
   failures, and only report what has resolved" exists because a swallowed rejection shipped
   broken once. `@typescript-eslint/no-floating-promises` enforces that mechanically.

The risk was the opposite one: a formatter run over a codebase this carefully written is a
large, blame-destroying diff that buys little. That risk turned out to be real but bounded —
and only in prose.

## Decision

We will add **Prettier** and **ESLint**, gated in CI as `pnpm lint`, with both scopes cut
deliberately narrow.

**ESLint carries only rules that catch a class of defect the other two gates cannot see.**
`pnpm check` already owns type errors; Prettier owns layout. So `eslint.config.js` adds
essentially four judgements on top of the recommended sets:
`no-floating-promises`, `no-use-before-define` (variables only — functions hoist, so they are
exempt and are the sanctioned way to write two mutually-referencing helpers),
`consistent-type-assertions`, and `no-unnecessary-type-assertion`. `no-console` is on
everywhere except `src/lib/log.ts`, which is the one sanctioned console access.
`svelte/prefer-svelte-reactivity` is **off**: it fires on any `new Set()` reachable from
`$state`, but this codebase reassigns collections rather than mutating them, which is already
reactive.

**Prettier formats code, not prose.** `printWidth: 90`, chosen by measuring the existing tree
— only 48 lines exceeded it — so the reformat mostly *collapsed* over-wrapped calls rather
than rewrapping. Two exclusions matter:

- **`*.md` is ignored.** Prettier's only effect on the docs was rewriting `*emphasis*` to
  `_emphasis_` in every file, `docs/adr/` included. An ADR is immutable once accepted; a
  record reflowed by a tool is no longer the record that was reviewed.
- **`src/locales/*.yml` is ignored.** `@wxt-dev/i18n` parses `{name}` inside a value as a
  named substitution, so the catalogue's content is load-bearing in ways a formatter cannot
  see, and reflowing it buys nothing.

## Consequences

Three CI gates now instead of two, and a `pnpm format` escape hatch for the failure mode
`pnpm lint` will most often report.

The nineteen findings were all fixed rather than suppressed, so the codebase keeps its
property of having **zero inline lint suppressions** — the one deviation is a single rule
disabled in the config, with its reasoning written next to it. That property is worth
defending: the next `eslint-disable` comment should be an argument about the rule, not a
patch over one call site. Rules were turned off in the config for the same reason: a
suppression at a call site hides a decision, a rule turned off in the config states one.

The `no-use-before-define` rule has a real cost. Mutually-referencing helpers inside a
feature's `setup()` closure are a genuine and readable pattern (an observer that calls
`install`, and an `install` that disconnects the observer), and the rule forbids the
`const`-arrow spelling of it. The sanctioned form is a hoisted `function` declaration for
whichever half is referenced early — which is what makes the ordering safe by construction
rather than by luck. Three sites were rewritten this way.

The formatting commit is large and touches most of `src/`. It is deliberately kept separate
from every behavioural change so `git blame` has exactly one commit to skip, and
`.git-blame-ignore-revs` is the place to record it if that ever becomes a nuisance.

Nothing here is a substitute for the manual verification that DOM glue still needs: none of
these tools has ever loaded a forum page.

Related: [[0007-pin-typescript-5]], [[0012-feature-owned-data-stores]]
