import { defineConfig } from 'wxt';

// WXT config — https://wxt.dev/api/config.html
// One codebase → Chrome/Brave (MV3) and Firefox (MV2) builds. See docs/adr/0002.
//   pnpm dev            → Chromium (Brave) dev with HMR
//   pnpm dev:firefox    → Firefox dev with HMR
//   pnpm build[:firefox]→ production build in .output/<target>
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],

  // Explicit ES imports everywhere — no auto-import "magic".
  // WXT APIs (defineContentScript, browser, storage, ...) come from '#imports'.
  imports: false,

  manifest: {
    name: 'Dreamland Helper',
    // The RP forum this extension targets. Content scripts run here, and this is
    // the store-review-visible permission — keep it narrow.
    host_permissions: ['*://*.dreamland-reborn.net/*'],
    permissions: ['storage'],
    // Firefox reads this; Chrome ignores it harmlessly. The id is required for
    // signing on AMO; data_collection declares we collect nothing.
    browser_specific_settings: {
      gecko: {
        id: 'dreamland-helper@dreamland-reborn.net',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
