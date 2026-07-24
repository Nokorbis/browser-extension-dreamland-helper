# Publishing & releasing Dreamland Reborn QoL

How to get the extension into forum members' browsers and keep it updated.

## Distribution model

**Firefox → listed on AMO.** Mozilla hosts the add-on on addons.mozilla.org, so members
install it with one click ("Add to Firefox") from its listing page, and **Mozilla handles
auto-updates** — there's no update manifest for us to maintain. The only trade-off versus a
private link is that the add-on is technically searchable on AMO, which is negligible for a
single forum's tool.

> **Terminology, because Mozilla's is confusing:** AMO's *"unlisted" / "On your own"* means
> **self-distribution** — Mozilla signs the file but does **not** host it; you'd host the
> `.xpi` and run your own auto-update feed. We are **not** doing that. We use *"listed" /
> "On this site"*, where Mozilla hosts and updates it. There is no "Mozilla-hosted but hidden
> from search" mode — [ADR 0010](./adr/0010-distribution-and-release-automation.md) records why
> we chose listed.

**Chrome / Brave → Chrome Web Store, unlisted.** One listing covers every Chromium member
(Brave installs from the same store). Unlisted means installable by link but not searchable.
The first upload is manual; after that CI submits each version like it does for AMO. See
[below](#chrome--brave) and [ADR 0018](./adr/0018-chrome-web-store-distribution.md).

## TL;DR — cutting a release

After the one-time [setup](#one-time-setup), each release is a single command:

```bash
pnpm release patch      # 0.1.0 → 0.1.1   (or: minor, major, or an explicit v0.5.0)
```

`scripts/release.sh` checks you're on a clean `main` (and not behind origin), bumps
`package.json` (WXT reads the version from it), commits `Release <version>`, tags
`v<version>`, and — after a confirmation prompt — pushes both. Add `--yes` to skip the
prompt (`pnpm release minor --yes`). The push is what triggers the workflow.

The workflow (`.github/workflows/release.yml`) then, **only for a `v*` tag whose commit is on
`main`**: type-checks, builds and zips both targets, **submits the new Firefox version and its
sources zip to AMO** via `wxt submit`, **submits the Chrome version to the Chrome Web Store**
(skipped until that listing exists — see [below](#chrome--brave)), and publishes a GitHub
Release with the zips attached. Each store reviews the submission and, once approved, publishes
it and pushes the update to installed copies automatically.

The tag **must** match `package.json`'s version, or the workflow fails on purpose — and AMO
won't accept an already-used version number, so every release must bump.

## What's automated vs. manual

| Step | Who |
|------|-----|
| Build, zip, upload new version **+ sources** to AMO, submit for review | **CI** (`wxt submit`) |
| Upload new version to the Chrome Web Store, submit for review | **CI**, once the listing exists (skips until then) |
| GitHub Release with archived zips | **CI** |
| One-time public listing setup (French summary/description, category, screenshots, **license**) | You, once, in the AMO Developer Hub |
| One-time Chrome listing setup (account, trader status, listing, privacy answers, **first upload**) | You, once, in the CWS dashboard |
| Review & final publish | **Mozilla** / **Google** (out of our hands; approval is automatic-to-live) |

So no — you do **not** manually upload the zip or the sources each release. CI does both,
including the source code AMO requires because we build with a bundler (WXT/Vite generates the
sources zip). The only recurring manual actions are each store's review, which you can't
automate, and keeping `store/listing-fr.md` true when features change — CI submits packages,
never listing copy.

## One-time setup

**1. Make sure the add-on has a listed listing *with a license set*.** In the AMO Developer
Hub, the add-on (`qol@dreamland-reborn.net`) needs a **listed** version with its
public page filled in — summary/description (French), category, icon, **a license**, and at
least the required fields. If your first manual upload went to the *unlisted* channel, add a
listed version and complete the listing once; after that, CI drives every subsequent version.

> **The license is not optional and CI cannot supply it.** AMO's version-create API *requires*
> a `license` for every listed submission, but `wxt submit` / `publish-browser-extension`
> (checked through 5.1.0) sends no license field — there is no flag for it. So AMO can only get
> the license by **inheriting it from the add-on**, which means it must be set once, by hand,
> here. Do the **first listed upload manually** (build locally: `pnpm zip:firefox` →
> `.output/dreamland-reborn-qol-<version>-firefox.zip` + the sources zip), pick the license during
> that upload, and complete the listing. We license under **MIT** (AMO license slug: `MIT`;
> see the repo `LICENSE`). Every later version submitted by CI reuses that license
> automatically. Symptom if this step is skipped: the release job fails with
> `"license": ["This field, or custom_license, is required for listed versions."]`.

**2. Add the AMO API credentials as GitHub secrets** (this is what lets CI submit):

1. addons.mozilla.org → **Developer Hub → Manage API Keys**
   (`https://addons.mozilla.org/developers/addon/api/key/`). Generate a credential — you get a
   **JWT issuer** (`user:12345:67`) and a **JWT secret** (shown once — copy it now).
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `FIREFOX_JWT_ISSUER` = the issuer
   - `FIREFOX_JWT_SECRET` = the secret

Verify the credentials without shipping anything:

```bash
pnpm exec wxt submit --dry-run \
  --firefox-extension-id qol@dreamland-reborn.net \
  --firefox-zip .output/dreamland-reborn-qol-0.1.0-firefox.zip \
  --firefox-sources-zip .output/dreamland-reborn-qol-0.1.0-sources.zip
# export FIREFOX_JWT_ISSUER=... FIREFOX_JWT_SECRET=... first, or pass --firefox-jwt-*
```

`--dry-run` checks authentication but uploads nothing.

## Installing (what members do)

Send members the AMO listing URL (`https://addons.mozilla.org/firefox/addon/<slug>/`). They
click **Add to Firefox**, confirm the permission prompt once, and they're done — no
`about:addons`, no files. Updates arrive automatically from AMO.

## Chrome / Brave

Brave uses the Chrome Web Store, so one listing covers all Chromium members. The **first**
upload is manual — the store's API can only *update* an item that already exists, so there is
nothing for CI to talk to until you have created one. After that, CI submits every version.

Everything you paste into the dashboard already exists in the repo: **[`store/listing-fr.md`](../store/listing-fr.md)**
holds every field (description, single purpose, permission justifications, data-usage answers)
and the images are in `store/`. Work through it top to bottom and the submission is mechanical.

### 1. Account (once)

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) —
   one-time **$5** registration. Use a Google account you intend to keep: the publisher
   identity is tied to it. Enable 2-Step Verification on it first.
2. **Declare Trader / Non-Trader** in the account settings — we are **Non-Trader** (no
   monetisation of any kind). This is not optional paperwork: an account that hasn't declared
   has its items **blocked in the EU**, which is this extension's whole audience.
3. Verify the account's contact email (it is shown publicly on the listing).

### 2. Assets

| Field | File | Notes |
|---|---|---|
| Store icon 128×128 | `store/icon-128-cws.png` | 96×96 artwork + 16 px transparent padding, per Google's spec — **not** `store/icon-128.png`, which is full-bleed for AMO |
| Small promo tile 440×280 | `store/promo-440x280.png` | in practice mandatory: items without one are ranked last |
| Screenshots 1280×800 | `store/screenshots/*.png` | 3–5, full bleed. **You have to shoot these** — see [`store/screenshots/README.md`](../store/screenshots/README.md) |

The two rendered images regenerate from their committed SVG sources:

```bash
rsvg-convert -w 440 -h 280 store/promo-tile.svg -o store/promo-440x280.png
rsvg-convert -w 96 -h 96 icon-store.svg | magick png:- -background none -gravity center -extent 128x128 store/icon-128-cws.png
```

### 3. First upload

```bash
pnpm zip     # → .output/dreamland-reborn-qol-<version>-chrome.zip
```

(or take the zip attached to the matching GitHub Release — same artifact). Create the item,
upload the zip, then fill the three tabs from `store/listing-fr.md`: **Store listing**,
**Privacy practices** (single purpose, permission justifications, data usage — the tab that
gets extensions rejected), **Distribution** → visibility **Unlisted**. Submit for review.

Expect a slower first review than later ones; new accounts are looked at harder.

### 4. Hand the rest to CI (once the item exists)

The release workflow already has the step; it skips while unconfigured. To switch it on:

1. Copy the **extension id** from the dashboard (the 32-letter string in the item's URL) into
   a repo **variable** — Settings → Secrets and variables → Actions → *Variables* →
   `CHROME_EXTENSION_ID`. It's public information, so it is not a secret, and the step keys off
   it: unset means skip.
2. Create OAuth credentials for the Chrome Web Store API and add them as repo **secrets**:
   `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.
   [Google's guide](https://developer.chrome.com/docs/webstore/using-api) is the reference —
   in short: a Google Cloud project → enable the *Chrome Web Store API* → OAuth consent screen
   (External, add yourself as a test user) → OAuth client of type **Desktop app** → exchange
   the resulting code for a refresh token. `pnpm exec wxt submit init` walks the same ground
   interactively and prints the values.

Verify without shipping anything:

```bash
pnpm exec wxt submit --dry-run \
  --chrome-extension-id <id> \
  --chrome-zip .output/dreamland-reborn-qol-<version>-chrome.zip
# export CHROME_CLIENT_ID / CHROME_CLIENT_SECRET / CHROME_REFRESH_TOKEN first,
# or pass --chrome-client-id / --chrome-client-secret / --chrome-refresh-token
```

If `CHROME_EXTENSION_ID` is set but a secret is missing, the release job fails loudly rather
than silently skipping — that asymmetry is deliberate.

### Installing (what Chromium members do)

Send them the listing URL (`https://chromewebstore.google.com/detail/<slug>/<id>`). Unlisted
items install in one click for anyone with the link, and the store auto-updates them; they just
won't turn up in store search.

## Files involved

| Path | Role |
|------|------|
| `scripts/release.sh` | One-command release: bump → commit → tag → push (run via `pnpm release`). |
| `.github/workflows/release.yml` | Tag-on-main triggered: build → `wxt submit` to AMO listed + Chrome Web Store → GitHub Release. |
| `.github/workflows/ci.yml` | Ordinary push/PR validation (type-check + build); ships nothing. |
| `wxt.config.ts` | `gecko.id` + data-collection; deliberately **no** `update_url` (AMO auto-updates listed add-ons). |
| `store/listing-fr.md` | Every Chrome Web Store field, ready to paste. Keep true when features change. |
| `store/screenshots/README.md` | Shot list + the exact commands to normalise captures to 1280×800. |
| `store/*.png`, `store/promo-tile.svg`, `icon-store.svg` | Listing images and their sources. |
| `docs/PRIVACY.md` | The privacy policy both stores link to. Its URL on `main` must stay stable. |
| `docs/adr/0010-distribution-and-release-automation.md` | The *why* behind this setup. |
| `docs/adr/0018-chrome-web-store-distribution.md` | The *why* behind the Chrome half. |
