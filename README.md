# Dreamland Reborn QoL

A browser extension of writing aids for the [dreamland-reborn.net](https://dreamland-reborn.net)
PHPBB 3.20 roleplay forum. Works on Brave/Chromium and Firefox from a single codebase, built
with [WXT](https://wxt.dev) + Svelte 5.

## Features

| # | Feature | Status | What it does |
|---|---------|--------|--------------|
| 1 | Message loss protection | ✅ Done | Keeps a written post from being lost — warns before you leave the editor with unsaved text, and checks the forum is reachable before sending. |
| 2 | Text highlights | ✅ Done | Highlight any passage in a post and keep it marked in a chosen colour — persists across reloads and between the thread and the reply composer's topic review. |
| 3 | BBCode presets | ✅ Done | Insert complex BBCode structures in one click, from reusable presets organised in folders. |
| 4 | Color grabber | ✅ Done | Reuse a colour already in the thread — a checkbox in the forum's colour palette filters it to the colours used in the topic review. |
| 5 | Keyboard shortcuts | ✅ Done | Ctrl+B / Ctrl+I / Alt+Q… over the forum's own BBCode toolbar, in the composer and the chatbox, identical on Chrome and Firefox. |
| 6 | Emoji picker | ✅ Done | A searchable Unicode emoji panel in the composer and the chatbox, opened from a toolbar button or Alt+I. |

Each feature is independent and can be toggled on or off from the extension's toolbar popup;
a change takes effect on the forum page's next load.

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
there, with the choice to keep waiting or send anyway. **Posting, previewing and saving a
draft are all guarded** — all three navigate away, so all three lose the text the same way
when the forum is down.

### 2. Text highlights — ✅ done

Replying to a long post, it helps to keep the passages you still need to respond to visibly
marked. Select any passage in a post's message body, pick a colour, and the highlight
**persists** while you write — across reloads, and on the same post whether you're reading the
thread or seeing it in the reply composer's topic review (it's keyed to phpBB's numeric post
id). Painting uses the CSS Custom Highlight API, so nothing in the forum's posts is mutated;
highlights clear per-thread or all at once. See
[ADR 0020](./docs/adr/0020-persistent-text-highlights.md).

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

`{SELECTION}` accepts transformations, chained with `|`: `upper`, `lower`, `title`, `trim`.
So a yell preset might read:

```
[b][color=#123456]{SELECTION|upper}[/color][/b]{CURSOR}
```

Select a phrase, click the preset, and it comes back bold, coloured and shouted. A preset that
doesn't mention `{SELECTION}` simply replaces the selection instead — and either way a single
**Ctrl+Z** undoes the whole insertion, because inserting goes through the browser's native
edit history rather than around it.

### 4. Color grabber — ✅ done

Roleplayers give each character a signature speech colour, and reusing one means digging the
exact hex out of someone's BBCode. This feature turns phpBB's **own font-colour palette** into a
grabber: a **"Sur la page"** checkbox — below the palette's colour label — filters the grid down
to the colours actually used in the **topic review** beneath the editor, blanking the rest so
only the ones in play remain.

Colours the review uses that the fixed grid doesn't have are **appended at the end**, so a
hand-typed `[color=#123456]` is grabbable too. Each surviving swatch's tooltip names **who used
it and how many times**, ordered by usage — which surfaces a colour's owner without guessing who
authored it versus quoted it. Clicking a swatch inserts `[color=…]` as always (and a single
**Ctrl+Z** undoes the appended ones, since they go through the browser's native edit history).
See [ADR 0019](./docs/adr/0019-color-grab-augments-native-palette.md).

### 5. Keyboard shortcuts — ✅ done

The same shortcuts on every browser, active only inside a writing area — the composer **and the
Tribune's chatbox**: **Ctrl+B** bold, **Ctrl+I** italic, **Ctrl+U** underline, **Ctrl+K** link,
**Ctrl+E** code, then **Alt+Q** quote, **Alt+L** list, **Alt+G** colour, **Alt+N** centre,
**Alt+K** spoiler and the rest — reusing phpBB's own accesskey letters where it has them, so
existing muscle memory keeps working.

They *click the forum's own toolbar buttons* rather than inserting text, so they inherit each
button's behaviour and cover admin-added BBCodes for free; each button's tooltip is rewritten to
show its combo. Whichever buttons a surface actually has are the ones that bind — the chat has no
list or centre button, so those keys keep their browser meaning there. Nothing the browser or the
composer already owns is claimed — Ctrl+Z above all.
See [ADR 0017](./docs/adr/0017-keyboard-shortcuts-delegate-to-toolbar.md).

### 6. Emoji picker — ✅ done

A searchable **Unicode emoji** panel in the composer *and* the Tribune's chatbox, opened from a
toolbar button or with **Alt+I**. This is separate from the forum's own image emoticons, which
both surfaces already have and which are left untouched.

Search matches **French and English** names and keywords, accent- and punctuation-blind, so both
`coeur` and `heart` find ❤️; the emoji you use come back as a **Récents** row. Insertion goes
through the same undo-safe path as everything else, so a single **Ctrl+Z** takes it back, and the
chat's 1040-character cap is checked *before* writing so an over-long message says so instead of
silently doing nothing.

The ~1900-emoji table ships as an extension asset fetched the first time the panel opens, rather
than being bundled into the content script that runs on every forum page.
See [ADR 0022](./docs/adr/0022-lazy-loaded-data-assets.md).

### Backup — export & import

Not a toggleable feature, but a section of the options page (the cog in the popup): everything
the extension stores — your feature toggles, the whole BBCode preset library, and the emoji
picker's recents — exports to a single JSON file, and imports back from one.

Import is deliberately cautious rather than a wholesale overwrite. It shows you what the file
holds before anything is written, and lets you pick: new presets are ticked by default, while
anything that would replace a preset you already have is flagged and left unticked until you
say so. Recents are unticked by default too, since a recents list is replaced rather than
merged. Highlights are out of scope — they are anchored to specific posts on this forum and
mean nothing in another browser's copy.

It lives on the options page rather than in the popup for a concrete reason: the popup closes
the instant a file-picker dialog takes focus, taking the pending import with it.
See [ADR 0021](./docs/adr/0021-json-export-import.md).

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
[`.github/workflows/release.yml`](./.github/workflows/release.yml), which builds both targets,
submits the new Firefox version (plus its sources) to AMO's listed channel and the Chrome
version to the Chrome Web Store's unlisted listing, and publishes a GitHub Release with the zips
attached. Members install from the AMO listing (Firefox) or the store link (Chrome/Brave); both
stores auto-update. See [`docs/PUBLISHING.md`](./docs/PUBLISHING.md) for the full flow — the
one-time setup each store needs, and the listing copy in
[`store/listing-fr.md`](./store/listing-fr.md) — plus
[ADR 0010](./docs/adr/0010-distribution-and-release-automation.md) and
[ADR 0018](./docs/adr/0018-chrome-web-store-distribution.md) for the rationale. The extension's
privacy policy, which both listings link to, is [`docs/PRIVACY.md`](./docs/PRIVACY.md).

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
