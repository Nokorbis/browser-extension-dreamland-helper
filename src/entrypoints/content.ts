import { defineContentScript } from '#imports';
import { FORUM_MATCHES } from '@/lib/phpbb';
import { bootFeatures } from '@/features/registry';

/**
 * The one content script. It does no feature work itself — it just boots the
 * feature registry once the page is idle. All behaviour lives in
 * `src/features/*`; see `registry.ts`.
 */
export default defineContentScript({
  matches: FORUM_MATCHES,
  runAt: 'document_idle',
  main(ctx) {
    void bootFeatures(ctx);
  },
});
