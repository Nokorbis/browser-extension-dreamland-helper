/**
 * A kit for the extension's **vanilla** in-page controls — built from DOM nodes and styled
 * through `.style` rather than with Svelte (docs/adr/0016 keeps small, static UI out of the
 * shadow-root Svelte path).
 *
 * Everything here styles through `.style` / `attachShadow` and never injects a `<style>`
 * tag, so a page `style-src` CSP can't strip it (docs/adr/0011).
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
 * Mirrors the `--dlh-*` custom properties in `src/lib/palette.css`, which vanilla `.style`
 * controls cannot read.
 *
 * ⚠ Two hand-maintained copies of one palette, and nothing tests that they agree: changing
 * one and not the other shows up only as an injected control that no longer matches the
 * panel beside it.
 */
export interface Chrome {
  surface: string;
  fg: string;
  muted: string;
  border: string;
  hover: string;
  shadow: string;
  /**
   * The "look before you act" family, mirroring `--dlh-warn-*`. Amber rather than red: a
   * surface wearing it is not reporting an error, it is asking to be read before something
   * is confirmed — the draft-recovery bar being the case it was added for.
   */
  warnBg: string;
  warnFg: string;
  warnBorder: string;
}

const LIGHT: Chrome = {
  surface: '#ffffff',
  fg: '#1c1f26',
  muted: '#5a6170',
  border: '#b9cfe4',
  hover: '#dce9f7',
  shadow: 'rgba(20,40,70,0.22)',
  warnBg: '#fdf6e6',
  warnFg: '#8a5a12',
  warnBorder: '#e6cf9a',
};

const DARK: Chrome = {
  surface: '#252a33',
  fg: '#e6e9ef',
  muted: '#a0a7b5',
  border: '#3a4150',
  hover: '#333947',
  shadow: 'rgba(0,0,0,0.45)',
  warnBg: '#2e2718',
  warnFg: '#e0b273',
  warnBorder: '#5c4a26',
};

/** The chrome palette for the forum's current theme. */
export function chromeFor(dark: boolean): Chrome {
  return dark ? DARK : LIGHT;
}

/** A control's current palette, repainted on a theme flip. */
export interface Themed {
  /** The palette to read while building or painting a node. */
  chrome: () => Chrome;
  /** Register the control's paint and run it now, once its nodes exist. */
  paints: (paint: (chrome: Chrome) => void) => void;
  /** Swap the palette and repaint. Wire it to `followTheme` in `@/lib/phpbb`. */
  setDark: (dark: boolean) => void;
}

/**
 * Holds the palette for a vanilla control and repaints it on a theme flip, so each control
 * keeps only its own `paint` body.
 *
 * Created *before* the nodes it paints — the buttons read `chrome()` while being built — and
 * handed the paint afterwards through `paints`. Starts on the light palette, as the
 * hand-written copies did; the feature calls `setDark` with the real theme right after.
 */
export function themed(): Themed {
  let chrome = chromeFor(false);
  let paint: (chrome: Chrome) => void = () => undefined;
  return {
    chrome: () => chrome,
    paints(next) {
      paint = next;
      paint(chrome);
    },
    setDark(dark) {
      chrome = chromeFor(dark);
      paint(chrome);
    },
  };
}

/** A text button that lifts on hover. Its resting background is repainted by the caller. */
export interface HoverButtonOptions {
  text: string;
  /** Extra `.style` on top of the shared base. */
  css: string;
  /** The background it returns to — re-read on every leave, so a theme flip is picked up. */
  rest: () => string;
  hover: () => string;
  onClick: () => void;
}

/**
 * ⚠ Always `type="button"` with no `name`: these surfaces mount inside `<form id="postform">`,
 * where either would fire a submit `exit-guard` reads as a genuine post and **send the
 * half-written message**. Same reason as `createFormatButton` in `@/lib/phpbb`.
 */
export function mkHoverButton(opts: HoverButtonOptions): HTMLButtonElement {
  const btn = styled(
    document.createElement('button'),
    'cursor:pointer;font:inherit;' + opts.css,
  );
  btn.type = 'button';
  btn.textContent = opts.text;
  btn.addEventListener('click', opts.onClick);
  btn.addEventListener('mouseenter', () => {
    btn.style.background = opts.hover();
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = opts.rest();
  });
  return btn;
}
