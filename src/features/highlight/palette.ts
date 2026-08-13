/**
 * The fixed set the selection toolbar offers. A highlight *stores* its hex and the renderer
 * paints any hex it is handed, so this is only what the toolbar shows, not a constraint on
 * what can render. Each name resolves from `features.highlight.colors.<id>`, so ids must
 * stay camelCase-safe.
 *
 * Light pastels, chosen to stay legible under both forum themes behind the forced-dark
 * highlight text colour below.
 */

export interface HighlightColor {
  /** Locale key segment and stable identity. */
  id: string;
  /** Canonical `#rrggbb`. */
  hex: string;
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { id: 'yellow', hex: '#ffe86b' },
  { id: 'green', hex: '#b6f2b0' },
  { id: 'pink', hex: '#ffc0e0' },
  { id: 'blue', hex: '#a9d8ff' },
];

/**
 * Forced dark, so the pastel backgrounds stay readable whatever colour the forum gives the
 * post text, in either theme.
 */
export const HIGHLIGHT_TEXT_COLOR = '#1a1a1a';

/** Deterministic, so the same colour always maps to the same registry slot. */
export function highlightRegistryName(hex: string): string {
  return `dlh-hl-${hex.replace(/[^0-9a-f]/gi, '').toLowerCase()}`;
}
