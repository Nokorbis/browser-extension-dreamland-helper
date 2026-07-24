# 0014. Popup accordion plus an options page for feature settings

Status: Accepted

Date: 2026-07-24

## Context

The popup was a flat list of checkboxes ([[0003-svelte-5-popup-ui]]) because a feature had
nothing to configure beyond on/off. BBCode presets breaks that: it owns a library of
user-authored records that needs somewhere to be created, renamed, reorganised and previewed.

A browser popup is roughly 23 rem wide and — the part that decides it — **closes on any
outside click**. Editing a multi-line BBCode body there means a stray click can discard
half-typed work. At the same time, the popup is where a user looks first, so pushing
*everything* into a separate page would leave it uninformative.

There was also a structural question. The project's rule is that `ALL_FEATURES` is the only
enumeration of features ([[0004-feature-registry]]) — both the runtime and the popup iterate
it, so neither can drift. The obvious way to let a feature contribute a settings panel is an
optional `popupPanel` field on the `Feature` interface. But `src/features/*` is in the content
script's module graph, and WXT builds content scripts as a **single IIFE**, which forces Rollup
to inline dynamic imports. A Svelte component referenced from a feature module would land in
`content.js` whether the reference were eager *or* lazy — pulling popup UI onto every forum
page.

## Decision

We will split the settings surface in two:

- **The popup becomes an accordion.** Each feature is a row; a feature that has settings gets a
  native `<details>` disclosure whose panel shows *at-a-glance state only* — for BBCode presets,
  how many presets and folders exist, plus a button into the editor. Features without settings
  keep today's plain toggle row.
- **An options page (`options_ui`) holds the real editing**, opened from the popup with
  `browser.runtime.openOptionsPage()` — available on MV2 and MV3 in both browsers, needing no
  new permission and **no background worker** (a property [[0011-presend-server-reachability-check]]
  established and this preserves).

Panels are wired in **`src/entrypoints/popup/panels.ts`**, a `Partial<Record<string, Component>>`
lookup — *not* a field on `Feature`, for the bundle reason above. The component still
co-locates with its feature (`src/features/bbcode-presets/PopupPanel.svelte`); only the wiring
is popup-side. `ALL_FEATURES` remains the one enumeration; this is a lookup, and a missing entry
degrades to "no panel", never to "feature missing".

Three smaller choices, each deliberate:

- The **checkbox sits outside the `<details>`**, not inside `<summary>`. A checkbox within a
  summary toggles the disclosure when clicked; separating the hit-areas physically is more
  honest than papering over it with `stopPropagation`. The checkbox is associated with the
  feature name via `aria-labelledby` rather than a `<label for>`, which would reintroduce the
  same double-action.
- `<details>` is used **natively** — no JS, and keyboard support comes for free.
- The options page sets **`open_in_tab: true`**, via a `<meta name="manifest.open_in_tab">` tag
  that WXT lifts into the manifest (so no `wxt.config.ts` change). The default `false` gives a
  cramped inline dialog on Chrome and nests the two-pane editor inside `about:addons` on Firefox.

The options page autosaves on a ~300 ms debounce with a quiet "Enregistré" confirmation. There
is no Save button: this is a local editor with no server round-trip, so one would be friction.

## Consequences

- One extra file names a feature id by hand. Accepted: it is a lookup rather than an
  enumeration, and its failure mode is invisible-panel rather than invisible-feature. Nothing
  type-enforces that a key matches a real id, because `Feature.id` is a `string`.
- Verified at build time that the boundary holds: adding the popup panel left
  `content.js` byte-identical in size and free of any `openOptionsPage` reference. Anyone
  tempted to move panels onto `Feature` should re-run that check first.
- The popup can now show live data, so it reads the preset store directly and watches it. Two
  contexts now read that store; only the options page writes it, which keeps last-write-wins
  moot for the moment ([[0012-feature-owned-data-stores]]).
- Toggling a feature still needs a forum-page reload, because `bootFeatures` reads settings once
  at boot. Invisible until now; with an in-page panel that outlives the switch it would be
  confusing, so the popup says so outright. Making toggles live would mean watching settings in
  `registry.ts` — deferred, not forgotten.
- A third UI surface exists to keep consistent (popup, options page, in-page). They share the
  recursive folder-tree component and the same colour palette, which is what stops that becoming
  three divergent designs.

Related: [[0003-svelte-5-popup-ui]], [[0004-feature-registry]], [[0012-feature-owned-data-stores]], [[0016-svelte-in-content-script]]
