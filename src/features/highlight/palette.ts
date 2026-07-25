/**
 * The fixed set of highlight colours the selection toolbar offers.
 *
 * The *stored* value of a highlight is its hex (`Highlight.color`), and the
 * renderer paints any hex it's handed — so this list is only what the toolbar
 * shows, not a constraint on what can be rendered. Each colour's human name is
 * resolved from `features.highlight.colors.<id>` in the locale catalogue (used
 * for the swatch tooltip / aria-label), so `id`s must stay camelCase-safe.
 *
 * The colours are light pastels chosen to stay legible under both forum themes
 * when painted behind the forced-dark highlight text colour below.
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
 * Text colour painted over a highlight. Forced dark so the pastel backgrounds
 * stay readable whatever colour the forum gives the post text, in either theme.
 */
export const HIGHLIGHT_TEXT_COLOR = '#1a1a1a';

/**
 * The `CSS.highlights` registry name / `::highlight()` custom-ident for a hex.
 * Deterministic so the same colour always maps to the same registry slot.
 */
export function highlightRegistryName(hex: string): string {
  return `dlh-hl-${hex.replace(/[^0-9a-f]/gi, '').toLowerCase()}`;
}
