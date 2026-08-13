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
 * The single list of all features. Registering a new feature = add its folder
 * under `src/features/`, then add it here. Both the content script (to boot
 * them) and the popup (to list them) read this array — nothing else enumerates
 * features.
 *
 * `as const satisfies readonly Feature[]` rather than `: Feature[]`: the literal types of
 * the ids survive, which is what lets `FeatureId` below be a union instead of `string`.
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
 * Every shipped feature's id, as a union.
 *
 * This is what makes step 4 of CLAUDE.md's "Adding a feature" checklist — add the id to
 * `DEFAULT_SETTINGS.features` — a compile error rather than a silent failure. With `id`
 * typed as a bare `string`, forgetting it left the feature type-checking, building,
 * shipping, and never booting, with nothing reported anywhere.
 */
export type FeatureId = (typeof ALL_FEATURES)[number]['id'];

/**
 * Start every enabled feature on the current forum page. Cleanup functions are
 * tied to the content-script context so they run on nav/HMR invalidation.
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
