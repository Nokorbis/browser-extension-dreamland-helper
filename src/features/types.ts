import type { ContentScriptContext } from '#imports';

/** Everything a feature is handed at startup. Grow it as features need shared services. */
export interface FeatureContext {
  scriptCtx: ContentScriptContext;
}

/**
 * A self-contained writing aid: its own folder under `src/features/`, registered in
 * `registry.ts`. The content script boots the enabled ones; the popup lists them.
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
   * Returns an optional cleanup, which runs when the content-script context is
   * invalidated (SPA nav / HMR).
   */
  setup(ctx: FeatureContext): void | (() => void);
}
