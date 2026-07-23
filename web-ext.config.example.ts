import { defineWebExtConfig } from 'wxt';
import { resolve } from 'node:path';

// Template — copy to `web-ext.config.ts` (gitignored) and set the browser path
// for YOUR machine:  cp web-ext.config.example.ts web-ext.config.ts
//
// `pnpm dev` launches a browser via chrome-launcher, which only auto-detects
// standard Chrome/Chromium installs. If you run Brave, Vivaldi, or a Chromium
// in a non-standard location, point it here. Firefox (`pnpm dev:firefox`) is
// usually found on PATH and needs no config.
//
// The CHROME_PATH env var overrides this per-run, e.g.
//   CHROME_PATH=/path/to/chromium pnpm dev
export default defineWebExtConfig({
  binaries: {
    // Pick the one that matches your machine (or set your own path):
    chrome: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
    // Linux:   '/usr/bin/brave'  |  '/usr/bin/chromium'  |  '/usr/bin/vivaldi'
    // macOS:   '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    // Windows: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'

    // firefox: '/usr/bin/firefox',  // only if it isn't on your PATH
  },

  // Persistent, isolated dev profile. By default web-ext wipes the browser's
  // profile on exit, so it forgets your forum login/history every run. This
  // keeps a dedicated profile under .wxt/ (gitignored), separate from your real
  // browser. Delete these three lines if you'd rather start fresh each run.
  keepProfileChanges: true,
  chromiumProfile: resolve('.wxt/chrome-data'),
  firefoxProfile: resolve('.wxt/firefox-data'),
});
