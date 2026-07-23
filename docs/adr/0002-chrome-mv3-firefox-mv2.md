# 0002. Ship Chrome MV3 + Firefox MV2 from one source

Status: Accepted

Date: 2026-07-23

## Context

The extension targets both Brave/Chromium and Firefox. Chromium has fully moved to
Manifest V3. Firefox supports MV3 but MV2 remains fully supported there and sidesteps the
background/service-worker friction MV3 introduces (event-page lifecycle, differing APIs).
We need a target matrix that works on both stores without maintaining two codebases.

## Decision

We will emit **Chrome MV3** and **Firefox MV2** from the same source, using WXT's default
per-browser target selection (`wxt build` → `.output/chrome-mv3/`, `wxt build -b firefox` →
`.output/firefox-mv2/`). Firefox-only manifest config lives under
`browser_specific_settings.gecko` (extension id + `data_collection_permissions`), which
Chrome ignores harmlessly.

## Consequences

- Firefox avoids MV3 service-worker friction while Chrome gets the MV3 it now requires.
- Feature code must stay on the cross-browser `browser.*` API and avoid manifest-version-
  specific assumptions; anything version-specific is confined to config.
- Two build/zip commands per release instead of one, and two store review processes.
- The narrow `host_permissions` origin is store-review-visible and is kept minimal.

Related: [[0001-build-on-wxt]]
