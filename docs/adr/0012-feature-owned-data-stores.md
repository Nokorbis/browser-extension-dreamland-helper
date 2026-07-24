# 0012. Feature-owned data stores beyond the settings map

Status: Accepted

Date: 2026-07-24

## Context

Until now the only thing the extension persisted was *whether a feature is on*: a
`Record<featureId, boolean>` under a single `settings` key ([[0006-typed-settings-storage]]).
The BBCode presets feature breaks that assumption — it owns a whole library of user-authored
records (nested folders, presets with BBCode bodies), and it will not be the last: the
highlight feature (#2) will need per-post highlight ranges.

So we had to decide where a feature's *data* lives. Overloading `Settings.features` was never
viable — its value type is `boolean`. The real choices were to widen `Settings` with a
per-feature `data` sub-object under the same key, or to give each store its own key. And
since preset data is the first thing a user could actually *lose*, we also had to settle
versioning, how the shape survives a bad write, and whether the store should follow the user
between machines.

WXT ships `storage.defineItem(key, { version, migrations })`, which was the obvious candidate
and does not require a background script — migrations run when the module is first imported.

## Decision

We will give each feature that owns data **its own `browser.storage.local` key**, read and
written through **one typed module per store**. `src/lib/storage.ts` stays exactly what it is:
the feature on/off registry. The first such store is `src/lib/presets.ts` under the key
`bbcodePresets`.

Four properties are load-bearing:

- **The version lives inside the payload** (`PresetStore.version`), not beside it. This is why
  we hand-rolled the module rather than using `storage.defineItem`, which keeps the version in
  a sibling meta key (`bbcodePresets$`). A self-describing payload means a copy of the object —
  pasted into a file, mailed to a friend — is enough to interpret it, which turns Export/Import
  JSON from a feature into roughly twenty lines. It also keeps one persistence idiom in the
  codebase instead of two.
- **The shape is flat, not nested**: id-keyed `Record`s linked by `parentId` / `folderId` plus
  an explicit `order`. Moving a folder is one field write rather than a splice-and-reinsert
  across two subtrees, any node is addressable by id without a path, and the render tree is
  derived on demand by `buildPresetTree`.
- **Every read is repaired, not trusted.** `normalizePresetStore` runs on every load *and*
  every change notification, not only on a version bump: unresolvable links are reparented to
  the root, parent cycles are broken at the point of revisit, missing fields are filled, and
  sibling `order` is renumbered dense. Nothing is ever deleted to fix a structural problem — a
  writer would much rather find a preset in the wrong folder than not find it at all.
- **Mutations are pure**: `store → store`, with callers minting ids via `newId()` and passing
  them in. That keeps them deterministic, lets the options page hold a store in `$state` and
  apply changes optimistically, and makes the tree invariants unit-testable without a browser
  ([[0015-preset-placeholder-syntax]] covers why this repo now has tests).

Cross-context sync uses the top-level `browser.storage.onChanged` filtered on
`areaName === 'local'` — deliberately not `browser.storage.local.onChanged`, whose support is
patchy on Firefox MV2. `watchPresetStore` returns an unsubscriber that features wire into
their cleanup.

We will use `storage.local`, **not** `storage.sync`. `sync` caps at **8 KB per item** (and
102 KB total), and the store is a single item — roughly a dozen realistic presets before
writes start failing. Sharding one item per preset would buy the quota back at the cost of
atomicity. We will also **not** request `unlimitedStorage`: it is a store-review-visible
permission and the project deliberately ships only `storage` ([[0002-chrome-mv3-firefox-mv2]]).

## Consequences

- Presets do **not** follow the user between machines. That is a real loss, accepted because
  `sync`'s failure mode is worse: silent, quota-shaped, and impossible to explain to a writer.
  The mitigation is an explicit Export/Import JSON button, which the self-describing `version`
  makes cheap — and which is honest about when it runs.
- Adding a feature that owns data now has a known shape to copy: new key, new module, version
  inside the payload, normalize-on-read, pure mutations. The highlight feature should follow it
  rather than inventing a second idiom.
- Two keys mean two writers. Today only the options page writes preset data, so last-write-wins
  is moot — but if the popup panel ever gains edit affordances, that changes, and read-modify-
  write discipline becomes a real obligation.
- `normalizePresetStore` is now the single choke point where a corrupt store becomes a usable
  one. It must stay total (never throw) and cheap: it runs on every change notification in every
  context, including on every forum page with the content script loaded.
- Ephemeral UI state deliberately does *not* live here. The floating panel's collapsed state
  gets its own key so that the presets payload stays clean for export/import.
- `storage.defineItem` remains available and is the better tool if migrations ever get
  complicated; choosing against it now is a preference for one idiom, not a rejection.

Related: [[0006-typed-settings-storage]], [[0002-chrome-mv3-firefox-mv2]], [[0015-preset-placeholder-syntax]]
