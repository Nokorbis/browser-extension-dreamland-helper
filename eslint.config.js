// ESLint flat config.
//
// Scope is deliberately narrow: `pnpm check` (svelte-check) already owns type errors and
// Prettier owns layout, so this file only carries rules that catch a *class of defect*
// neither of those can see. Each one below earned its place by matching a real bug found
// in this codebase — see docs/adr/0024-lint-and-format-gate.md.
//
// `eslint-config-prettier` is last so it can switch off every stylistic rule that would
// otherwise fight the formatter.
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  {
    // Generated, vendored or captured — none of it is ours to lint.
    ignores: [
      '.wxt/**',
      '.output/**',
      'node_modules/**',
      'public/**',
      'real_snippets/**',
      'stats.html',
    ],
  },

  js.configs.recommended,
  // Type-aware: `no-floating-promises` and `no-unnecessary-type-assertion` need the
  // checker, and those two are half the reason this config exists.
  ts.configs.recommendedTypeChecked,
  svelte.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
      globals: { ...globals.browser },
    },
    rules: {
      // A dropped rejection is how the Firefox DataCloneError bug stayed invisible
      // through a release: the write failed, nothing caught it, and the UI reported
      // success anyway. `void` still marks a deliberate fire-and-forget.
      '@typescript-eslint/no-floating-promises': 'error',

      // `render()` referencing a `const` declared 60 lines below it works only by
      // accident of call order; reordering turns it into a TDZ ReferenceError.
      // Functions are exempt — hoisting makes those genuinely safe.
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': [
        'error',
        { functions: false, classes: false, variables: true },
      ],

      // `as` on a value read from storage asserts a shape nothing verified. Every store
      // here is supposed to go through a `normalize…` repair pass instead (ADR 0012).
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',

      // Off: it fires on any `new Set()` reachable from `$state`, but the codebase
      // reassigns collections rather than mutating them (`ImportModal`'s `toggle` builds
      // a fresh Set and assigns it), which is already reactive. Swapping in `SvelteSet`
      // to satisfy the rule would add a dependency on mutation semantics we don't use.
      'svelte/prefer-svelte-reactivity': 'off',

      // Unused args are usually a signature that drifted. `_`-prefixed opts out.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // `<script lang="ts">` and the `.svelte.ts` rune modules: svelte-eslint-parser
    // handles the markup, but it has to be told which parser to hand the script block
    // to, or every type annotation reads as a syntax error.
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },

  {
    // Node scripts and this config, not browser code. Plain JS outside the TS project,
    // so type-aware rules have no checker to consult and are switched off wholesale.
    files: ['**/*.js', '**/*.mjs'],
    extends: [ts.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },

  {
    // Node scripts and build config: top-level awaits and fire-and-forget are fine here.
    files: ['scripts/**', '*.config.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },

  {
    // The three wrappers in src/lib/log.ts are the only sanctioned console access;
    // everything else goes through them so every message carries the same prefix.
    files: ['src/**/*.ts', 'src/**/*.svelte'],
    ignores: ['src/lib/log.ts'],
    rules: { 'no-console': 'error' },
  },

  prettier,
);
