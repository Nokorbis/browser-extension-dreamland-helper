import { defineWebExtConfig } from 'wxt';
import { resolve } from 'node:path';

// Template — copy to `web-ext.config.ts` (gitignored) and set the browser path
// for YOUR machine:  cp web-ext.config.example.ts web-ext.config.ts
//
// `pnpm dev` launches a browser via chrome-launcher, which only auto-detects
// standard Chrome/Chromium installs. If you run Brave, Vivaldi, or a Chromium
// in a non-standard location, point it here. `pnpm dev:firefox` looks for a
// `firefox` binary on PATH; if you don't have one — or you run a Gecko fork
// like Waterfox / LibreWolf / Floorp — set `firefox` below (forks work with
// web-ext's firefox-desktop target).
//
// The CHROME_PATH / FIREFOX_PATH env vars override these per-run, e.g.
//   CHROME_PATH=/path/to/chromium pnpm dev
export default defineWebExtConfig({
  binaries: {
    // Pick the one that matches your machine (or set your own path):
    chrome: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
    // Linux:   '/usr/bin/brave'  |  '/usr/bin/chromium'  |  '/usr/bin/vivaldi'
    // macOS:   '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    // Windows: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'

    // Only if `firefox` isn't on your PATH, or to use a Gecko fork:
    // firefox: process.env.FIREFOX_PATH ?? '/usr/bin/waterfox',
    // Forks: '/usr/bin/librewolf' | '/usr/bin/floorp' | '/usr/bin/waterfox'
  },

  // Persistent, isolated dev profile. By default web-ext wipes the browser's
  // profile on exit, so it forgets your forum login/history every run. This
  // keeps a dedicated profile under .wxt/ (gitignored), separate from your real
  // browser. Delete these three lines if you'd rather start fresh each run.
  //
  // GOTCHA: with keepProfileChanges, the Firefox profile dir must already exist
  // — web-ext auto-creates the Chromium one but NOT the Firefox one, failing
  // with "…cannot be resolved to a profile path". Create it once (empty is
  // fine; Firefox populates it on first launch):  mkdir -p .wxt/firefox-data
  keepProfileChanges: true,
  chromiumProfile: resolve('.wxt/chrome-data'),
  firefoxProfile: resolve('.wxt/firefox-data'),
});
