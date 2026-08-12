import type { Component } from 'svelte';
import BbcodePresetsPanel from '@/features/bbcode-presets/PopupPanel.svelte';
import ExitGuardPanel from '@/features/exit-guard/PopupPanel.svelte';
import HighlightPanel from '@/features/highlight/PopupPanel.svelte';

/**
 * Feature id → the settings panel rendered inside that feature's accordion row.
 *
 * Deliberately **partial**: a feature with no entry simply has no panel and
 * keeps the plain toggle row. So this never becomes a second list of features —
 * `ALL_FEATURES` in `@/features/registry` remains the one *enumeration*, and this
 * is only a *lookup*. A missing or stale entry degrades to "no panel", never to
 * "feature invisible".
 *
 * Why this lives popup-side instead of as a `popupPanel` field on `Feature`:
 * `src/features/*` is in the content script's module graph, and WXT builds
 * content scripts as a single IIFE — which forces Rollup to inline dynamic
 * imports. A Svelte component referenced from a feature module would therefore
 * land in `content.js` whether the reference were eager *or* lazy. Keeping the
 * wiring here is what stops the popup's UI leaking into every forum page.
 * See docs/adr/0014-popup-accordion-options-page.md.
 */
export const POPUP_PANELS: Partial<Record<string, Component>> = {
  'exit-guard': ExitGuardPanel,
  'bbcode-presets': BbcodePresetsPanel,
  highlight: HighlightPanel,
};
