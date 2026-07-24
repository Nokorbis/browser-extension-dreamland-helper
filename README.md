# Dreamland Reborn QoL

A browser extension of writing aids for the [dreamland-reborn.net](https://dreamland-reborn.net)
PHPBB 3.20 roleplay forum. Works on Brave/Chromium and Firefox from a single codebase, built
with [WXT](https://wxt.dev) + Svelte 5.

## Features

| # | Feature | Status | What it does |
|---|---------|--------|--------------|
| 1 | Message loss protection | ✅ Done | Keeps a written post from being lost — warns before you leave the editor with unsaved text, and checks the forum is reachable before sending. |
| 2 | Highlight GM text | 🚧 Planned | Keep passages of the GM's post highlighted so you can focus while replying. |
| 3 | BBCode presets | ✅ Done | Insert complex BBCode structures in one click, from reusable presets organised in folders. |
| 4 | Color grabber | 🚧 Planned | Grab another poster's color and reuse it. |

Each feature is independent and can be toggled on or off from the extension's toolbar popup.
Planned features appear there marked "soon" and stay off until they're implemented.

### 1. Message loss protection — ✅ done

Roleplay posts are long, and there are two easy ways to lose one: navigating away before
you've submitted, or hitting "send" at the moment the forum is unreachable. This feature
guards against both.

**Leaving with unsaved text.** While the editor holds text you've changed but not submitted,
it arms the browser's native **"Leave site?"** confirmation, so navigating away (back button,
closing the tab, following a link) asks you to confirm first. It only triggers when the editor
is actually dirty — an empty or untouched editor never nags. The prompt's wording is the
browser's own and can't be customized; the extension only decides *whether* to raise it.

**Sending to a server that's down.** Submitting a post to an unreachable forum can swallow it
whole — the page navigates away, the request fails, and your text is gone. So before a post is
actually sent, the extension checks that the forum is responding. If it isn't, the submit is
held back and you get a dialog explaining your message wasn't sent and your text is still
there, with the choice to keep waiting or send anyway. Only real submissions are guarded —
preview and save-draft go through untouched.

### 2. Highlight GM text — 🚧 planned

When you're replying to the GM, it helps to keep the passages you still need to respond to
visibly marked. This feature will let you highlight parts of another post and have the
highlight **persist** while you write, instead of copying the text into your reply as a
scratch note. Design is still to be settled (where highlights are stored, how they're keyed
to a post, how they survive reloads).

### 3. BBCode presets — ✅ done

Elaborate formatting on the forum means typing the same nested BBCode by hand over and over —
a character's "yell" style, a whisper, a thought. This feature lets you save those as
**presets** and insert them in one click.

**Organising them.** Presets live in **folders that nest as deep as you like** — one folder
per character, subdivided however suits you. You create and edit them in the extension's
options page (toolbar popup → *Préréglages BBCode* → *Gérer les préréglages…*), which has the
folder tree on the left and a name, BBCode body and live preview on the right. Changes save
themselves.

**Using them.** Two ways, both inserting at your cursor in the composer:

- a **button in phpBB's BBCode toolbar**, next to B / i / u, opening a menu that mirrors your
  folders; and
- a **panel beside the editor**, collapsed to a slim handle until you open it — it remembers
  which way you left it.

**Placeholders.** A preset body is ordinary BBCode plus two optional markers:

| Marker | Meaning |
|---|---|
| `{SELECTION}` | replaced by whatever text you had selected (empty if none) |
| `{CURSOR}` | where the cursor lands after inserting |

`{SELECTION}` accepts transformations, chained with `\|`: `upper`, `lower`, `title`, `trim`.
So a yell preset might read:

```
[b][color=#123456]{SELECTION|upper}[/color][/b]{CURSOR}
```

Select a phrase, click the preset, and it comes back bold, coloured and shouted. A preset that
doesn't mention `{SELECTION}` simply replaces the selection instead — and either way a single
**Ctrl+Z** undoes the whole insertion, because inserting goes through the browser's native
edit history rather than around it.

### 4. Color grabber — 🚧 planned

Posters often give a character a signature speech color. This feature will let you **grab
that color and reuse it** without digging through someone's BBCode by hand. Design is still
to be settled (which DOM sources to read — coloured usernames vs. inline `[color]` spans —
and how the grabbed color is presented and applied).

## Architecture & decisions

The codebase is one thin content script that boots a registry of self-contained features;
see [CLAUDE.md](./CLAUDE.md) for the architecture and how to add a feature. The *why* behind
the significant technical choices (framework, browser targets, UI, patterns) is recorded as
Architecture Decision Records in [`docs/adr/`](./docs/adr/).

## Continuous integration

CI runs on [GitHub Actions](https://docs.github.com/actions) ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)):
every push and pull request is type-checked, unit-tested and built for both browser targets,
and pushes to `main` additionally package the store-ready zips as downloadable artifacts.

## Releasing

Pushing a version tag (`v*`) whose commit is on `main` triggers
[`.github/workflows/release.yml`](./.github/workflows/release.yml), which builds both targets
and submits the new Firefox version (plus its sources) to AMO's listed channel, where Mozilla
hosts and auto-updates it; it also publishes a GitHub Release with the zips attached. See
[`docs/PUBLISHING.md`](./docs/PUBLISHING.md) for the full flow (one-time AMO setup, how members
install) and [ADR 0010](./docs/adr/0010-distribution-and-release-automation.md) for the rationale.

## Development

Requires Node + pnpm.

```bash
pnpm install
pnpm dev            # Brave/Chromium with live reload
pnpm dev:firefox    # Firefox with live reload
pnpm check          # type check
pnpm test           # unit tests
```

**First-time browser setup:** `pnpm dev` auto-detects a standard Chrome/Chromium
install. If it errors with `The CHROME_PATH environment variable must be set` (e.g.
you use Brave, Vivaldi, or a non-standard path), copy the template and set your
browser once — it's gitignored, so your path stays local:

```bash
cp web-ext.config.example.ts web-ext.config.ts   # then edit the path inside
```

Or just export `CHROME_PATH` for a one-off: `CHROME_PATH=/usr/bin/brave pnpm dev`.

The template also keeps a **persistent, isolated dev profile** under `.wxt/`
(gitignored) so the dev browser remembers your forum login and history between
runs, separate from your real browser. Drop the `keepProfileChanges`/`*Profile`
lines if you'd rather start fresh each time.

### Building

```bash
pnpm build          # → .output/chrome-mv3/
pnpm build:firefox  # → .output/firefox-mv2/
pnpm check          # type check
```

**Load unpacked:** after building, load the matching `.output/<target>/` folder — Brave via
`brave://extensions` (Developer mode → Load unpacked); Firefox via `about:debugging`
(Load Temporary Add-on → pick `manifest.json`).

See [CLAUDE.md](./CLAUDE.md) for architecture and how to add a feature.
