# 0008. Use `beforeunload` to guard unsaved drafts

Status: Accepted

Date: 2026-07-23

## Context

The exit-guard feature (#1) must stop a writer from accidentally losing a draft by leaving
the post editor — including via the back button, closing the tab, or following a link.
Intercepting navigation in a content script is constrained: most approaches can catch link
clicks but not the back button or tab close, and history-based tricks are fragile and
browser-specific.

## Decision

We will veto navigation with the `beforeunload` event. When the editor's textarea holds text
that differs from what it loaded with, the handler calls `event.preventDefault()` (and sets
the legacy `event.returnValue` for older Chromium) to trigger the browser's native
"Leave site?" confirmation. The handler is registered in the feature's `setup()` and removed
by the returned cleanup.

## Consequences

- Works uniformly across Chromium and Firefox and covers the back button and tab close,
  which lighter interception cannot.
- The prompt's wording is the browser's own — browsers deliberately ignore any custom
  message — so we control *whether* to prompt, not *what it says*.
- "Dirty" is defined narrowly (non-empty and `value !== defaultValue`) to avoid nagging on an
  untouched or empty editor; this depends on `findMessageTextarea` from
  [[0005-centralize-phpbb-dom]].

Related: [[0005-centralize-phpbb-dom]], [[0004-feature-registry]]
