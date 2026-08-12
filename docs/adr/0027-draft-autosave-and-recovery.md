# 0027. Draft autosave inside the exit guard, with recovery always offered and never applied

Status: Accepted

Date: 2026-08-12

## Context

The extension leads with "message loss protection", but until now that meant one mechanism:
`beforeunload` ([[0008-beforeunload-exit-guard]]), plus a reachability preflight on submit
([[0011-presend-server-reachability-check]]). Both only fire while the page is alive and the
writer is the one leaving. Neither covers what actually costs posts on a forum where a single
message is 30–60 minutes of writing:

- a browser or OS crash, a tab killed under memory pressure, a power cut;
- clicking "Leave" by reflex on the native prompt, which is deliberately unstyled and easy to
  dismiss;
- a submit that bounces to an error page;
- **phpBB's form token expiring.** The composer carries `creation_time` + `form_token`
  (verified in `real_snippets/posting.html`), and a long post can outlive them and be rejected
  at exactly the moment the writer thought they were done.

phpBB has its own draft mechanism — the `name="save"` button, and the `load_draft` flag in the
composer's inline script — but it is entirely manual, so it protects only writers who
remembered. That is the half this record is about.

Four things had to be decided, and none of them has an obvious default.

**What identifies a draft.** The composer's mode and ids live *only* in the URL query string:
the form's four hidden inputs are `topic_cur_post_id`, `show_panel`, `creation_time` and
`form_token`, none of them a key. `readTopicId()` alone is not enough — its DOM-scan fallback
happily returns a topic id on a `mode=quote&p=…` page and on a new-topic page, so it cannot
discriminate reply from new-topic from edit. Getting this wrong surfaces as one thread's draft
offered on another.

**When a draft stops being needed.** The tempting seam is `exit-guard`'s `doSubmit()`, which is
the single choke point for every genuine, checked submission. But it runs *before* the POST
lands, and the reachability check it sits behind only proves the server answered a `HEAD` — it
says nothing about whether phpBB accepted the post. Deleting there loses the draft on precisely
the failure mode (an expired `form_token`) that motivated the feature.

**Whether to restore automatically.** A draft that reappears in the box without being asked for
is the one way this feature could *cause* a loss rather than prevent one: phpBB may itself have
pre-filled the composer — an edit, one of its own server drafts, a preview round-trip.

**How much to keep.** `storage.local` has a quota, roleplay posts are long, and this codebase
has ruled out both `storage.sync` and the `unlimitedStorage` permission
([[0012-feature-owned-data-stores]]).

**And whether this is a feature at all.** It was first built as a seventh feature,
`draft-autosave`, with its own toggle and a cross-feature seam routed through `src/lib/drafts.ts`
to satisfy [[0023-shared-primitives-in-lib]]. That structure was wrong, for a reason that only
shows up from the *settings* side: `exit-guard` is the sole caller of the "this send is really
going out" mark, so turning the guard off while autosave stayed on left autosave unable to ever
retire a draft. Every posted message would linger until retention evicted it and the recovery bar
would keep offering messages already sent — with nothing logged, no gate failing, and a popup
showing two independent switches that gave no hint one depended on the other. That is the failure
shape [[0025-feature-ids-as-a-type]] exists to make unrepresentable. `Feature.id` is the
persisted settings key and can never be renamed once shipped, so the window to correct it closed
at the next release; the id had not yet reached a user.

## Decision

We will add autosave as a **third mechanism inside `exit-guard`**, not as a feature of its own,
plus a store `src/lib/drafts.ts` following the established feature-owned-store shape
([[0012-feature-owned-data-stores]]) with one deliberate departure. The five questions are
settled as follows.

**One feature, one switch, three layers.** `exit-guard` already bundles two mechanisms —
`beforeunload` ([[0008-beforeunload-exit-guard]]) and the reachability preflight
([[0011-presend-server-reachability-check]]) — under a name that already describes all three:
*"Protection contre la perte de message"*. Autosave joins them. The capture and recovery code
lives in `src/features/exit-guard/drafts.ts` behind two exports (`setupDraftAutosave`,
`markCurrentDraftSubmitted`) so `index.ts` stays readable, and the mark is now an ordinary
intra-feature call rather than a seam. `draftKey` nevertheless stays in `src/lib/drafts.ts`,
beside the store: a store's identity function belongs with the store, so the rule that mints a
key and the repair pass that validates one cannot drift apart.

**A draft's id is derived, not minted.** Every other store in the repo keys records on
`newId()`. This one keys on the composer itself, because identity has to be *recomputable* — a
composer reopening must find its own draft without having been told which one it is. The key is
built by a pure `draftKey(params)`:

| URL | Key |
|---|---|
| `mode=reply&t=3071` | `reply:3071` |
| `mode=quote&p=201246` | `reply:3071` |
| `mode=post&f=68` | `new:68` |
| `mode=edit&p=201246` | `edit:201246` |
| anything else, or a missing id | `null` — do nothing on this page |

`quote` **normalises to `reply`**: both routes produce a new post in the same thread, so a
writer who starts via "Citer" and returns via "Répondre" must meet the same draft. `edit` keys
on the post, because editing an existing message is a different document from replying to its
thread. A missing id component yields `null` rather than a partial key, since `reply:` would
collide across the entire forum.

The params come from `readComposerParams()` in `src/lib/phpbb.ts`, read from `location.search`
and **never from `form.action`** — phpBB's Preview button carries
`onclick="…action += '#preview'"`, so the action mutates under any code that reads it after a
click. `t` falls back to `readTopicId()`, because a `mode=quote&p=…` URL carries no topic id
while that page's topic-review links do.

**Clearing is mark-then-confirm, in two steps.** `exit-guard`'s `doSubmit()` calls
`markCurrentDraftSubmitted()` — stamping `submittedAt`, *not* deleting — and only for a real post
— expressed as "not `preview`, not `save`", since those two come straight back to the composer
and must leave the draft alone, and since "no usable submitter name" (the Enter-key path) spells
itself as both `null` and `undefined`. The draft is actually dropped by `dropSubmittedDrafts()`,
which `setupDraftAutosave` runs when a **`viewtopic.php` page loads**: that is the first moment
the post is demonstrably in the database. A bounced submit leaves the writer
on `posting.php` or an error page, and their text intact.

The mark is *awaited* before `form.requestSubmit()`, because that call navigates and a
fire-and-forget write would race it. `dropSubmitted` clears **every** mark, not just the current
topic's: after posting a new topic the browser lands on a `t` that the `new:<f>` key never knew
about, so matching by topic would strand that draft forever.

**A draft is offered, never applied.** On a composer boot with a draft under this key whose body
differs from what the box already holds, the feature shows a small bar above the textarea —
`Brouillon récupéré (il y a 12 min)` — with *Restaurer* and *Ignorer*. Nothing is written into
the composer without that click. Restore goes through `insertAtRange` so the whole replacement
is one undo unit and Ctrl+Z puts back whatever phpBB had ([[0013-undo-safe-text-insertion]]);
the subject is assigned directly, since it is an `<input>` with a `maxlength` of 124.

The bar is **vanilla**, not Svelte — small, static, shown once, which is the case
[[0016-svelte-in-content-script]] keeps out of the shadow-root Svelte path. It follows
`highlight/toolbar.ts`: a shadow host fenced with `all:initial`, everything styled through
`.style`, a `paint()` closure so the forum's theme switch can repaint it in place. Two things
are specific to it: it mounts **in flow, immediately before the textarea inside `#message-box`**
(appending to the anchor would put it *under* the editor; prepending would displace the
`bbcode-presets` panel), and its buttons are `type="button"` with no `name`, because they sit
inside `<form id="postform">` where anything else is a submit button that `exit-guard` reads as
a genuine post.

**Retention is capped on two axes: the 10 most recently saved drafts, and 15 days.** Applied by
a pure `pruneDrafts(store, now, …)` on **write and on boot**, never inside
`normalizeDraftStore`, which stays deterministic and clock-free so the repair pass that runs on
every read and every change notification remains testable and reproducible.

Capture is debounced 800 ms on `input` from `#message` and `#subject`, skipped while the body is
clean (`body.trim() === '' || body === textarea.defaultValue` — the same "dirty" test
`beforeunload` uses), and skipped when the snapshot is unchanged.

**Drafts stay out of the JSON backup bundle**, for the reason highlights do
([[0021-json-export-import]]): they are short-lived, tied to specific threads on this forum, and
meaningless in another browser's copy.

## Consequences

- The feature's headline claim is now true for the cases that actually hurt. A crash costs at
  most the last ~800 ms of typing rather than the whole post.
- **A stale draft can be offered where a fresh one was expected.** If the mark never lands (the
  write loses its race with navigation) or the writer posts and never opens a thread view, the
  bar appears once more than necessary. That is the deliberate direction of the trade: this
  design is biased toward offering too often rather than deleting too early, and every offer is
  one click to dismiss.
- **Abandoning a composer does not discard its draft**, and this was decided rather than
  overlooked. A writer who navigates away, gets the `beforeunload` prompt because the editor is
  dirty, and confirms *Leave* keeps their draft: it is unmarked, so `dropSubmitted` ignores it,
  and it is offered again the next time that composer opens. The intuition that confirming
  "Leave" means "discard this" is reasonable, and it was considered — the leave is even
  *detectable*, since `pagehide` fires after `beforeunload` only when the document really goes
  away, and a synchronous `sessionStorage` marker consumed on the next page load would survive
  the unload race that makes an async delete there unreliable. It was rejected because **a
  reflex click on that prompt is indistinguishable from a deliberate one** — the browser gives
  one signal for both — and the reflex click is itself one of the losses named in the Context
  above. Discarding would trade "one dismissible bar after an intentional abandon" for "a
  45-minute post gone after a misclick", which is the wrong side of the same asymmetry that
  decided the submit seam. A future change here needs a way to tell the two clicks apart, not
  just a better place to put the delete.
- The window between a submit and the confirming `viewtopic` load is the only place the store
  holds state that is neither current nor retired. Nothing else reads `submittedAt`, and
  retention collects anything that somehow stays marked.
- **The half-broken combination is gone by construction**, which was the point: there is no
  longer a switch that can disable the mark while leaving capture running. The cost is that a
  writer who wants the leave-prompt but would rather the extension did *not* keep post text on
  disk no longer has that choice — settings holds one boolean per feature, and a sub-toggle would
  be a new pattern needing its own record. The popup panel's "Supprimer tous les brouillons" and
  the 10/15-day retention are what that writer gets instead.
- `exit-guard` is now a three-mechanism feature and the largest in the codebase. `drafts.ts`
  keeps `index.ts` from doubling in length, but the folder is no longer something to skim.
- `doSubmit` became `async`, which means the reachable path now awaits one storage write before
  re-firing the form. It is a local write, but it is on the critical path of every send.
- Deriving ids instead of minting them makes this store the odd one out, and the key format is
  effectively frozen: changing it orphans every draft in every installed profile. That is
  cheaper here than for the other stores — an orphaned draft expires in 15 days — but it is why
  `draftKey` is pure and tested mode by mode rather than inlined into the feature.
- `Chrome` in `src/lib/shadow-ui.ts` grew `warnBg`/`warnFg`/`warnBorder`, mirroring the
  `--dlh-warn-*` custom properties. That file's existing ⚠ still applies: the JS palette and
  `src/lib/palette.css` are two hand-maintained copies of one set, and nothing tests that they
  agree.
- `src/lib/phpbb.ts` gained `findSubjectInput`, `readComposerParams` and `isTopicPage`. The
  first two are the first time anything in the codebase reads the composer's *identity* rather
  than its contents, and a skin or URL-scheme change now breaks draft keying — silently, by
  yielding `null` and simply not saving. The `log` line naming the resolved key is the only
  thing that would show it.
- Nothing protects against a **shared browser profile**: drafts are keyed by composer, not by
  account, so two members posting from one profile would see each other's drafts. Judged
  acceptable because the profile is already the account boundary for every other store here;
  the fix, if it is ever wanted, is a username component in the key and a `readCurrentUsername`
  in `phpbb.ts`.
- The feature does not, and will not, try to refresh an expired `form_token` in place. It
  preserves the text; re-authenticating the post is the writer's job.

Related: [[0008-beforeunload-exit-guard]], [[0011-presend-server-reachability-check]],
[[0012-feature-owned-data-stores]], [[0013-undo-safe-text-insertion]],
[[0016-svelte-in-content-script]], [[0021-json-export-import]],
[[0023-shared-primitives-in-lib]]
