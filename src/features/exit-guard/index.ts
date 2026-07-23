import type { Feature } from '../types';
import { findMessageTextarea } from '@/lib/phpbb';

/**
 * Feature #1 — Exit guard.
 *
 * Prevents accidental loss of a draft. While the post editor holds text that
 * differs from what it loaded with, leaving the page (back button, closing the
 * tab, following a link) triggers the browser's native "Leave site?" prompt.
 *
 * `beforeunload` is the only cross-browser hook that can veto navigation,
 * including the back button. Browsers deliberately ignore custom messages here,
 * so the wording is the browser's own — we only decide whether to prompt.
 */
export const exitGuard: Feature = {
  id: 'exit-guard',
  name: 'Exit guard',
  description: 'Warn before leaving a post editor that has unsaved text.',
  implemented: true,

  setup() {
    const handler = (event: BeforeUnloadEvent) => {
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

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  },
};
