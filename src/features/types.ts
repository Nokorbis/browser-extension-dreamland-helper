import type { ContentScriptContext } from '#imports';

/**
 * Everything a feature is handed when it starts. Right now just the WXT
 * content-script context (page lifecycle, `ctx.onInvalidated`, safe timers,
 * etc.); grow this as features need more shared services.
 */
export interface FeatureContext {
  scriptCtx: ContentScriptContext;
}

/**
 * A self-contained writing aid. Each feature lives in its own folder under
 * `src/features/` and is registered in `registry.ts`. The content script boots
 * every enabled feature on a forum page; the popup lists them for toggling.
 */
export interface Feature {
  /** Stable id — used as the settings key. Never rename once shipped. */
  id: string;
  /** Human label shown in the popup — resolved from `src/locales/` via `i18n.t`. */
  name: string;
  /** One-line description shown in the popup — resolved from `src/locales/` via `i18n.t`. */
  description: string;
  /** False while the feature is still a stub (hidden/disabled by default). */
  implemented: boolean;
  /**
   * Start the feature on the current page. Return an optional cleanup function;
   * it runs when the content-script context is invalidated (SPA nav / HMR).
   */
  setup(ctx: FeatureContext): void | (() => void);
}
