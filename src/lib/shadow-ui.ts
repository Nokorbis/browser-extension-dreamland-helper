/**
 * A tiny kit for the extension's **vanilla** in-page controls — the ones built
 * straight from DOM nodes and styled through the `.style` property rather than
 * with Svelte (docs/adr/0016 keeps small, static UI out of the shadow-root Svelte
 * path). `exit-guard`'s server-down modal and the `highlight` toolbar/clear
 * control share this, so the shadow-host boilerplate, the max z-index, the font
 * stack, and the themed chrome palette live in one place.
 *
 * Everything here styles through `.style` / `attachShadow` and never injects a
 * `<style>` tag, so a page `style-src` CSP can't strip it (docs/adr/0011).
 */

/** The maximum 32-bit z-index, so an overlay sits above any forum chrome. */
export const MAX_Z = '2147483647';

/** The UI font stack shared by every injected control. */
export const SYSTEM_FONT = 'system-ui,-apple-system,sans-serif';

/** Set inline styles via `.style` (CSP-safe, unlike an injected `<style>`). */
export function styled<T extends HTMLElement>(el: T, css: string): T {
  el.style.cssText = css;
  return el;
}

/**
 * A fresh Shadow DOM host fenced off from phpBB's CSS (`all:initial`), plus its
 * open shadow root. Append the host to `document.body` once its subtree is built.
 */
export function createShadowHost(): { host: HTMLElement; shadow: ShadowRoot } {
  const host = styled(document.createElement('div'), 'all:initial');
  const shadow = host.attachShadow({ mode: 'open' });
  return { host, shadow };
}

/**
 * The chrome palette for an injected control, mirroring the `--dlh-*` custom
 * properties in `src/lib/palette.css`. Vanilla `.style` controls can't read
 * those CSS variables, so the subset they need is kept here as the single JS
 * source — keep the two in step when either changes.
 *
 * ⚠ That obligation is manual and nothing tests it: these values and the CSS ones are
 * two hand-maintained copies of the same palette. Changing one and not the other shows
 * up only as an injected control that no longer matches the panel beside it.
 */
export interface Chrome {
  surface: string;
  fg: string;
  muted: string;
  border: string;
  hover: string;
  shadow: string;
}

const LIGHT: Chrome = {
  surface: '#ffffff',
  fg: '#1c1f26',
  muted: '#5a6170',
  border: '#b9cfe4',
  hover: '#dce9f7',
  shadow: 'rgba(20,40,70,0.22)',
};

const DARK: Chrome = {
  surface: '#252a33',
  fg: '#e6e9ef',
  muted: '#a0a7b5',
  border: '#3a4150',
  hover: '#333947',
  shadow: 'rgba(0,0,0,0.45)',
};

/** The chrome palette for the forum's current theme. */
export function chromeFor(dark: boolean): Chrome {
  return dark ? DARK : LIGHT;
}
