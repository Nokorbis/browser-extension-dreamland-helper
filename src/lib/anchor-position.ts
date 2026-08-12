/**
 * Where a floating surface goes relative to the thing it hangs off.
 *
 * Two surfaces need this and had grown their own answer: `@/lib/popover` (the presets
 * menu and the emoji panel) and `highlight/toolbar.ts` (the swatch bar above a
 * selection). Both did "place below, flip above if there is no room, clamp horizontally"
 * — with different gaps, and one of them flipped upwards without first checking there was
 * any more room up there. One implementation reconciles them.
 *
 * It is pure arithmetic on plain numbers: no `getBoundingClientRect`, no `style`, no DOM
 * at all. That is deliberate and is the same split as `planInsertion` / `insertAtRange`
 * in `@/lib/textarea` — the caller measures, calls this, and assigns. It is what makes
 * the geometry testable in a suite that has no DOM (docs/adr/0023).
 */

/** The measured box of the element the surface hangs off, in viewport coordinates. */
export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

/**
 * The surface's own rendered size.
 *
 * Both are `0` until the framework has drawn it, which every caller hits on first open.
 * That case is handled rather than guarded against: a zero dimension simply opts out of
 * the adjustment that would need it, and the caller re-measures on the next frame.
 */
export interface SurfaceSize {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PlacementOptions {
  /** Gap between anchor and surface, and the surface's minimum margin from an edge. */
  gap: number;
  /**
   * `left` aligns the surface's left edge with the anchor's (a dropdown under its
   * button); `center` centres it on the anchor (a toolbar over a text selection).
   */
  align: 'left' | 'center';
  /**
   * Which side the surface prefers. A dropdown hangs `below` its trigger; the highlight
   * toolbar sits `above` the selection, so it doesn't cover the text being read. Under
   * `fit` either will flip to the other side rather than leave the viewport.
   */
  side: 'below' | 'above';
  /**
   * Keep the surface inside the viewport: flip to the other side when the preferred one
   * would overflow, and clamp horizontally. Off for the presets menu, whose toolbar sits
   * near the top of the page and which has never needed either — turning it on there
   * would change long-settled behaviour for no reported problem.
   */
  fit: boolean;
}

/** Clamp `value` into `[min, max]`, tolerating an inverted range by preferring `min`. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * Viewport coordinates for a surface anchored to `anchor`.
 *
 * Unfitted, this just places the surface `gap` away on its preferred `side`, aligned per
 * `align`.
 *
 * With `fit`, two independent adjustments apply:
 *
 * - **Flip.** If the preferred side would push the surface out of the viewport, and the
 *   *other* side has genuine room for it, it moves there. Both halves matter: falling off
 *   the top is no better than falling off the bottom, so a surface too tall for either
 *   side stays where it was asked to go, where at least its near edge is readable. (The
 *   highlight toolbar previously flipped down whenever it didn't fit above, without
 *   checking down was any better. This is the stricter rule, applied to both surfaces.)
 * - **Clamp.** The left edge is pulled back inside `[gap, width - surface - gap]`. On a
 *   viewport narrower than the surface that range inverts and `gap` wins — the surface
 *   overflows to the right, the readable direction in a left-to-right layout.
 *
 * Each adjustment needs the corresponding surface dimension, so a `0` skips it and leaves
 * the unfitted placement for the caller to re-measure.
 */
export function placeAnchored(
  anchor: AnchorRect,
  surface: SurfaceSize,
  viewport: Viewport,
  opts: PlacementOptions,
): { top: number; left: number } {
  const { gap, align, side, fit } = opts;

  const below = anchor.bottom + gap;
  const above = anchor.top - gap - surface.height;

  let top = side === 'above' ? above : below;
  let left =
    align === 'center' ? anchor.left + anchor.width / 2 - surface.width / 2 : anchor.left;

  if (fit) {
    if (surface.height > 0) {
      if (side === 'below' && below + surface.height > viewport.height && above >= gap) {
        top = above;
      } else if (
        side === 'above' &&
        above < gap &&
        below + surface.height <= viewport.height
      ) {
        top = below;
      }
    }
    if (surface.width > 0) {
      left = clamp(left, gap, viewport.width - surface.width - gap);
    }
  }

  return { top, left };
}
