import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// Vitest config — https://vitest.dev/config/
//
// Tests cover the extension's *pure* logic only: the preset template engine
// (`src/features/bbcode-presets/template.ts`) and the preset store's tree
// invariants (`src/lib/presets.ts`). Everything else in this codebase is DOM /
// browser glue that is cheaper to verify by hand in a real forum page — see
// docs/adr/0015-preset-placeholder-syntax.md for why these two earn tests.
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
