/**
 * The page-level stylesheet that lays the reply page out. It must be a `<style>` in `<head>`
 * — these rules style the *forum's own* elements, which nothing in a shadow root can reach;
 * an injected `<style>` is CSP-safe on this forum (docs/adr/0016).
 *
 * Every state is a class on the wrapper (or on `#topicreview`), so toggling a checkbox is a
 * class flip and never a re-layout in JS.
 */

/** Marks our stylesheet so a re-run finds and replaces it instead of stacking. */
const STYLE_ID = 'dlh-layout-styles';

/** The wrapper holding the two columns, and the columns themselves. */
export const COLS_CLASS = 'dlh-cols';
export const COL_CLASS = 'dlh-col';

/** State classes on the wrapper. */
export const REVERSE_CLASS = 'dlh-cols-reverse';
export const SIDE_CLASS = 'dlh-cols-side';
export const SIDE_LEFT_CLASS = 'dlh-cols-side-left';

/** State class on `#topicreview` itself — the oldest-first reading order. */
export const REVIEW_REVERSE_CLASS = 'dlh-review-reverse';

/**
 * The full-width layout. On our own element rather than `<html>`, where it would have to
 * relax the skin's `#wrap { max-width }` and widen the header, nav and footer with it: the
 * wrapper instead *breaks out* of the centred column with symmetric negative margins, so
 * nothing outside this feature's subtree is restyled.
 */
export const FULL_WIDTH_CLASS = 'dlh-cols-full';

/**
 * The viewport width the break-out measures against, kept up to date by the feature.
 *
 * ⚠ `100vw` is the obvious value and the wrong one: it **includes** the vertical scrollbar,
 * so a page that has one — every thread here — ends up wider than the window and grows a
 * horizontal scrollbar. Set from `documentElement.clientWidth`, which excludes it; `100vw`
 * stays as the fallback before the first measure.
 */
export const VIEWPORT_WIDTH_VAR = '--dlh-viewport-width';

/**
 * Below this, two columns stop being readable — the composer's toolbar alone needs most of
 * it — so side-by-side degrades to stacked while still honouring the reversed order.
 */
const NARROW_MAX_WIDTH = 900;

/**
 * The floor for the review's box when side by side: below it a short composer would squeeze
 * the review to a couple of lines. prosilver's own fixed height is 300px.
 */
const MIN_REVIEW_HEIGHT = 320;

const CSS = `
.${COLS_CLASS} { display: flex; flex-direction: column; align-items: stretch; }
.${COLS_CLASS}.${REVERSE_CLASS} { flex-direction: column-reverse; }

/* Side by side. DOM order is [composer, review], so \`row-reverse\` is the
   composer on the right and \`row\` the composer on the left. */
.${COLS_CLASS}.${SIDE_CLASS} { flex-direction: row-reverse; align-items: stretch; gap: 14px; }
.${COLS_CLASS}.${SIDE_CLASS}.${SIDE_LEFT_CLASS} { flex-direction: row; }

.${COL_CLASS} { min-width: 0; }
.${COLS_CLASS}.${SIDE_CLASS} > .${COL_CLASS} { flex: 1 1 0; }

/* Equal-height columns, only while the two really are side by side: stacked, prosilver's
   own \`.topicreview { height }\` is right and must not be touched, hence the media query.

   \`align-items: stretch\` already makes both columns as tall as the taller one; this makes
   the review *use* that height instead of its fixed one. \`flex: 1 1 0\` also stops the
   reverse: with a zero basis the posts no longer dictate the column's height, so a
   hundred-post thread scrolls inside its own box rather than stretching the pair.
   \`min-height\` keeps that box usable when the composer is short. */
@media (min-width: ${NARROW_MAX_WIDTH + 1}px) {
  .${COLS_CLASS}.${SIDE_CLASS} > [data-dlh-part='review'] {
    display: flex;
    flex-direction: column;
  }
  .${COLS_CLASS}.${SIDE_CLASS} > [data-dlh-part='review'] > #topicreview {
    flex: 1 1 0;
    height: auto;
    min-height: ${MIN_REVIEW_HEIGHT}px;
    max-height: none;
    overflow: auto;
  }
}

/* Full width without touching the skin: the wrapper keeps \`width: auto\` and pushes both
   margins out by the difference between the viewport and its own centred column, so the
   box ends up as wide as the window and still centred on it. Only this element moves.
   If some ancestor ever clips overflow the break-out simply has no effect, degrading to
   the centred layout rather than breaking. */
.${COLS_CLASS}.${FULL_WIDTH_CLASS} {
  width: auto;
  max-width: none;
  box-sizing: border-box;
  margin-left: calc(50% - var(${VIEWPORT_WIDTH_VAR}, 100vw) / 2);
  margin-right: calc(50% - var(${VIEWPORT_WIDTH_VAR}, 100vw) / 2);
  padding-left: 12px;
  padding-right: 12px;
}

/* Visual order only: the DOM (and therefore tab order) stays newest-first.
   Reversing in CSS is what keeps highlight ranges and quote lookups untouched. */
#topicreview.${REVIEW_REVERSE_CLASS} { display: flex; flex-direction: column-reverse; }

/* Nothing in a half-width column may push the column wider than its share. */
.${COLS_CLASS}.${SIDE_CLASS} #message { width: 100%; box-sizing: border-box; }
.${COLS_CLASS}.${SIDE_CLASS} #smiley-box { max-width: 100%; }
.${COLS_CLASS}.${SIDE_CLASS} .content img { max-width: 100%; height: auto; }

@media (max-width: ${NARROW_MAX_WIDTH}px) {
  .${COLS_CLASS}.${SIDE_CLASS} { flex-direction: column; gap: 0; align-items: stretch; }
  .${COLS_CLASS}.${SIDE_CLASS}.${REVERSE_CLASS} { flex-direction: column-reverse; }
}
`;

/** Inject the stylesheet (idempotent). Returns a function that removes it. */
export function injectLayoutStyles(): () => void {
  document.getElementById(STYLE_ID)?.remove();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
  return () => style.remove();
}
