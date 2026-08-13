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
 * The autosave-and-recover half of message-loss protection: the composer is snapshotted into
 * `browser.storage.local` as it is typed and offered back on the next visit. Covers what
 * `beforeunload` cannot — a crash, a tab killed under memory pressure, a reflex "Leave", or
 * a submit phpBB refuses on an expired `form_token`. See docs/adr/0027.
 *
 * ⚠ **A draft is offered, never restored on its own.** phpBB may have pre-filled the box
 * itself (an edit, one of its own server-side drafts, a preview round-trip), and silently
 * overwriting that is the one way this could *cause* the loss it exists to prevent.
 */

/**
 * Short enough that a crash costs at most a sentence, long enough that a fast typist isn't
 * writing to `storage.local` on every keystroke. The debounce is also the *real* protection
 * against a tab closing mid-write: a `set` racing a tab close is not guaranteed to land, so
 * the mitigation is having written recently rather than trying to write at the end.
 */
const SAVE_DEBOUNCE_MS = 800;

/** The subject field's own `maxlength` on this forum is 124; respect whatever it says. */
function setSubject(input: HTMLInputElement, value: string): void {
  const max = input.maxLength;
  input.value = max > 0 ? value.slice(0, max) : value;
  // phpBB has no listener on #subject today, but a synthetic `input` keeps the field
  // honest for anything that starts watching it — and for our own capture.
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

/**
 * Stateless — re-derives the key from the URL rather than sharing state with
 * `setupDraftAutosave`, so the submit path can call it without caring whether the capture
 * half found anything to do.
 */
export async function markCurrentDraftSubmitted(): Promise<void> {
  const key = draftKey(readComposerParams());
  if (key === null) return;
  await markDraftSubmitted(key);
}

/** Returns a cleanup, or nothing when this page has no work. */
export function setupDraftAutosave(): (() => void) | void {
  const textarea = findMessageTextarea();

  // Not a composer. All that is left is retiring drafts whose post went through:
  // reaching a thread view is the success signal the submit mark waits on. Writes
  // only if a mark exists.
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
   * Set while writing the draft back into the composer: `insertAtRange`'s fallback and
   * `setSubject` both dispatch a synthetic `input`, so without this a restore immediately
   * re-captures itself.
   */
  let restoring = false;
  /** The last snapshot actually persisted, so an unchanged one is not rewritten. */
  let lastWritten: string | null = null;

  const controller = new AbortController();
  const { signal } = controller;

  const persist = (next: DraftStore) => {
    store = next;
    // `.catch`, never `.finally` — a `.finally` reports success over a rejected write,
    // which is how the Firefox DataCloneError stayed invisible once before.
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

    // An untouched or empty editor must never write. Same "dirty" definition the
    // beforeunload guard uses.
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
      // One undo unit for the whole document, so Ctrl+Z puts back whatever phpBB had
      // in the box (docs/adr/0013). `#subject` is written directly instead — it is an
      // <input>, and it carries a maxlength.
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
    // Keep the draft: the post still hasn't been sent and the tab may yet be lost.
    // Re-stamping it clears any submit mark, which `putDraft` does while writing.
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
      // Retention runs on boot as well as on write, so an age-expired draft goes even
      // on a profile that hasn't composed anything in weeks.
      const pruned = pruneDrafts(loaded, Date.now());
      if (pruned === loaded) store = loaded;
      else persist(pruned);

      const draft = findDraft(store, key);
      // Nothing to offer when the box already holds this text — phpBB restored one of
      // its own drafts, or this is a preview round-trip. An empty body is refused too:
      // `save` never writes one, but the repair pass keeps a subject-only record, and
      // restoring that would *clear* a composer phpBB had filled.
      if (draft === null || draft.body === '' || draft.body === textarea.value) return;
      // The submit mark is ignored here: being back in this composer means the post did
      // not go through, so the draft is in play again. `save()` clears it next capture.
      offer(draft);
    })
    .catch((err) => {
      warn('exit-guard: could not load the draft store', err);
    });

  textarea.addEventListener('input', scheduleSave, { signal });
  subjectInput?.addEventListener('input', scheduleSave, { signal });

  // Best-effort flush when the tab is hidden. Not a guarantee — the write is async and
  // may not land — which is why SAVE_DEBOUNCE_MS is short.
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
