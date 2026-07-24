import type { ContentScriptContext } from '#imports';
import type { Feature } from './types';
import { loadSettings } from '@/lib/storage';
import { error } from '@/lib/log';

import { exitGuard } from './exit-guard';
import { highlight } from './highlight';
import { bbcodePresets } from './bbcode-presets';
import { colorGrab } from './color-grab';
import { editorShortcuts } from './editor-shortcuts';

/**
 * The single list of all features. Registering a new feature = add its folder
 * under `src/features/`, then add it here. Both the content script (to boot
 * them) and the popup (to list them) read this array — nothing else enumerates
 * features.
 */
export const ALL_FEATURES: Feature[] = [
  exitGuard,
  editorShortcuts,
  bbcodePresets,
  colorGrab,
  highlight,
];

/**
 * Start every enabled feature on the current forum page. Cleanup functions are
 * tied to the content-script context so they run on nav/HMR invalidation.
 * A crash in one feature is logged and never blocks the others.
 */
export async function bootFeatures(
  scriptCtx: ContentScriptContext,
): Promise<void> {
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
