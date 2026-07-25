# 0021. Extend the pre-send reachability guard to Preview and Save-draft

Status: Accepted

Date: 2026-07-25

## Context

[[0011-presend-server-reachability-check]] guarded only the real *Envoyer* submit
(`name="post"`): "Preview / Save-draft / Cancel submit normally." In practice that
meant Preview (`name="preview"`) and Save-draft (`name="save"`) fell through
`onSubmit`'s early return untouched — the event was never `preventDefault()`-ed, so
the browser genuinely navigated, but the guard's `isSubmitting` flag was never set on
that path either. The still-armed `beforeunload` listener from
[[0008-beforeunload-exit-guard]] then saw a dirty textarea during that real
navigation and fired the native "leave site?" prompt — wrong, since the user wasn't
leaving, just previewing or saving a draft. The same gap meant a dead server could
swallow a preview or a draft exactly the way 0011 was written to stop for a real post.

phpBB's composer form (verified against the live markup) has exactly these submit
buttons: `name="post"`, `name="preview"`, `name="save"`. There is no `name="cancel"`
submit button on this forum — Cancel, where phpBB has one, is a plain link — so it
never reaches the form's `submit` event at all, and the existing `beforeunload`
prompt firing when a user follows it away from unsaved text remains correct and is
out of scope here.

## Decision

We will guard `preview` and `save` the same way as `post`: a small
`GUARDED_SUBMITTER_NAMES` set (`post`, `preview`, `save`) in
`src/features/exit-guard/index.ts` replaces the old `submitterName !== 'post'` check.
Any submitter in that set (or a `null`-name submitter, the pre-existing Enter-key
fallback, still treated as `post`) gets the full existing treatment unchanged:
`preventDefault()`, `isForumReachable(form.action)`, then either a programmatic
`form.requestSubmit(submitter)` (setting `isSubmitting` so `beforeunload` stays
quiet) or the server-down modal. A submitter outside the set still passes through
untouched, so an unrecognized future button defaults to the old, unguarded behavior
rather than silently gaining a prompt.

Because the server-down modal is now shown for three different actions, not just a
send, its copy ("Envoyer quand même") no longer fit. We reworded it to be
action-neutral: the message drops "votre message n'a pas été envoyé" in favor of
"rien n'a été envoyé", and the escape-hatch button/i18n key is renamed from
`sendAnyway` to `continueAnyway` ("Continuer quand même"). The popup's feature
description and `store/listing-fr.md` were updated to match, since both previously
stated the check was send-only.

## Consequences

- Preview and Save-draft no longer trigger a spurious "leave site?" prompt, and now
  get the same protection against losing text to a dead server that a real post
  already had.
- The server-down modal's copy is intentionally generic across all three actions
  rather than naming the specific one in flight; a future guarded action does not
  need new modal copy, but also can't get action-specific wording without
  reintroducing that complexity.
- Cancel remains unguarded by design — it has no submit button on this forum, and
  even if a skin change added one, a real "leave with unsaved text" prompt is the
  correct behavior there, not something to suppress.
- `findSubmitButton` in `src/lib/phpbb.ts` is unchanged: it's only used as the
  `null`-submitter fallback, which still means "the real post button."

Related: [[0011-presend-server-reachability-check]], [[0008-beforeunload-exit-guard]]
