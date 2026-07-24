# 0010. Distribution & release automation

Status: Accepted — Chrome distribution amended by [[0018-chrome-web-store-distribution]]

Date: 2026-07-23

## Context

The extension is a tool for the members of a single private forum. We need to get it into
their browsers and keep it updated across the two targets from [[0002-chrome-mv3-firefox-mv2]],
with the least friction for non-technical members and the least maintenance for us. The two
stores differ sharply:

- **Chrome/Brave** effectively force distribution through the Chrome Web Store; a self-hosted
  `.crx` won't install for ordinary users. The store handles auto-update.
- **Firefox / AMO** offers two channels: **listed** ("On this site" — Mozilla hosts a public
  page, one-click install, Mozilla auto-updates, human review) and **unlisted** ("On your
  own" — Mozilla only *signs*; you host the `.xpi` yourself and run your own `update_url` +
  `updates.json` auto-update feed). There is **no** "Mozilla-hosted but hidden from search"
  mode: the visibility toggle on a listed add-on only *unpublishes* it, it doesn't yield a
  quiet install link.

We first considered unlisted self-distribution for privacy, but the member-facing install UX
(hand out a link that installs in one click, no `about:addons` file dance) and zero
update-infrastructure both point to listed. The only thing listed gives up is that the add-on
is technically searchable on AMO — negligible for a niche, named tool. A separate question was
the release *trigger*: every push to `main` (a release per commit) vs. an explicit version tag.

## Decision

We will **distribute the Firefox build listed on AMO** — Mozilla hosts the public listing and
handles auto-updates, so the manifest carries **no** `update_url` and we maintain no update
feed. Members install from the AMO listing page.

Releases are driven by **pushing a `v*` version tag whose commit is on `main`**, handled by a
dedicated `release.yml` workflow (ordinary CI in `ci.yml` stays build/type-check only). The
workflow verifies the tag is on `main` and matches `package.json`, builds and zips both
targets, and **submits the new version and the source zip to AMO's listed channel** with
`wxt submit` (`publish-extension`), using `FIREFOX_JWT_ISSUER` / `FIREFOX_JWT_SECRET` repo
secrets. It also publishes a GitHub Release archiving the zips (via `gh`, no third-party
action). **Chrome/Brave stays a manual Chrome Web Store upload** for now: the workflow attaches
the Chrome zip to the Release for a human to upload to an unlisted store listing.

## Consequences

- Members get one-click install and hands-off auto-update, both handled by Mozilla; we host
  and maintain no update infrastructure.
- The add-on is publicly searchable on AMO (accepted) and every version passes Mozilla review,
  which we cannot automate — submission is automated, approval is not.
- AMO requires a source upload because we build with a bundler; CI submits WXT's generated
  sources zip automatically, so it is not a manual step.
- Cutting a release is `bump package.json → tag on main → push`. The tag/version check and the
  on-main check make an accidental or off-branch release impossible; AMO also rejects a reused
  version, reinforcing the bump-every-release discipline.
- Signing/`updates.json`/`update_url` are deliberately absent — they belong to the unlisted
  route we did **not** take. The first public listing's metadata (French description, category,
  screenshots) is a one-time manual setup in the AMO Developer Hub before automated version
  submissions can be reviewed.
- The signing/publish step needs AMO API credentials in CI; without the secrets the release job
  fails loudly by design.
- Chrome releases remain manual until we add Chrome Web Store API credentials to `wxt submit`
  (it already supports `--chrome-zip`).
- Choosing listed over unlisted is reversible via a future ADR, at the cost of reintroducing
  self-hosting and an `updates.json` feed.

Related: [[0002-chrome-mv3-firefox-mv2]]
