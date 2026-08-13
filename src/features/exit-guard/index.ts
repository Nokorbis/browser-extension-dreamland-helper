import { i18n } from '#i18n';
import type { Feature } from '../types';
import { findMessageTextarea, findPostForm, findSubmitButton } from '@/lib/phpbb';
import { isForumReachable } from '@/lib/reachability';
import { error, log, warn } from '@/lib/log';
import { showServerDownModal } from './server-down-modal';
import { markCurrentDraftSubmitted, setupDraftAutosave } from './drafts';

/**
 * Submit button names the reachability preflight covers. Cancel is a plain link on this
 * forum, not a submit button, so it never reaches this check.
 */
const GUARDED_SUBMITTER_NAMES = new Set(['post', 'preview', 'save']);

/**
 * Message loss protection: three layers, one switch.
 *
 * 1. `beforeunload` raises the browser's native "Leave site?" prompt while the textarea
 *    holds unsaved text. Browsers ignore custom wording, so we only decide *whether* to
 *    prompt. See docs/adr/0008.
 * 2. A post, preview or save-draft first pings the forum, since a dead server or gateway
 *    navigates to an error page and loses the draft. A modal holds the send, defaulting to
 *    staying put, with a "continue anyway" hatch for a false positive. See docs/adr/0011.
 * 3. The composer is snapshotted as it is typed and offered back next visit, covering what
 *    `beforeunload` cannot: a crash, a killed tab, a reflex "Leave", an expired
 *    `form_token`. Lives in `./drafts.ts`.
 *
 * ⚠ One switch, not three: layer 3's bookkeeping is only correct at layer 2's decision point
 * (see `doSubmit`), and separate toggles let the guard be turned off while autosave kept
 * running with no way to ever retire a draft. See docs/adr/0027.
 */
export const exitGuard = {
  id: 'exit-guard' as const,
  name: i18n.t('features.exitGuard.name'),
  description: i18n.t('features.exitGuard.description'),
  implemented: true,

  setup() {
    // Set while we drive a genuine, checked submission, so the beforeunload guard
    // doesn't also prompt on the resulting navigation.
    let isSubmitting = false;
    // One-shot: the next submit event is our own re-submit — let it pass.
    let bypass = false;
    // True from a submit being intercepted until the check resolves *and* any modal it raised
    // is dismissed. Both halves matter: without the first a double-click fires two probes;
    // without the second, a submit while the modal is up raises another, overwrites
    // `closeModal` and leaks the first's shadow host. Hence it is released by the modal's own
    // handlers, not a `finally` that runs when it is shown.
    let checking = false;
    let closeModal: (() => void) | null = null;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isSubmitting) return;
      const textarea = findMessageTextarea();
      const dirty =
        textarea !== null &&
        textarea.value.trim().length > 0 &&
        textarea.value !== textarea.defaultValue;
      if (dirty) {
        event.preventDefault();
        // Legacy assignment kept for older Chromium; required to trigger the prompt.
        event.returnValue = '';
      }
    };

    const onSubmit = async (event: SubmitEvent) => {
      // Diagnostic: proves the listener fires for *any* submit. A post that never logs this
      // means the content script isn't injected here, or the form was submitted a way that
      // skips the event (HTMLFormElement.submit()).
      const target = event.target;
      const targetId = target instanceof Element ? target.id || target.tagName : target;
      log('submit event seen; target =', targetId);

      const form = findPostForm();
      if (form === null) {
        log('…ignored: no post form found on this page');
        return;
      }
      if (target !== form) {
        log('…ignored: not the post form');
        return;
      }

      // Our own programmatic re-submit — allow it through untouched.
      if (bypass) {
        bypass = false;
        log('…allowed through (our own re-submit)');
        return;
      }

      // Guard post, Preview and Save-draft: all three lose the same way to a dead server,
      // and all three must set `isSubmitting` so their navigation doesn't trip the
      // beforeunload prompt. Any other named submitter passes through untouched.
      const submitter = event.submitter;
      const submitterName = submitter?.getAttribute('name');
      if (submitterName && !GUARDED_SUBMITTER_NAMES.has(submitterName)) {
        log(`…allowed through (button "${submitterName}", not guarded)`);
        return;
      }

      event.preventDefault();
      if (checking) {
        log('…ignored: a check or its modal is already up');
        return;
      }
      checking = true;
      log(`submit intercepted (submitter=${submitterName ?? 'none'}) — pinging server`);

      /**
       * Hand the form back to the browser, having first stamped the draft as on its way
       * out. **This is the one moment that mark is correct**, which is why layer 3 cannot
       * be a feature of its own guessing at it from outside.
       *
       * ⚠ The test is "not preview, not save", never `=== 'post'`. Every other named
       * submitter returned above, so what is left is `post` or no usable name — which spells
       * itself two ways (`null` from `getAttribute`, `undefined` with no submitter, i.e. the
       * Enter-key path). Testing for `'post'` and `null` silently skipped the Enter-key send.
       *
       * Marked rather than deleted: the preflight only proves the server answered a HEAD, and
       * an expired `form_token` still bounces — the exact loss layer 3 exists for. Awaited
       * because `requestSubmit` navigates and a fire-and-forget write races it.
       */
      const doSubmit = async () => {
        if (submitterName !== 'preview' && submitterName !== 'save') {
          try {
            await markCurrentDraftSubmitted();
          } catch (err) {
            // Never block a send on draft bookkeeping: losing this write costs one
            // draft offered more than necessary.
            warn('exit-guard: could not mark the draft as submitted', err);
          }
        }
        bypass = true;
        isSubmitting = true;
        form.requestSubmit(submitter ?? findSubmitButton(form));
      };

      try {
        // Probe what the POST targets, not the homepage — see the ⚠ on
        // `isForumReachable`.
        const probeUrl = form.action || `${location.origin}/`;
        const reachable = await isForumReachable(probeUrl);
        log('server reachable =', reachable);
        if (reachable) {
          checking = false;
          await doSubmit();
          return;
        }
        log('server unreachable — showing modal');
        // `checking` stays true across this call on purpose — whichever handler
        // dismisses the modal releases it. See its declaration.
        closeModal = showServerDownModal({
          onStay: () => {
            closeModal = null;
            checking = false;
          },
          onContinueAnyway: () => {
            closeModal = null;
            checking = false;
            // `doSubmit` reports its own draft-write failure, so this only guards
            // `requestSubmit` throwing.
            void doSubmit().catch((err) => {
              error('exit-guard: the message was not sent', err);
            });
          },
        });
      } catch (err) {
        // `isForumReachable` never rejects, but `requestSubmit` and building the modal
        // can. `checking` stuck true would wedge the composer for the rest of the page's
        // life with the submit already prevented, so release it.
        checking = false;
        error('exit-guard: pre-send check failed; the message was not sent', err);
      }
    };

    // `onSubmit` is async, so a throw inside it would become an unhandled rejection.
    // It handles its own failures; this is the backstop.
    const onSubmitListener = (event: SubmitEvent) => {
      void onSubmit(event).catch((err) => {
        error('exit-guard: submit handler failed', err);
      });
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('submit', onSubmitListener, true);
    log('exit-guard: listeners attached (beforeunload + submit)');

    // Layer 3 decides for itself whether this page has anything to do — composer,
    // thread view, or neither — and returns nothing when it doesn't.
    const stopDrafts = setupDraftAutosave();

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('submit', onSubmitListener, true);
      closeModal?.();
      closeModal = null;
      stopDrafts?.();
    };
  },
} satisfies Feature;
