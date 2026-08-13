/**
 * Where a floating surface goes relative to the thing it hangs off, shared by `@/lib/popover`
 * and `@/lib/selection-toolbar`.
 *
 * Pure arithmetic on plain numbers — no `getBoundingClientRect`, no `style`, no DOM. Same
 * split as `planInsertion` / `insertAtRange`: the caller measures, calls this, and assigns.
 * That is what makes the geometry testable in a suite with no DOM (docs/adr/0023).
 */

/** The measured box of the element the surface hangs off, in viewport coordinates. */
export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

/**
 * Both are `0` until the framework has drawn the surface, which every caller hits on first
 * open. Handled rather than guarded against: a zero dimension opts out of the adjustment
 * that would need it, and the caller re-measures on the next frame.
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
   * A dropdown hangs `below` its trigger; the selection toolbar sits `above`, so it doesn't
   * cover the text being read. Under `fit` either may flip rather than leave the viewport.
   */
  side: 'below' | 'above';
  /**
   * Flip when the preferred side would overflow, and clamp horizontally. Off for the presets
   * menu, whose toolbar sits near the top of the page and has never needed either.
   */
  fit: boolean;
}

/** Clamp `value` into `[min, max]`, tolerating an inverted range by preferring `min`. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * Unfitted, places the surface `gap` away on its preferred `side`. With `fit`, two
 * independent adjustments apply, each needing the matching surface dimension — a `0` skips
 * it and leaves the unfitted placement for the caller to re-measure:
 *
 * - **Flip**, only when the preferred side would overflow *and* the other side has genuine
 *   room. Both halves matter: falling off the top is no better than falling off the bottom,
 *   so a surface too tall for either side stays where it was asked to go, near edge readable.
 * - **Clamp** the left edge into `[gap, width - surface - gap]`. On a viewport narrower than
 *   the surface that range inverts and `gap` wins, overflowing right — the readable
 *   direction in a left-to-right layout.
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
