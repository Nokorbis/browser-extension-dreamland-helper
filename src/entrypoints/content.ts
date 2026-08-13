import { defineContentScript } from '#imports';
import { FORUM_MATCHES } from '@/lib/phpbb';
import { bootFeatures } from '@/features/registry';
import { log } from '@/lib/log';

/**
 * The one content script. It does no feature work itself — it boots the registry once the
 * page is idle. All behaviour lives in `src/features/*`.
 */
export default defineContentScript({
  matches: FORUM_MATCHES,
  runAt: 'document_idle',
  // Component styles go to `createShadowRootUi`, which injects them inside each shadow
  // root rather than the page, and puts the built CSS in `web_accessible_resources` so
  // the UI can fetch it. See docs/adr/0016.
  cssInjectionMode: 'ui',
  main(ctx) {
    log('content script booted at', location.href);
    void bootFeatures(ctx);
  },
});
