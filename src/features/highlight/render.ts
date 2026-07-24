/**
 * Painting highlights with the **CSS Custom Highlight API** — `CSS.highlights`
 * plus `::highlight()` — so nothing in phpBB's post DOM is ever mutated.
 *
 * The renderer keeps one `Highlight` object per distinct colour in the document
 * registry and one page-level `<style>` holding a `::highlight()` rule per
 * colour. Rebuilding on every store change is cheap: swap the ranges in each
 * registry entry, regenerate the rules, done. Teardown deletes exactly the
 * registry entries we own (never `CSS.highlights.clear()`, which would wipe
 * another script's) and removes the `<style>`.
 *
 * The `<style>` is a plain page-level element created by the content script; it
 * lives in the isolated world and is CSP-safe on this forum (docs/adr/0016).
 * `::highlight()` needs the rule in a stylesheet the page's style engine sees,
 * which a content-script-injected `<style>` in `document.head` satisfies.
 *
 * Requires Firefox 140+ / Chrome 105+; older browsers lack the API and the
 * feature no-ops (`isHighlightApiSupported`).
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
   * (Re)write the `::highlight()` rules. Covers the fixed palette plus any hex
   * currently painted (a stored colour outside the palette still renders).
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
