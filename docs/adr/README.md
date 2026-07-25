# Architecture Decision Records

This log captures the *why* behind Dreamland Reborn QoL's significant technical choices — the
kind of decision that is expensive to reverse or that a newcomer would otherwise have to
reverse-engineer from the code. Each record is a short, immutable note: once a decision is
made it is not rewritten; if it is reversed, a new ADR supersedes it and the old one's
status is updated to point forward.

Format is lightweight [Nygard-style](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):
**Context → Decision → Consequences**. To add one, copy [`template.md`](template.md) to the
next number, fill it in, and add a row below. See the **Architecture Decision Records**
section of [`../../CLAUDE.md`](../../CLAUDE.md) for when a change warrants an ADR.

| #    | Title                                                        | Status   |
|------|--------------------------------------------------------------|----------|
| [0001](0001-build-on-wxt.md) | Build the extension on WXT               | Accepted |
| [0002](0002-chrome-mv3-firefox-mv2.md) | Ship Chrome MV3 + Firefox MV2 from one source | Accepted |
| [0003](0003-svelte-5-popup-ui.md) | Svelte 5 for the popup UI               | Accepted |
| [0004](0004-feature-registry.md) | Thin content script, feature registry    | Accepted |
| [0005](0005-centralize-phpbb-dom.md) | Centralize phpBB DOM knowledge in one module | Accepted |
| [0006](0006-typed-settings-storage.md) | Typed settings layer over browser.storage.local | Accepted |
| [0007](0007-pin-typescript-5.md) | Pin TypeScript to the 5.x line          | Accepted |
| [0008](0008-beforeunload-exit-guard.md) | Use `beforeunload` to guard unsaved drafts | Accepted |
| [0009](0009-i18n-wxt-i18n.md) | Localize UI text with `@wxt-dev/i18n`        | Accepted |
| [0010](0010-distribution-and-release-automation.md) | Distribution & release automation | Accepted — Chrome half amended by [0018](0018-chrome-web-store-distribution.md) |
| [0011](0011-presend-server-reachability-check.md) | Pre-send server reachability check for the exit guard | Accepted — extended by [0021](0021-guard-preview-and-draft-submits.md) |
| [0012](0012-feature-owned-data-stores.md) | Feature-owned data stores beyond the settings map | Accepted |
| [0013](0013-undo-safe-text-insertion.md) | Preserve the native undo stack with `execCommand('insertText')` | Accepted |
| [0014](0014-popup-accordion-options-page.md) | Popup accordion plus an options page for feature settings | Accepted |
| [0015](0015-preset-placeholder-syntax.md) | Preset placeholder syntax as a frozen contract | Accepted |
| [0016](0016-svelte-in-content-script.md) | Svelte in the content script, mounted in a Shadow root | Accepted |
| [0017](0017-keyboard-shortcuts-delegate-to-toolbar.md) | Keyboard shortcuts drive phpBB's own toolbar buttons | Accepted |
| [0018](0018-chrome-web-store-distribution.md) | Chrome Web Store distribution | Accepted |
| [0019](0019-color-grab-augments-native-palette.md) | Colour grabber augments phpBB's own colour palette | Accepted |
| [0020](0020-persistent-text-highlights.md) | Persistent text highlights via the CSS Custom Highlight API | Accepted |
| [0021](0021-guard-preview-and-draft-submits.md) | Extend the pre-send reachability guard to Preview and Save-draft | Accepted |
