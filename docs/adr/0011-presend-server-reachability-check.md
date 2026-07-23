# 0011. Pre-send server reachability check for the exit guard

Status: Accepted

Date: 2026-07-23

## Context

The exit guard ([[0008-beforeunload-exit-guard]]) protects a draft against *leaving* the page,
but not against the writer's own **submit**. When the forum — or an intermediate gateway — is
down or unreachable, clicking *Envoyer* POSTs into the void: the browser lands on an error page
and the draft is lost. `beforeunload` cannot help, because the navigation *is* the user's
intentional submission. This had cost real posts.

We wanted to catch a dead server *before* the submission navigates away, hold the post, and let
the writer keep their text. Options considered for the "server down" confirmation were the
native `confirm()` (zero new UI, but its OK/Enter default is the unsafe "send anyway") versus a
custom in-page dialog (more code, but the safe choice can be the default). The user chose the
custom dialog, without a clipboard/"copy text" affordance (staying on the page already lets them
copy). Doing the check needs a network request, which the project had never made before.

## Decision

We will add a **same-origin reachability preflight** to the exit-guard feature. On a genuine
post submission the feature intercepts the form's `submit` event (capture phase, on `document`),
`preventDefault()`s it, and calls `isForumReachable()` in `src/lib/reachability.ts` — a
`HEAD location.origin/` with an `AbortController` timeout. **Reachable = a response with
`status < 500`**; a throw, timeout, or `5xx` counts as down. The check is deliberately lenient
because the escape hatch below covers false positives.

- **Reachable:** the feature re-submits the form programmatically with `form.requestSubmit(submitter)`
  (preserving phpBB's `name="post"` field), guarded by a one-shot `bypass` flag so the re-fired
  event passes through, and an `isSubmitting` flag so `beforeunload` doesn't also prompt.
- **Unreachable:** it opens the extension's **first in-page UI** — a Shadow-DOM modal
  (`server-down-modal.ts`) isolated from phpBB's CSS and styled only through the `.style`
  property (never an injected `<style>` tag, which a page `style-src` CSP could strip). Its
  default/focused button keeps the user on the page; a secondary *"Envoyer quand même"* re-submits
  anyway.

Only the real *Submit* (`name="post"`) is guarded; Preview / Save-draft / Cancel submit normally.
The request runs from the content script under the existing `host_permissions`
(`*://*.dreamland-reborn.net/*`) — **no new permission and no background worker**.

## Consequences

- Every genuine post now waits on a network round-trip (bounded by the timeout) before it
  submits. The check is same-origin only; it is a liveness smoke test of the site/gateway, not a
  guarantee the specific POST will succeed.
- This establishes three patterns the codebase lacked: a content-script `fetch`, submit
  interception with programmatic re-submit, and an injected in-page modal. Future features that
  need a network call or a dialog should reuse `src/lib/reachability.ts` and the Shadow-DOM +
  `.style` approach rather than reaching for a background worker or a page `<style>`.
- Leaning lenient (`< 500`, plus the "send anyway" button) trades a few unnecessary POSTs to a
  flaky-but-alive server for not blocking a writer when the check is wrong. Tightening to
  `status === 200` later is a one-line change.
- `findPostForm` / `findSubmitButton` keep the new form/submit selectors in one place
  ([[0005-centralize-phpbb-dom]]); a skin change is still a single-file edit.

Related: [[0008-beforeunload-exit-guard]], [[0005-centralize-phpbb-dom]]
