import {
  findMessageBox,
  findMessageTextarea,
  findSubjectInput,
  isDarkTheme,
  isTopicPage,
  readComposerParams,
  watchTheme,
} from '@/lib/phpbb';
import {
  deleteDraft,
  draftKey,
  dropSubmittedDrafts,
  emptyDraftStore,
  findDraft,
  loadDraftStore,
  markDraftSubmitted,
  pruneDrafts,
  putDraft,
  saveDraftStore,
  type Draft,
  type DraftStore,
} from '@/lib/drafts';
import { insertAtRange } from '@/lib/textarea';
import { log, warn } from '@/lib/log';
import { formatAge } from './age';
import { createRecoveryBar, type RecoveryBar } from './draft-bar';

/**
 * The autosave-and-recover half of message-loss protection.
 *
 * `beforeunload` (docs/adr/0008) only fires when the *user* navigates and the
 * browser chooses to ask. This covers what it cannot: a browser crash, a tab
 * killed under memory pressure, a reflex click on "Leave", or a submit phpBB
 * refuses — an expired `form_token` on a 45-minute post being the one that
 * actually bites here. The composer is snapshotted into `browser.storage.local`
 * as it is typed, and offered back on the next visit.
 *
 * ⚠ **A draft is offered, never restored on its own.** phpBB may have pre-filled
 * the box itself (an edit, one of its own server-side drafts, a preview
 * round-trip), and silently overwriting that is the single way this could
 * *cause* the loss it exists to prevent.
 *
 * It lives beside the guard rather than in a feature of its own because the two
 * are one protection with one switch, and because the clearing seam below is
 * only correct at the guard's own "this send is really going out" moment. See
 * docs/adr/0027-draft-autosave-and-recovery.md.
 */

/**
 * How long the writer must pause before a snapshot is written.
 *
 * Short enough that a crash costs at most a sentence, long enough that a fast
 * typist isn't writing to `storage.local` on every keystroke. The debounce is
 * also the *real* protection against a tab closing mid-write: a
 * `storage.local.set` racing a tab close is not guaranteed to land, so the
 * mitigation is having written recently rather than trying to write at the end.
 */
const SAVE_DEBOUNCE_MS = 800;

/** The subject field's own `maxlength` on this forum is 124; respect whatever it says. */
function setSubject(input: HTMLInputElement, value: string): void {
  const max = input.maxLength;
  input.value = max > 0 ? value.slice(0, max) : value;
  // phpBB has no listener on #subject today, but a synthetic `input` keeps the
  // field honest for anything that starts watching it — and for our own capture.
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

/**
 * Stamp the draft belonging to the composer we are currently on, if there is
 * one, as handed to a submit we believe went out.
 *
 * Stateless — it re-derives the key from the URL rather than sharing state with
 * `setupDraftAutosave`, so the submit path can call it without caring whether
 * the capture half found anything to do. Returns without writing when there is
 * no draftable composer or no draft under its key.
 */
export async function markCurrentDraftSubmitted(): Promise<void> {
  const key = draftKey(readComposerParams());
  if (key === null) return;
  await markDraftSubmitted(key);
}

/**
 * Wire draft capture and recovery for whatever page we are on. Returns a
 * cleanup, or nothing when there is no work here.
 */
export function setupDraftAutosave(): (() => void) | void {
  const textarea = findMessageTextarea();

  // Not a composer. The one thing left to do is retire drafts whose post went
  // through: reaching a thread view after a submit is the success signal that
  // the submit mark is waiting on. Cheap — it writes only if a mark exists.
  if (textarea === null) {
    if (isTopicPage()) {
      void dropSubmittedDrafts().catch((err) => {
        warn('exit-guard: could not retire submitted drafts', err);
      });
    }
    return;
  }

  const params = readComposerParams();
  const key = draftKey(params);
  if (key === null) {
    log('exit-guard: composer has no draftable key (mode =', params.mode, ')');
    return;
  }

  const subjectInput = findSubjectInput();
  const messageBox = findMessageBox();

  let disposed = false;
  let store: DraftStore = emptyDraftStore();
  let bar: RecoveryBar | null = null;
  let unwatchTheme: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Set while we write the draft back into the composer. `insertAtRange`'s
   * `setRangeText` fallback dispatches a bubbling synthetic `input` event, and
   * `setSubject` dispatches one unconditionally — without this, a restore
   * immediately re-captures itself.
   */
  let restoring = false;
  /** The last snapshot actually persisted, so an unchanged one is not rewritten. */
  let lastWritten: string | null = null;

  const controller = new AbortController();
  const { signal } = controller;

  const persist = (next: DraftStore) => {
    store = next;
    // `.catch`, never `.finally` — a `.finally` here would report success over a
    // rejected write, which is exactly how the Firefox DataCloneError stayed
    // invisible once before (CLAUDE.md).
    void saveDraftStore(next).catch((err) => {
      warn('exit-guard: could not save the draft', err);
    });
  };

  const closeBar = () => {
    bar?.destroy();
    bar = null;
    unwatchTheme?.();
    unwatchTheme = null;
  };

  const save = () => {
    if (disposed || restoring) return;
    const subject = subjectInput?.value ?? '';
    const body = textarea.value;

    // Nothing worth keeping: an untouched or empty editor must never write.
    // Same "dirty" definition the beforeunload guard uses.
    if (body.trim() === '' || body === textarea.defaultValue) return;

    const fingerprint = `${subject} ${body}`;
    if (fingerprint === lastWritten) return;
    lastWritten = fingerprint;

    persist(
      putDraft(store, { id: key, topicId: params.t ?? '', subject, body }, Date.now()),
    );
  };

  const scheduleSave = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(save, SAVE_DEBOUNCE_MS);
  };

  const restore = (draft: Draft) => {
    restoring = true;
    try {
      // The whole document replaced in one undo unit, so Ctrl+Z puts back
      // whatever phpBB had in the box (docs/adr/0013). `#subject` is written
      // directly instead — it is an <input>, and it carries a maxlength.
      insertAtRange(
        textarea,
        { start: 0, end: textarea.value.length },
        draft.body,
        draft.body.length,
      );
      if (subjectInput !== null && draft.subject !== '') {
        setSubject(subjectInput, draft.subject);
      }
    } finally {
      restoring = false;
    }
    // Keep the draft: the post still hasn't been sent, and the writer may yet
    // lose this tab. Re-stamp it so it reflects what is now in the box — and
    // clear any submit mark, which `putDraft` does as part of writing.
    lastWritten = null;
    save();
    closeBar();
  };

  const offer = (draft: Draft) => {
    const anchor = messageBox ?? textarea.parentElement;
    if (anchor === null) return;
    bar = createRecoveryBar({
      onRestore: () => restore(draft),
      onIgnore: () => {
        persist(deleteDraft(store, key));
        closeBar();
      },
    });
    bar.setDark(isDarkTheme());
    bar.show(anchor, textarea, formatAge(Date.now() - draft.savedAt));
    // The forum's theme switch mutates the class in place, without a reload.
    unwatchTheme = watchTheme((dark) => bar?.setDark(dark));
  };

  void loadDraftStore()
    .then((loaded) => {
      if (disposed) return;
      // Retention is applied on boot as well as on write, so an age-expired
      // draft goes even on a profile that hasn't composed anything in weeks.
      const pruned = pruneDrafts(loaded, Date.now());
      if (pruned === loaded) store = loaded;
      else persist(pruned);

      const draft = findDraft(store, key);
      // Nothing to offer when the box already holds this text — phpBB restored
      // one of its own drafts, or this is a preview round-trip.
      //
      // An empty body is refused too. `save` never writes one, but the repair
      // pass keeps a subject-only record, and restoring that would *clear* a
      // composer phpBB had filled — the one outcome this must never produce.
      if (draft === null || draft.body === '' || draft.body === textarea.value) return;
      // The submit mark is deliberately ignored here: being back in this
      // composer means the post did not go through, so the draft is in play
      // again. `save()` clears the mark on the next capture.
      offer(draft);
    })
    .catch((err) => {
      warn('exit-guard: could not load the draft store', err);
    });

  textarea.addEventListener('input', scheduleSave, { signal });
  subjectInput?.addEventListener('input', scheduleSave, { signal });

  // Best-effort flush when the tab is hidden or closed. Not a guarantee — the
  // write is async and may not land — which is why SAVE_DEBOUNCE_MS is short.
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') save();
    },
    { signal },
  );

  log(`exit-guard: watching the composer for drafts (key = ${key})`);

  return () => {
    disposed = true;
    controller.abort();
    if (timer !== null) clearTimeout(timer);
    closeBar();
  };
}
