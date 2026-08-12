# Design — Draft autosave & recovery

Status: **Shipped.** The decisions this sketch left open are settled in
[ADR 0027](../adr/0027-draft-autosave-and-recovery.md), which is the record to read — this note
is kept only for the problem statement and the shape of the thinking that led there.

## Problem

`exit-guard` arms `beforeunload`, which only fires when the *user* navigates and the browser
chooses to ask. It cannot cover the losses that actually hurt:

- browser or OS crash, tab killed under memory pressure, power loss;
- clicking "Leave" by reflex on the native prompt;
- a submit that bounces to an error page;
- **phpBB's form token expiring.** The composer carries `creation_time` + `form_token`
  (verified in `real_snippets/posting.html`). A 45-minute roleplay post can outlive them and
  be rejected on submit.

The extension leads with "message loss protection". This is the half that isn't built.

## Design

A new feature `draft-autosave`, following the standard shape (`src/features/<id>/index.ts`,
registered in `ALL_FEATURES`, defaulted in `DEFAULT_SETTINGS`).

**Store** — its own `storage.local` key + module per ADR 0012, so `src/lib/drafts.ts` with
`normalizeDraftStore`, pure mutations, and the `store-kit` plumbing. Shape:

```ts
interface Draft {
  id: string;        // `${topicId}:${mode}` — see "keying" below
  topicId: string;
  subject: string;
  body: string;
  savedAt: number;
}
```

**Keying.** `readTopicId()` already exists in `phpbb.ts`. A new topic has no topic id, so the
key needs a second component — reply / new-topic / edit-`{postId}`. Getting this wrong shows
up as one thread's draft offered on another, so it wants a test on the pure key builder.

**Capture.** Debounced snapshot of `#message` (and `#subject`) on `input`, reusing the
`commit` pattern in `PresetsSection.svelte` — short write debounce, report failures, never
`.finally`. Skip when the textarea is clean (`value === defaultValue`) so opening a composer
and leaving never writes.

**Recovery.** On composer boot, if a draft exists for this key *and* is newer than what the
box holds, show a bar above `#message-box`:
`Brouillon récupéré (il y a 12 min) — Restaurer / Ignorer`.

⚠ **Never restore silently.** phpBB may itself have pre-filled the box (an edit, a server
draft, a preview round-trip). Overwriting that unasked is the one way this feature could
*cause* a loss instead of preventing one. Restore goes through `insertAtRange` so it lands on
the undo stack.

**Clearing.** Drop the draft when `exit-guard` sees a genuine, checked submit succeed — it
already intercepts the submit and knows which submitter fired. That is the natural seam, but
it is also the one real cross-feature dependency here, so it may want to live in `src/lib`
rather than one feature reaching into the other (ADR 0023).

## Open questions

1. **Retention.** `storage.local` has a quota and roleplay posts are long. Cap by count, by
   age, or by bytes? Prune on write or on boot?
2. **Guest / multi-account.** Drafts are per-browser, not per-user. Is a draft written under
   one account being offered under another acceptable, or does the key need the username?
3. **Does phpBB's own "save draft" make this redundant?** It exists (`name="save"`) but is
   manual. Worth confirming with actual writers before building.
4. Does the recovery bar belong in the page (vanilla, like `highlight/toolbar.ts`) or a shadow
   root? Vanilla is simpler and this is small and static — probably ADR 0016's "keep it out of
   Svelte" side.

## Effort

Moderate — the largest of the three. New store + new feature + a UI surface. The store and the
key builder are pure and testable; the composer wiring is hand-verified DOM glue as usual.
