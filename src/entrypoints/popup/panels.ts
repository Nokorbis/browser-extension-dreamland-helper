import type { Component } from 'svelte';
import BbcodePresetsPanel from '@/features/bbcode-presets/PopupPanel.svelte';
import ExitGuardPanel from '@/features/exit-guard/PopupPanel.svelte';
import HighlightPanel from '@/features/highlight/PopupPanel.svelte';

/**
 * Feature id → the settings panel inside that feature's accordion row. Deliberately
 * **partial**: a feature with no entry keeps the plain toggle row, so this is a *lookup* and
 * never a second enumeration of features. A missing entry degrades to "no panel", never to
 * "feature invisible".
 *
 * ⚠ Popup-side rather than a field on `Feature`: `src/features/*` is in the content script's
 * module graph, and WXT builds content scripts as a single IIFE, which forces Rollup to
 * inline dynamic imports. A Svelte component referenced from a feature module would land in
 * `content.js` whether the reference were eager *or* lazy. See docs/adr/0014.
 */
export const POPUP_PANELS: Partial<Record<string, Component>> = {
  'exit-guard': ExitGuardPanel,
  'bbcode-presets': BbcodePresetsPanel,
  highlight: HighlightPanel,
};
