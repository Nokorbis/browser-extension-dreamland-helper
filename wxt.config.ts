import { defineConfig } from 'wxt';

// WXT config — https://wxt.dev/api/config.html
// One codebase → Chrome/Brave (MV3) and Firefox (MV2) builds. See docs/adr/0002.
//   pnpm dev            → Chromium (Brave) dev with HMR
//   pnpm dev:firefox    → Firefox dev with HMR
//   pnpm build[:firefox]→ production build in .output/<target>
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte', '@wxt-dev/i18n/module'],

  // Explicit ES imports everywhere — no auto-import "magic".
  // WXT APIs (defineContentScript, browser, storage, ...) come from '#imports'.
  imports: false,

  manifest: {
    // French-only audience — see docs/adr/0009. The user-facing name & description live in
    // src/locales/fr.yml; __MSG_extName__/__MSG_extDescription__ resolve at runtime from the
    // compiled _locales/fr. This name shows in the browser and on the AMO listing; the add-on
    // is identified by the gecko id below, not the name, so it's safe to change.
    name: '__MSG_extName__',
    default_locale: 'fr',
    description: '__MSG_extDescription__',
    // The RP forum this extension targets. Content scripts run here, and this is
    // the store-review-visible permission — keep it narrow.
    host_permissions: ['*://*.dreamland-reborn.net/*'],
    permissions: ['storage'],
    // The emoji picker's dataset is fetched from the extension at runtime
    // instead of being bundled into the content script — see docs/adr/0022.
    // A content script's own `fetch` of a moz-/chrome-extension: URL is gated
    // on this list. Scoped to the forum so no other site can read it; WXT
    // rewrites the MV3 object form to MV2's bare array for the Firefox build.
    web_accessible_resources: [
      {
        resources: ['emoji/emoji.json'],
        matches: ['*://*.dreamland-reborn.net/*'],
      },
    ],
    // Firefox reads this; Chrome ignores it harmlessly. The id is required for
    // signing on AMO; data_collection declares we collect nothing. No
    // `update_url` here on purpose: the add-on is distributed listed on AMO,
    // which hosts and auto-updates it. See docs/adr/0010 and docs/PUBLISHING.md.
    browser_specific_settings: {
      gecko: {
        id: 'qol@dreamland-reborn.net',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
