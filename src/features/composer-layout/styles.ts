/**
 * The page-level stylesheet that actually lays the reply page out.
 *
 * It has to be a page-level `<style>` in `<head>`, like
 * `highlight/render.ts`'s: these rules style the *forum's own* elements
 * (`#postform`'s children, `#topicreview`, `#message`), which nothing inside a
 * shadow root can reach. A content-script-injected `<style>` is CSP-safe on this
 * forum (docs/adr/0016).
 *
 * Every state is expressed as a class on the wrapper (or on `#topicreview`), so
 * toggling a checkbox is a class flip and never a re-layout in JS.
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
 * State class on the wrapper — the full-width layout.
 *
 * It sits on our own element rather than on `<html>` (where it would have to
 * relax the skin's `#wrap { max-width }` and widen the forum's header, nav and
 * footer with it). The wrapper instead *breaks out* of the centred column with
 * symmetric negative margins, so nothing outside this feature's own subtree is
 * restyled and the class cannot collide with anything.
 */
export const FULL_WIDTH_CLASS = 'dlh-cols-full';

/**
 * The viewport width the break-out measures against, as a custom property the
 * feature keeps up to date.
 *
 * `100vw` is the obvious value and the wrong one: it **includes** the vertical
 * scrollbar, so a page that has one — every thread here — would end up a dozen
 * pixels wider than the window and grow a horizontal scrollbar. This is set from
 * `document.documentElement.clientWidth`, which excludes it. `100vw` remains as
 * the fallback so the rule still means something before the first measure.
 */
export const VIEWPORT_WIDTH_VAR = '--dlh-viewport-width';

/**
 * Below this width two columns stop being readable — the composer's toolbar
 * alone needs most of it — so side-by-side degrades to the stacked layout while
 * still honouring the reversed order.
 */
const NARROW_MAX_WIDTH = 900;

/**
 * The floor for the review's own box when the columns are side by side. Below
 * this a short composer (a fresh reply, before anything is typed) would squeeze
 * the review to a couple of lines; prosilver's own fixed height is 300px, so
 * this stays in that neighbourhood.
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

/* Equal-height columns, only while the two really are side by side — stacked,
   prosilver's own \`.topicreview { height }\` is the right size and this must not
   touch it, hence the media query rather than a plain rule.

   \`align-items: stretch\` above already makes both columns as tall as the taller
   one; this is what makes the review *use* that height instead of ending at its
   fixed one. \`flex: 1 1 0\` is also what stops the reverse from happening: with a
   zero basis the posts no longer dictate the column's height, so a hundred-post
   thread can't stretch the pair to a hundred posts tall — it scrolls inside its
   own box, as prosilver already intends. \`min-height\` keeps that box usable when
   the composer is short. */
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

/* Full width, without touching the skin. The wrapper keeps \`width: auto\` and
   pushes both margins out by exactly the difference between the viewport and its
   own centred column — \`50%\` resolves against the containing block, so the box
   ends up as wide as the window and still centred on it. Only this element
   moves: the forum's header, nav and footer stay where the skin put them.

   A little padding keeps the text off the window's edges. If some ancestor ever
   clips overflow, the break-out simply has no effect — the layout degrades to
   the centred one rather than breaking. */
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
