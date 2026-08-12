import { i18n } from '#i18n';
import type { Feature } from '../types';
import { findMessageTextarea, findPostForm, findSubmitButton } from '@/lib/phpbb';
import { isForumReachable } from '@/lib/reachability';
import { error, log } from '@/lib/log';
import { showServerDownModal } from './server-down-modal';

/**
 * Submit button names the reachability preflight covers. phpBB's composer form
 * carries a fourth submitter, Cancel, but it's a plain link on this forum (no
 * `name="cancel"` submit button exists), so it never reaches this check.
 */
const GUARDED_SUBMITTER_NAMES = new Set(['post', 'preview', 'save']);

/**
 * Feature #1 — Exit guard.
 *
 * Two layers of draft protection on the post editor:
 *
 * 1. Leaving the page while the textarea holds unsaved text (back button,
 *    closing the tab, following a link) triggers the browser's native
 *    "Leave site?" prompt via `beforeunload`. Browsers ignore custom wording
 *    here, so we only decide *whether* to prompt. See
 *    docs/adr/0008-beforeunload-exit-guard.md.
 *
 * 2. Submitting a post, previewing it, or saving it as a draft first pings the
 *    forum (a same-origin HEAD) to confirm it responds. If the server or an
 *    intermediate gateway is down, the request would otherwise navigate to an
 *    error page and lose the draft — so instead we hold it and show a modal.
 *    Its default action keeps the user on the page (text intact); a "continue
 *    anyway" escape hatch covers a false-positive check. See
 *    docs/adr/0011-presend-server-reachability-check.md.
 */
export const exitGuard = {
  // `as const` so the literal survives inference: `FeatureId` in registry.ts is
  // built from these, and a widened `string` would make it match anything.
  id: 'exit-guard' as const,
  name: i18n.t('features.exitGuard.name'),
  description: i18n.t('features.exitGuard.description'),
  implemented: true,

  setup() {
    // Set while we drive a genuine, checked submission, so the beforeunload
    // guard below doesn't also prompt on the resulting navigation.
    let isSubmitting = false;
    // One-shot: the next submit event is our own re-submit — let it pass.
    let bypass = false;
    // True from the moment a submit is intercepted until the check resolves *and* any
    // modal it raised has been dismissed. Both halves matter. Without the first, a
    // double-click fires two probes; without the second, a submit arriving while the
    // modal is up raises a *second* modal, overwrites `closeModal`, and leaves the
    // first one's shadow host in the page forever. It is therefore released by the
    // modal's own handlers, not by a `finally` that runs the instant it is shown.
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
      // Diagnostic: proves the listener fires for *any* submit. If a post
      // submit never logs this, either the content script isn't injected on
      // this tab (reload the page) or the form is submitted a way that skips
      // the submit event (e.g. HTMLFormElement.submit()).
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

      // Guard the real "post" submission plus Preview and Save-draft — all three
      // lose the same way to a dead server, and all three must set `isSubmitting`
      // below so their real navigation doesn't also trip the beforeunload prompt.
      // Cancel (a plain link on this forum, not a submit button) and any other
      // unrecognized submitter still pass through untouched.
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

      const doSubmit = () => {
        bypass = true;
        isSubmitting = true;
        form.requestSubmit(submitter ?? findSubmitButton(form));
      };

      try {
        // Probe the URL the POST actually targets (posting.php), not the
        // homepage — a cached homepage 200 wouldn't prove the POST would land.
        const probeUrl = form.action || `${location.origin}/`;
        const reachable = await isForumReachable(probeUrl);
        log('server reachable =', reachable);
        if (reachable) {
          checking = false;
          doSubmit();
          return;
        }
        log('server unreachable — showing modal');
        // `checking` stays true across this call on purpose — see its declaration.
        // Whichever handler dismisses the modal is what releases it.
        closeModal = showServerDownModal({
          onStay: () => {
            closeModal = null;
            checking = false;
          },
          onContinueAnyway: () => {
            closeModal = null;
            checking = false;
            doSubmit();
          },
        });
      } catch (err) {
        // `isForumReachable` never rejects, but `requestSubmit` and building the modal
        // can. Leaving `checking` stuck true would wedge the composer for the rest of
        // the page's life — with the submit already prevented — so release it and let
        // the next attempt through.
        checking = false;
        error('exit-guard: pre-send check failed; the message was not sent', err);
      }
    };

    // `onSubmit` is async, so a throw inside it becomes an unhandled rejection that
    // nobody sees. It handles its own failures; this is the backstop that keeps one
    // from escaping into the console as a bare promise.
    const onSubmitListener = (event: SubmitEvent) => {
      void onSubmit(event).catch((err) => {
        error('exit-guard: submit handler failed', err);
      });
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('submit', onSubmitListener, true);
    log('exit-guard: listeners attached (beforeunload + submit)');

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('submit', onSubmitListener, true);
      closeModal?.();
      closeModal = null;
    };
  },
} satisfies Feature;
