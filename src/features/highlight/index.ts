import { i18n } from '#i18n';
import type { Feature } from '../types';
import { findPostContentElements, followTheme, readTopicId } from '@/lib/phpbb';
import {
  dismissSelectionToolbar,
  registerSelectionToolbarGroup,
  type PostSelection,
  type ToolbarButton,
} from '@/lib/selection-toolbar';
import {
  loadHighlightStore,
  saveHighlightStore,
  watchHighlightStore,
  highlightsForPosts,
  addHighlight,
  deleteHighlights,
  clearTopic,
  clearAll,
  emptyHighlightStore,
  newId,
  type HighlightStore,
} from '@/lib/highlights';
import { readContentText, resolveRange, serializeSelection } from './anchor';
import { isHighlightApiSupported, HighlightRenderer } from './render';
import { colorLabel, createClearControl } from './toolbar';
import { HIGHLIGHT_COLORS } from './palette';
import { log, warn } from '@/lib/log';

/**
 * A shared endpoint — one range ending exactly where the other starts — does **not** count,
 * so erasing needs a real overlap.
 */
function rangesOverlap(a: Range, b: Range): boolean {
  return (
    a.compareBoundaryPoints(Range.START_TO_END, b) > 0 && // a.end > b.start
    a.compareBoundaryPoints(Range.END_TO_START, b) < 0 // a.start < b.end
  );
}

/**
 * Persistent text highlights inside a post's message body, across reloads and between
 * viewtopic and the topic review. The selection must sit inside one post's `.content`.
 *
 * Three moving parts: `render.ts` paints via the CSS Custom Highlight API (no DOM
 * mutation), `anchor.ts` turns a selection into a stored `[start,end)+quote` and back, and
 * `@/lib/highlights` is the store (docs/adr/0012). The floating row the swatches sit in is
 * **not** ours — it is the shared `@/lib/selection-toolbar` (docs/adr/0028), to which this
 * contributes the palette plus an eraser over something already painted.
 *
 * Without the Custom Highlight API (Firefox < 140 / Chrome < 105) the feature no-ops rather
 * than offer to create highlights it could not show. The popup's clear buttons still work,
 * since they only touch storage.
 */
export const highlight = {
  id: 'highlight' as const,
  name: i18n.t('features.highlight.name'),
  description: i18n.t('features.highlight.description'),
  implemented: true,

  setup() {
    if (!isHighlightApiSupported()) {
      warn('highlight: CSS Custom Highlight API unavailable — feature disabled');
      return;
    }

    // postId → the post's `.content`. First wins if an id somehow repeats.
    const posts = new Map<string, HTMLElement>();
    for (const { postId, content } of findPostContentElements()) {
      if (!posts.has(postId)) posts.set(postId, content);
    }
    if (posts.size === 0) return; // no posts here (e.g. a brand-new topic)

    const topicId = readTopicId();
    const renderer = new HighlightRenderer();
    let disposed = false;
    let store: HighlightStore = emptyHighlightStore();

    // Painted on THIS page with resolved DOM ranges, rebuilt every render. The eraser
    // matches against these, not stored offsets, which is what lets it work from either
    // page even though a post's `.content` offsets differ across the two.
    let paintedRanges: { id: string; postId: string; range: Range }[] = [];

    // --- in-page control ---------------------------------------------------
    // Built *before* `render`, which needs it to exist when called.
    const clearControl = createClearControl({
      onClearTopic: () => {
        if (topicId !== null) persist(clearTopic(store, topicId));
      },
      onClearAll: () => persist(clearAll(store)),
    });

    const unwatchTheme = followTheme((dark) => {
      clearControl.setDark(dark);
    });

    // --- rendering ---------------------------------------------------------
    function render() {
      const byColor = new Map<string, Range[]>();
      paintedRanges = [];
      for (const [postId, list] of highlightsForPosts(store, posts.keys())) {
        const content = posts.get(postId);
        if (content === undefined) continue;
        // Read once per post, not once per highlight: every range on this post resolves
        // against the same text nodes.
        const text = readContentText(content);
        for (const h of list) {
          const range = resolveRange(text, h.start, h.end, h.quote);
          if (range === null) continue; // post edited / text gone — skip, keep record
          const bucket = byColor.get(h.color);
          if (bucket === undefined) byColor.set(h.color, [range]);
          else bucket.push(range);
          paintedRanges.push({ id: h.id, postId, range });
        }
      }
      renderer.setRanges(byColor);
      clearControl.update({
        count: paintedRanges.length,
        hasTopic: topicId !== null,
      });
    }

    function apply(next: HighlightStore) {
      store = next;
      render();
    }

    /** Optimistic paint, then persist; report a failed write (never `.finally`). */
    function persist(next: HighlightStore) {
      apply(next);
      void saveHighlightStore(next).catch((err) =>
        warn('highlight: could not save', err),
      );
    }

    // --- what we offer the shared toolbar ----------------------------------
    /**
     * The palette, plus an eraser when this selection overlaps a painted highlight. `[]`
     * offers nothing, for a post we aren't watching or a selection `anchor.ts` refuses.
     */
    const buttonsFor = (sel: PostSelection): ToolbarButton[] => {
      if (disposed || !posts.has(sel.postId)) return [];
      const serialized = serializeSelection(sel.content, sel.range);
      if (serialized === null) return [];

      // Compared as DOM ranges, so this is independent of stored offsets.
      const eraseIds = paintedRanges
        .filter((p) => p.postId === sel.postId && rangesOverlap(p.range, sel.range))
        .map((p) => p.id);

      const buttons: ToolbarButton[] = HIGHLIGHT_COLORS.map((color) => ({
        key: color.id,
        label: colorLabel(color.id),
        swatch: color.hex,
        onSelect: () => {
          persist(
            addHighlight(store, {
              id: newId(),
              topicId: topicId ?? '',
              postId: sel.postId,
              start: serialized.start,
              end: serialized.end,
              quote: serialized.quote,
              color: color.hex,
            }),
          );
          dismissSelectionToolbar();
        },
      }));

      if (eraseIds.length > 0) {
        buttons.push({
          key: 'erase',
          label: i18n.t('features.highlight.toolbar.remove'),
          glyph: '⌫',
          onSelect: () => {
            persist(deleteHighlights(store, eraseIds));
            dismissSelectionToolbar();
          },
        });
      }
      return buttons;
    };

    const unregisterGroup = registerSelectionToolbarGroup({
      id: 'highlight',
      buttonsFor,
    });

    // --- data --------------------------------------------------------------
    void loadHighlightStore()
      .then((loaded) => {
        if (disposed) return;
        apply(loaded);
      })
      .catch((err: unknown) => {
        warn('highlight: could not load the stored highlights', err);
      });
    const unwatchStore = watchHighlightStore((next) => {
      if (disposed) return;
      apply(next);
    });

    log(
      `highlight: watching ${posts.size} post(s)` +
        (topicId === null ? '' : ` in topic ${topicId}`),
    );

    return () => {
      disposed = true;
      unregisterGroup();
      unwatchStore();
      unwatchTheme();
      renderer.clear();
      clearControl.destroy();
    };
  },
} satisfies Feature;
