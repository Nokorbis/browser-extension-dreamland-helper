import type { ContentScriptContext } from '#imports';
import type { Feature } from './types';
import { loadSettings } from '@/lib/storage';
import { error } from '@/lib/log';

import { exitGuard } from './exit-guard';
import { highlight } from './highlight';
import { bbcodePresets } from './bbcode-presets';
import { colorGrab } from './color-grab';
import { editorShortcuts } from './editor-shortcuts';
import { emojiPicker } from './emoji-picker';
import { composerLayout } from './composer-layout';

/**
 * The single list of all features — both the content script (to boot them) and the popup (to
 * list them) read this array, and nothing else enumerates features.
 *
 * `as const satisfies readonly Feature[]` rather than `: Feature[]` so the ids' literal
 * types survive, which is what lets `FeatureId` be a union instead of `string`.
 */
export const ALL_FEATURES = [
  exitGuard,
  editorShortcuts,
  bbcodePresets,
  emojiPicker,
  colorGrab,
  highlight,
  composerLayout,
] as const satisfies readonly Feature[];

/**
 * Every shipped feature's id, as a union. This is what makes forgetting to add an id to
 * `DEFAULT_SETTINGS.features` a compile error: with `id` typed as a bare `string` the
 * feature type-checked, built, shipped, and never booted, with nothing reported anywhere.
 */
export type FeatureId = (typeof ALL_FEATURES)[number]['id'];

/**
 * Cleanups are tied to the content-script context, so they run on nav/HMR invalidation.
 * A crash in one feature is logged and never blocks the others.
 */
export async function bootFeatures(scriptCtx: ContentScriptContext): Promise<void> {
  const settings = await loadSettings();

  for (const feature of ALL_FEATURES) {
    if (!settings.features[feature.id]) continue;
    try {
      const cleanup = feature.setup({ scriptCtx });
      if (cleanup) scriptCtx.onInvalidated(cleanup);
    } catch (err) {
      error(`feature "${feature.id}" failed to start`, err);
    }
  }
}
