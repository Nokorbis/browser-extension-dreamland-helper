/**
 * Re-arranging the reply page: wrapping `#postform`'s two halves into columns,
 * and flipping the classes that place them.
 *
 * ⚠ Elements are **moved, never re-created**. The composer half holds a textarea
 * the writer may already have typed into, hidden fields phpBB's submit needs and
 * nodes its own scripts hold references to; rebuilding any of it would lose text
 * or break the post. Moving a node keeps all three. The already-executed inline
 * `<script>` inside `#topicreview` moves with it and does not re-run (a script
 * element that has run carries the "already started" flag for life).
 *
 * The split is positional: `h3#review` is the boundary, everything before it is
 * the composer, that heading and everything after it is the review. Reading the
 * boundary off the DOM rather than listing the composer's own ids is what makes
 * a `#preview` panel — which phpBB inserts near the top after an Aperçu — land
 * in the composer column for free. See docs/adr/0030.
 */
import type { LayoutPrefs } from '@/lib/composer-layout';
import {
  COL_CLASS,
  COLS_CLASS,
  FULL_WIDTH_CLASS,
  REVERSE_CLASS,
  REVIEW_REVERSE_CLASS,
  SIDE_CLASS,
  SIDE_LEFT_CLASS,
  VIEWPORT_WIDTH_VAR,
} from './styles';

export interface ReplyLayout {
  /** Reflect the writer's choice. Cheap: class flips only. */
  apply(prefs: LayoutPrefs): void;
  /** Put the page back exactly as phpBB rendered it. */
  destroy(): void;
}

function makeColumn(part: 'composer' | 'review'): HTMLDivElement {
  const column = document.createElement('div');
  column.className = COL_CLASS;
  column.dataset.dlhPart = part;
  return column;
}

/**
 * Wrap the form's two halves into columns and return the handle that places
 * them. `heading` must be a child of `form`, and `review` the element to reverse
 * (`#topicreview`).
 */
export function createReplyLayout(
  form: HTMLFormElement,
  heading: HTMLElement,
  review: HTMLElement,
): ReplyLayout {
  const original = Array.from(form.children);
  const boundary = original.indexOf(heading);

  const wrapper = document.createElement('div');
  wrapper.className = COLS_CLASS;
  const composerColumn = makeColumn('composer');
  const reviewColumn = makeColumn('review');
  wrapper.append(composerColumn, reviewColumn);

  // Insert the wrapper first, so the form is never empty and phpBB's scripts
  // never see a moment without it.
  form.prepend(wrapper);
  original.forEach((child, index) => {
    (index < boundary ? composerColumn : reviewColumn).append(child);
  });

  // The break-out's own width, measured rather than taken from `100vw` — see
  // `VIEWPORT_WIDTH_VAR`. Kept current while the window resizes; it costs one
  // property write and only matters while full width is on.
  const measureViewport = () => {
    wrapper.style.setProperty(
      VIEWPORT_WIDTH_VAR,
      `${document.documentElement.clientWidth}px`,
    );
  };
  measureViewport();
  window.addEventListener('resize', measureViewport);

  return {
    apply(prefs) {
      wrapper.classList.toggle(REVERSE_CLASS, prefs.reverseOrder);
      wrapper.classList.toggle(SIDE_CLASS, prefs.sideBySide);
      wrapper.classList.toggle(
        SIDE_LEFT_CLASS,
        prefs.sideBySide && prefs.composerSide === 'left',
      );
      wrapper.classList.toggle(FULL_WIDTH_CLASS, prefs.fullWidth);
      review.classList.toggle(REVIEW_REVERSE_CLASS, prefs.reverseOrder);
    },
    destroy() {
      window.removeEventListener('resize', measureViewport);
      review.classList.remove(REVIEW_REVERSE_CLASS);
      for (const child of original) form.append(child);
      wrapper.remove();
    },
  };
}
