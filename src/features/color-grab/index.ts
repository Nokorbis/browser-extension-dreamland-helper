import { i18n } from '#i18n';
import type { Feature } from '../types';
import {
  findColourPalette,
  findColourPaletteBody,
  findColourPaletteCells,
  findColourPalettePlaceholder,
  findMessageTextarea,
  findTopicReview,
  readReviewColorUsages,
} from '@/lib/phpbb';
import {
  insertAtRange,
  readSelection,
  wrapSelection,
  type TextRange,
} from '@/lib/textarea';
import { log } from '@/lib/log';
import { setOrRemove } from '@/lib/dom';
import { aggregateUsage, canonicalizeColor, partitionByGrid } from './palette-filter';

/**
 * Reuse a colour already used in the thread, by augmenting phpBB's *own* font-colour palette
 * rather than adding a bespoke popup: a checkbox filters the grid down to the colours used
 * in the topic review, colours the fixed grid lacks are appended, and each surviving
 * swatch's tooltip lists who used it and how often.
 *
 * Same "delegate to phpBB" stance as the keyboard shortcuts (docs/adr/0017): the native
 * swatches keep phpBB's own insertion, and `insertAtRange` is only used on swatches we
 * inject ourselves.
 *
 * ⚠ phpBB's `registerPalette` regenerates the grid on DOM-ready and our content script may
 * run either side of it, so the filter installs idempotently and a MutationObserver
 * reinstalls it on every rebuild. See `findColourPalette` in `@/lib/phpbb`.
 */

/** Marks our injected nodes so a reinstall can't double them up. */
const TRIGGER_MARKER = 'data-dlh-color-grab';

interface CellState {
  a: HTMLAnchorElement;
  /** The `<td>` carries the swatch's background colour, so it is what we hide. */
  td: HTMLElement | null;
  /** Canonical `#rrggbb`, or null if `data-color` was unreadable. */
  color: string | null;
  /** phpBB's own title (`#RRGGBB`), stashed so we can restore it. */
  originalTitle: string | null;
}

export const colorGrab = {
  id: 'color-grab' as const,
  name: i18n.t('features.colorGrab.name'),
  description: i18n.t('features.colorGrab.description'),
  implemented: true,

  setup() {
    const textarea = findMessageTextarea();
    if (textarea === null) return; // not a composer page
    const palette = findColourPalette();
    if (palette === null) return; // BBCode/colour disabled, or a skin without it
    if (findTopicReview() === null) return; // no review → nothing to grab

    // Canonicalise here, so everything downstream compares `#rrggbb`.
    const usages = aggregateUsage(
      readReviewColorUsages()
        .map((o) => ({ color: canonicalizeColor(o.rawColor), author: o.author }))
        .filter((o): o is { color: string; author: string } => o.color !== null),
    );
    if (usages.length === 0) {
      log('color-grab: no colours in the topic review — filter not shown');
      return;
    }

    const reviewSet = new Set(usages.map((u) => u.color));
    const usageByColor = new Map(usages.map((u) => [u.color, u] as const));

    const controller = new AbortController();
    const { signal } = controller;

    const tooltipFor = (color: string): string => {
      const usage = usageByColor.get(color);
      const roster =
        usage === undefined
          ? ''
          : usage.authors.map((a) => `${a.author} ×${a.count}`).join(', ');
      return i18n.t('features.colorGrab.filter.usedBy', { color, roster });
    };

    /** Wrap the selection (or drop an empty pair) in the clicked colour. */
    const insertColor = (color: string, range: TextRange, selection: string) => {
      const { text, caretOffset } = wrapSelection(
        `[color=${color}]`,
        '[/color]',
        selection,
      );
      insertAtRange(textarea, range, text, caretOffset);
    };

    /**
     * A swatch for a review colour the fixed grid has no cell for, mimicking phpBB's
     * `<td><a data-color>`. phpBB regenerates before we inject, so it never bound a click
     * here — we wire our own through the undo-safe path.
     */
    const makeCustomCell = (color: string): HTMLTableCellElement => {
      const td = document.createElement('td');
      td.style.backgroundColor = color;
      td.style.width = '15px';
      td.style.height = '12px';

      const a = document.createElement('a');
      a.href = '#';
      a.dataset.color = color.slice(1).toUpperCase();
      a.style.display = 'block';
      a.style.width = '15px';
      a.style.height = '12px';
      a.title = tooltipFor(color);
      td.append(a);

      // Snapshot on mousedown, before the click can move focus off the textarea;
      // preventDefault keeps the selection alive across the click.
      let range: TextRange = { start: 0, end: 0 };
      let selection = '';
      a.addEventListener(
        'mousedown',
        (event) => {
          event.preventDefault();
          const snapshot = readSelection(textarea);
          range = { start: snapshot.start, end: snapshot.end };
          selection = snapshot.text;
        },
        { signal },
      );
      a.addEventListener(
        'click',
        (event) => {
          event.preventDefault(); // it's an href="#"
          // Ours carries no phpBB handler, but stop the click anyway in case a
          // version delegates on the placeholder and would insert twice.
          event.stopPropagation();
          insertColor(color, range, selection);
        },
        { signal },
      );
      return td;
    };

    // --- the checkbox, above the grid inside the (collapsible) palette ---
    const wrapper = document.createElement('div');
    wrapper.setAttribute(TRIGGER_MARKER, '');
    wrapper.style.margin = '0 0 4px';
    wrapper.style.fontSize = '11px';

    const label = document.createElement('label');
    label.style.display = 'inline-flex';
    label.style.alignItems = 'center';
    label.style.gap = '4px';
    label.style.cursor = 'pointer';
    label.style.userSelect = 'none';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; // no name → never part of the submitted form
    label.append(
      checkbox,
      document.createTextNode(i18n.t('features.colorGrab.filter.label')),
    );
    wrapper.append(label);
    // Just before the swatch grid. phpBB regenerates #color_palette_placeholder *in
    // place* (innerHTML only), so a sibling inserted before it stays put.
    const placeholder = findColourPalettePlaceholder();
    if (placeholder !== null) placeholder.before(wrapper);
    else palette.prepend(wrapper);

    // --- the filter over phpBB's (JS-generated) grid ---
    let cells: CellState[] = [];
    let customRow: HTMLTableRowElement | null = null;

    const apply = () => {
      const on = checkbox.checked;
      for (const cell of cells) {
        const target = cell.td ?? cell.a;
        const inReview = on && cell.color !== null && reviewSet.has(cell.color);
        target.style.visibility = on && !inReview ? 'hidden' : '';
        if (inReview && cell.color !== null) {
          cell.a.setAttribute('title', tooltipFor(cell.color));
        } else {
          setOrRemove(cell.a, 'title', cell.originalTitle);
        }
      }
      if (customRow !== null) customRow.style.display = on ? '' : 'none';
    };

    const teardownGrid = () => {
      for (const cell of cells) {
        (cell.td ?? cell.a).style.visibility = '';
        setOrRemove(cell.a, 'title', cell.originalTitle);
      }
      customRow?.remove();
      customRow = null;
      cells = [];
    };

    // phpBB's DOM-ready rebuild may land after us and wipe our cells and appended row, so
    // reinstall when it does. Our own writes run while disconnected, so this only fires
    // for phpBB's rebuild.
    //
    // ⚠ The observer and `install` reference each other, so `install` is a hoisted
    // `function` — as two `const`s it only worked by accident of call order.
    const observer = new MutationObserver(() => {
      const stale = cells.length === 0 || !cells[0].a.isConnected;
      const rowGone = customRow !== null && !customRow.isConnected;
      if (stale || rowGone) install();
    });
    const reconnect = () =>
      observer.observe(placeholder ?? palette, { childList: true, subtree: true });

    function install() {
      // Suppress our own DOM writes so they don't re-trigger the observer.
      observer.disconnect();
      teardownGrid();

      cells = findColourPaletteCells().map((a) => ({
        a,
        td: a.closest<HTMLElement>('td'),
        color: canonicalizeColor(a.dataset.color ?? ''),
        originalTitle: a.getAttribute('title'),
      }));

      const { custom } = partitionByGrid(
        usages.map((u) => u.color),
        cells.map((c) => c.a.dataset.color ?? ''),
      );
      if (custom.length > 0) {
        const body = findColourPaletteBody();
        if (body !== null) {
          const row = document.createElement('tr');
          row.setAttribute(TRIGGER_MARKER, '');
          for (const color of custom) row.append(makeCustomCell(color));
          body.append(row);
          customRow = row;
        }
      }

      apply();
      reconnect();
    }

    checkbox.addEventListener('change', apply, { signal });
    install();

    log(`color-grab: ${usages.length} review colours available in the palette filter`);

    return () => {
      controller.abort();
      observer.disconnect();
      teardownGrid();
      wrapper.remove();
    };
  },
} satisfies Feature;
