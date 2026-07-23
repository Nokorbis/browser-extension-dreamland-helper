# Publishing & releasing Dreamland Helper

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

**Chrome / Brave → Chrome Web Store**, uploaded by hand for now (see [below](#chrome--brave)).

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
sources zip to AMO** via `wxt submit`, and publishes a GitHub Release with the zips attached.
Mozilla reviews the submission and, once approved, publishes it and pushes the update to
installed copies automatically.

The tag **must** match `package.json`'s version, or the workflow fails on purpose — and AMO
won't accept an already-used version number, so every release must bump.

## What's automated vs. manual

| Step | Who |
|------|-----|
| Build, zip, upload new version **+ sources** to AMO, submit for review | **CI** (`wxt submit`) |
| GitHub Release with archived zips | **CI** |
| One-time public listing setup (French summary/description, category, screenshots, **license**) | You, once, in the AMO Developer Hub |
| Review & final publish | **Mozilla** (out of our hands; approval is automatic-to-live) |
| Chrome Web Store upload | You, by hand (for now) |

So no — you do **not** manually upload the zip or the sources each release. CI does both,
including the source code AMO requires because we build with a bundler (WXT/Vite generates the
sources zip). The only recurring manual action is Mozilla's review, which you can't automate.

## One-time setup

**1. Make sure the add-on has a listed listing *with a license set*.** In the AMO Developer
Hub, the add-on (`dreamland-helper@dreamland-reborn.net`) needs a **listed** version with its
public page filled in — summary/description (French), category, icon, **a license**, and at
least the required fields. If your first manual upload went to the *unlisted* channel, add a
listed version and complete the listing once; after that, CI drives every subsequent version.

> **The license is not optional and CI cannot supply it.** AMO's version-create API *requires*
> a `license` for every listed submission, but `wxt submit` / `publish-browser-extension`
> (checked through 5.1.0) sends no license field — there is no flag for it. So AMO can only get
> the license by **inheriting it from the add-on**, which means it must be set once, by hand,
> here. Do the **first listed upload manually** (build locally: `pnpm zip:firefox` →
> `.output/dreamland-helper-<version>-firefox.zip` + the sources zip), pick the license during
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
  --firefox-extension-id dreamland-helper@dreamland-reborn.net \
  --firefox-zip .output/dreamland-helper-0.1.0-firefox.zip \
  --firefox-sources-zip .output/dreamland-helper-0.1.0-sources.zip
# export FIREFOX_JWT_ISSUER=... FIREFOX_JWT_SECRET=... first, or pass --firefox-jwt-*
```

`--dry-run` checks authentication but uploads nothing.

## Installing (what members do)

Send members the AMO listing URL (`https://addons.mozilla.org/firefox/addon/<slug>/`). They
click **Add to Firefox**, confirm the permission prompt once, and they're done — no
`about:addons`, no files. Updates arrive automatically from AMO.

## Chrome / Brave

Brave uses the Chrome Web Store, so one Chrome listing covers all Chromium members. Not
automated yet — the release workflow attaches `dreamland-helper-<version>-chrome.zip` to the
GitHub Release for you to upload:

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   (one-time $5 registration).
2. Upload the chrome zip, set visibility to **Unlisted** (link-only, not searchable), submit
   for review.
3. Share the listing link; the store handles install and auto-update.

When ready, `wxt submit` can push Chrome automatically too — it already supports
`--chrome-zip` and Chrome Web Store API credentials (client id / secret / refresh token as
their own secrets). Say the word and I'll wire it into the workflow.

## Files involved

| Path | Role |
|------|------|
| `scripts/release.sh` | One-command release: bump → commit → tag → push (run via `pnpm release`). |
| `.github/workflows/release.yml` | Tag-on-main triggered: build → `wxt submit` to AMO listed → GitHub Release. |
| `.github/workflows/ci.yml` | Ordinary push/PR validation (type-check + build); ships nothing. |
| `wxt.config.ts` | `gecko.id` + data-collection; deliberately **no** `update_url` (AMO auto-updates listed add-ons). |
| `docs/adr/0010-distribution-and-release-automation.md` | The *why* behind this setup. |
