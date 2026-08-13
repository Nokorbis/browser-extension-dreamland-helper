/**
 * Painting with the **CSS Custom Highlight API**, so nothing in phpBB's post DOM is ever
 * mutated. One `Highlight` per distinct colour in the document registry, plus one page-level
 * `<style>` holding a `::highlight()` rule per colour; rebuilding on a store change swaps
 * the ranges and regenerates the rules. Teardown deletes exactly the entries we own — never
 * `CSS.highlights.clear()`, which would wipe another script's.
 *
 * ⚠ The `<style>` must be page-level: `::highlight()` needs its rule in a stylesheet the
 * page's own style engine sees, so it cannot live in a shadow root. A content-script
 * `<style>` in `document.head` is CSP-safe on this forum (docs/adr/0016).
 *
 * Requires Firefox 140+ / Chrome 105+; older browsers no-op via `isHighlightApiSupported`.
 */
import { HIGHLIGHT_COLORS, HIGHLIGHT_TEXT_COLOR, highlightRegistryName } from './palette';

/** Whether this browser can paint via the CSS Custom Highlight API. */
export function isHighlightApiSupported(): boolean {
  return (
    typeof Highlight !== 'undefined' &&
    typeof CSS !== 'undefined' &&
    CSS !== null &&
    'highlights' in CSS &&
    CSS.highlights !== undefined
  );
}

/** Marks our page-level stylesheet so a re-run can find and replace it. */
const STYLE_ID = 'dlh-highlight-styles';

export class HighlightRenderer {
  /** Registry names we've claimed, so `clear()` removes only ours. */
  private owned = new Set<string>();
  private style: HTMLStyleElement | null = null;

  /** Replace all painted highlights with `byColor` (hex → the ranges to paint). */
  setRanges(byColor: Map<string, Range[]>): void {
    if (!isHighlightApiSupported()) return;

    // Register / update one Highlight per colour; drop colours that went empty.
    const live = new Set<string>();
    for (const [hex, ranges] of byColor) {
      const name = highlightRegistryName(hex);
      if (ranges.length === 0) continue;
      CSS.highlights.set(name, new Highlight(...ranges));
      this.owned.add(name);
      live.add(name);
    }
    for (const name of this.owned) {
      if (!live.has(name)) {
        CSS.highlights.delete(name);
        this.owned.delete(name);
      }
    }

    this.ensureStyle(byColor.keys());
  }

  /** Remove every highlight and the stylesheet. Idempotent. */
  clear(): void {
    if (isHighlightApiSupported()) {
      for (const name of this.owned) CSS.highlights.delete(name);
    }
    this.owned.clear();
    this.style?.remove();
    this.style = null;
  }

  /**
   * Covers the fixed palette plus any hex currently painted, so a stored colour outside
   * the palette still renders.
   */
  private ensureStyle(paintedHexes: Iterable<string>): void {
    const hexes = new Set<string>(HIGHLIGHT_COLORS.map((c) => c.hex));
    for (const hex of paintedHexes) hexes.add(hex);

    const rules = [...hexes]
      .map(
        (hex) =>
          `::highlight(${highlightRegistryName(hex)}){background-color:${hex};color:${HIGHLIGHT_TEXT_COLOR};}`,
      )
      .join('\n');

    if (this.style === null) {
      // Reuse a stale element from a previous run if one somehow survived.
      const existing = document.getElementById(STYLE_ID);
      if (existing instanceof HTMLStyleElement) {
        this.style = existing;
      } else {
        this.style = document.createElement('style');
        this.style.id = STYLE_ID;
        (document.head ?? document.documentElement).append(this.style);
      }
    }
    this.style.textContent = rules;
  }
}
