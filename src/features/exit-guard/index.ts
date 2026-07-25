import { i18n } from '#i18n';
import type { Feature } from '../types';
import { findMessageTextarea, findPostForm, findSubmitButton } from '@/lib/phpbb';
import { isForumReachable } from '@/lib/reachability';
import { log } from '@/lib/log';
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
 *    docs/adr/0011-presend-server-reachability-check.md and
 *    docs/adr/0021-guard-preview-and-draft-submits.md.
 */
export const exitGuard: Feature = {
  id: 'exit-guard',
  name: i18n.t('features.exitGuard.name'),
  description: i18n.t('features.exitGuard.description'),
  implemented: true,

  setup() {
    // Set while we drive a genuine, checked submission, so the beforeunload
    // guard below doesn't also prompt on the resulting navigation.
    let isSubmitting = false;
    // One-shot: the next submit event is our own re-submit — let it pass.
    let bypass = false;
    // A reachability check / modal is already in flight; ignore repeat submits.
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
      log(`submit intercepted (submitter=${submitterName ?? 'none'}) — pinging server`);
      if (checking) return;
      checking = true;

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
          doSubmit();
          return;
        }
        log('server unreachable — showing modal');
        closeModal = showServerDownModal({
          onStay: () => {
            closeModal = null;
          },
          onContinueAnyway: () => {
            closeModal = null;
            doSubmit();
          },
        });
      } finally {
        checking = false;
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('submit', onSubmit, true);
    log('exit-guard: listeners attached (beforeunload + submit)');

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('submit', onSubmit, true);
      closeModal?.();
    };
  },
};
