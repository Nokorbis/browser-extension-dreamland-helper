# 0022. Ship bulk feature data as a lazily fetched extension asset

Status: Accepted

Date: 2026-08-12

## Context

The emoji picker needs a table of ~1900 Unicode emoji with, for each one, a French label, an
English label and a bag of search keywords in both languages. Generated from CLDR
(`emojibase-data`), that table is **~256 kB of JSON** — nearly three times the size of the
entire content script, which was 90 kB raw / 32 kB gzipped before this feature.

Content scripts here build as a single IIFE, so anything reachable from `src/features/*`
lands in `content.js` whether or not it is used. A bundled dataset would therefore be parsed
on **every page of the forum**, for every reader, including the overwhelming majority who
never open the picker. [[0016-svelte-in-content-script]] already recorded the jump from 9.1 kB
to 58.5 kB when Svelte arrived, with an explicit warning not to grow the content script
further; tripling it for a table most page loads never touch is exactly what that warning
was about.

Three options were on the table:

1. **Bundle it.** Simplest build, no manifest surface, instantly available — and pays the
   full cost on every page load regardless of use.
2. **Ship a curated subset.** Small enough to bundle (~500 emoji), but it discards the long
   tail and, worse, guts search: the keywords are most of the payload and most of the value.
3. **Ship it as an asset and fetch it on demand.** The content script stays small; the cost
   moves to the first panel open, where the user has asked for it.

Fetching an extension's own file from a content script is not free of consequences: the URL
is `chrome-extension://…` / `moz-extension://…`, and reading it is gated on
`web_accessible_resources`, which is a store-review-visible surface.

## Decision

We will ship bulk feature data as a file under `public/` and fetch it lazily at the moment
the feature first needs it, rather than importing it into the content-script bundle.

Concretely, for the emoji picker:

- `scripts/gen-emoji.mjs` generates `public/emoji/emoji.json` from `emojibase-data`.
  `emojibase-data` is a **devDependency**, the script is **never run by `wxt build`**, and
  **the output is committed** — so a build, a CI run and a fresh clone are deterministic and
  need no network. Regenerating is `pnpm gen:emoji`, and the diff is reviewable because the
  generator writes one record per line.
- The asset is declared in `wxt.config.ts` under `web_accessible_resources`, **scoped to the
  forum origin** (`*://*.dreamland-reborn.net/*`) rather than `<all_urls>`, so no other site
  can read it.
- `src/features/emoji-picker/data.ts` owns the fetch: one module-scoped promise shared by
  every surface on the page, resolved through the same kind of `normalize` repair pass a
  `storage.local` payload gets ([[0012-feature-owned-data-stores]]), and **resolving to an
  empty dataset on any failure** rather than rejecting — the panel has exactly one useful
  response to an error, and that is to say so.
- The generator caps coverage at a `MAX_EMOJI_VERSION` constant (15.1 today). Emoji render in
  the user's own system font, so an emoji too new for their platform is a tofu box; offering
  one is worse than omitting it.

## Consequences

The content script stays proportionate: the picker cost **+13.9 kB raw / +4.2 kB gzipped**,
which is the UI, not the data. A forum page where nobody opens the picker downloads and
parses none of the 256 kB.

The manifest now has a `web_accessible_resources` entry, and it is worth knowing that WXT
rewrites the MV3 object form into MV2's bare array for the Firefox build — so the two emitted
manifests differ here and **both must be checked** after touching it. A missing entry is a
silent runtime failure rather than a build error, which is why `data.ts` names that
possibility in its warning.

The data is now a **build artefact under version control**, with the obligations that brings:
it can go stale against upstream CLDR, a regeneration must be committed like any other
change, and reviewing one means trusting the generator rather than reading 1900 lines. The
one-record-per-line format is the concession that keeps such a diff legible.

The first open of the picker is asynchronous, so the panel has a real loading state — a
complication a bundled table would not have had. It is paid once per page.

Any future feature with a comparable data table (a colour-name index, a BBCode reference)
should follow this shape rather than inventing a second one. A feature whose data is small
enough to bundle should still just bundle it: this pattern buys nothing below a few tens of
kilobytes and costs a manifest entry and an async path.

Related: [[0016-svelte-in-content-script]], [[0012-feature-owned-data-stores]],
[[0002-chrome-mv3-firefox-mv2]]
