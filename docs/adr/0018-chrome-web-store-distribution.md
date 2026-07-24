# 0018. Chrome Web Store distribution

Status: Accepted

Date: 2026-07-24

## Context

[[0010-distribution-and-release-automation]] settled Firefox (listed on AMO, submitted by CI)
and deliberately left Chrome as "a manual Chrome Web Store upload for now": the release
workflow only attached the Chrome zip to the GitHub Release for a human to upload. That was
acceptable while AMO was the primary channel. It stopped being acceptable when Mozilla's review
queue turned out to be slow enough that members had no working install path at all, making
Chrome/Brave — which most of them use anyway — the channel that actually has to ship.

Publishing to the Chrome Web Store costs more than uploading a zip. The store requires a
registered developer account ($5, one-time), a **Trader/Non-Trader declaration** — an EU
requirement, and an undeclared account has its items blocked in the EU, which is this
extension's entire audience — a listing (French copy, 128×128 icon, 440×280 promo tile, 1280×800
screenshots), and a set of disclosures: a **single purpose** statement, a justification per
permission, a data-usage declaration, and a privacy policy URL. The
[August 2026 policy update](https://developer.chrome.com/blog/cws-policy-updates-2026) tightens
the last two: collected data must be strictly necessary to the declared single purpose, and
data practices must be disclosed prominently. The single-purpose rule is the sharp edge for us,
because the extension ships several features under one umbrella.

Automating the upload is also not symmetric with AMO. The CWS API can only *update* an item
that already exists, so the first submission is manual whatever we do, and API access needs a
Google Cloud OAuth client plus a refresh token that can only be minted once there is an item to
authorise against.

## Decision

We will **distribute the Chrome build on the Chrome Web Store as an *unlisted* item** —
installable by link, not searchable — mirroring the reasoning of [[0010-distribution-and-release-automation]]
for a single forum's tool. The publisher account is declared **Non-Trader**, and the listing
declares **no data collection**, consistent with the `data_collection_permissions` already sent
to AMO.

The listing content is **kept in the repository, not only in the dashboard**: `store/listing-fr.md`
holds every field (French description, single purpose, permission justifications, data-usage
answers), and `docs/PRIVACY.md` is the privacy policy, served from the public repo as the URL
the dashboard points at. Store images live in `store/` and are regenerated from committed SVG
sources.

`release.yml` gains a Chrome submission step using the same `wxt submit`. Unlike the AMO step,
which fails loudly when its secrets are missing, the Chrome step **skips** while the
`CHROME_EXTENSION_ID` repo variable is unset, and only fails if that variable is set without the
`CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN` secrets.

## Consequences

- Members on Chrome/Brave get a one-click install and store-managed auto-updates without
  waiting on Mozilla; the two channels ship from the same tag and the same zips.
- Releases keep working before the store account exists: the Chrome step no-ops, prints a
  notice, and the zip stays attached to the GitHub Release for a manual upload. The extension
  id is public information, so it is a repo *variable* — only the OAuth triple is secret.
- The first upload is manual by construction, and so is every later change to the listing
  *copy* (CI submits packages, never metadata). `store/listing-fr.md` is therefore a document
  that has to be kept true by hand: when a feature ships or is removed, the description and the
  single-purpose answer must be updated with it, or the listing becomes inaccurate — itself a
  policy violation.
- The privacy policy is now a **published artifact with a stable URL**
  (`docs/PRIVACY.md` on `main`). Renaming or un-publishing the repository breaks the URL the
  store requires, which is grounds for removal — this constrains what we may do to the repo.
- Two stubbed features (highlight, colour grabber) must stay out of the store description until
  they ship, even though the README lists them as planned, because the listing describes what
  the user gets today.
- Adding a store means a second review authority with its own policy drift. Each policy update
  (like August 2026's) has to be re-read against `store/listing-fr.md` rather than against
  memory of what was submitted.

Related: [[0010-distribution-and-release-automation]], [[0011-presend-server-reachability-check]]
