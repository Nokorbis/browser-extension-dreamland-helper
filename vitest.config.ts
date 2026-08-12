import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// Vitest config — https://vitest.dev/config/
//
// Tests cover the extension's *pure* logic only. Everything else in this codebase is
// DOM / browser glue that is cheaper to verify by hand in a real forum page — see
// docs/adr/0015-preset-placeholder-syntax.md for why the covered parts earn tests.
//
// The list of what that currently amounts to lives in CLAUDE.md, next to the rule it
// follows from. It is deliberately not repeated here: an enumeration in two places is an
// enumeration that goes stale in one, which is exactly what happened to this comment.
//
// Note there is deliberately no `environment` here: the suite runs on plain
// node. Anything needing a DOM belongs on the hand-verified side of that line.
//
// `WxtVitest()` wires up WXT's aliases (`@/`, `#imports`, `#i18n`) and mocks the
// extension APIs, so a test can import project modules exactly as the app does.
// It reads wxt.config.ts, hence the top-level await.
export default defineConfig({
  plugins: [await WxtVitest()],
  test: {
    // No `globals: true` on purpose: tests import { describe, it, expect } from
    // 'vitest' explicitly, so tsconfig.json stays a bare `extends` of the
    // generated .wxt config. `.wxt/tsconfig.json` includes `../**/*`, so
    // `pnpm check` already type-checks these test files.
    include: ['src/**/*.test.ts'],
  },
});
