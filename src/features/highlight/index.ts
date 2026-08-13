import { i18n } from '#i18n';
import type { Feature } from '../types';
import {
  findPostContentElements,
  readTopicId,
  isDarkTheme,
  watchTheme,
} from '@/lib/phpbb';
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
import { resolveRange, serializeSelection } from './anchor';
import { isHighlightApiSupported, HighlightRenderer } from './render';
import { colorLabel, createClearControl } from './toolbar';
import { HIGHLIGHT_COLORS } from './palette';
import { log, warn } from '@/lib/log';

/**
 * Whether two ranges in the same document overlap. A shared endpoint (one range
 * ending exactly where the other starts) does **not** count, so erasing needs a
 * real overlap. Uses `compareBoundaryPoints`: `a.end > b.start && a.start < b.end`.
 */
function rangesOverlap(a: Range, b: Range): boolean {
  return (
    a.compareBoundaryPoints(Range.START_TO_END, b) > 0 && // a.end > b.start
    a.compareBoundaryPoints(Range.END_TO_START, b) < 0 // a.start < b.end
  );
}

/**
 * Feature #2 — Persistent text highlights.
 *
 * Select text in a post's message body and keep it highlighted in a chosen
 * colour, across reloads and between the thread page (viewtopic) and the reply
 * composer's topic review (posting.php). Only message content is annotatable —
 * the selection must sit inside one post's `.content`.
 *
 * Three moving parts, each in its own module:
 * - `render.ts` paints via the CSS Custom Highlight API (no DOM mutation);
 * - `anchor.ts` turns a selection into a stored `[start,end)+quote` and back;
 * - `@/lib/highlights` is the feature-owned store (docs/adr/0012).
 *
 * The floating row the swatches sit in is **not** ours: it is the shared
 * `@/lib/selection-toolbar`, which owns the selection plumbing and asks every
 * registered feature what it offers for the current selection (docs/adr/0028).
 * This feature contributes the palette, plus an eraser when the selection
 * overlaps something already painted.
 *
 * Highlights are keyed by numeric post id, which phpBB encodes identically as
 * `#p<id>` and `#pr<id>` — that's what makes them shared across the two pages.
 *
 * On a browser without the Custom Highlight API (Firefox < 140 / Chrome < 105)
 * the feature no-ops: it doesn't offer to create highlights it couldn't show.
 * The popup's clear buttons still work — they only touch storage.
 */
export const highlight = {
  // `as const` so the literal survives inference: `FeatureId` in registry.ts is
  // built from these, and a widened `string` would make it match anything.
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

    // Highlights currently painted on THIS page, each with its resolved DOM
    // range — rebuilt every render. The eraser matches the selection against
    // these, not against stored offsets, which is what lets it work from either
    // page even though a post's `.content` offsets differ across the two.
    let paintedRanges: { id: string; postId: string; range: Range }[] = [];

    // --- in-page control ---------------------------------------------------
    // Built *before* `render`, which needs it to exist by the time it is called.
    const clearControl = createClearControl({
      onClearTopic: () => {
        if (topicId !== null) persist(clearTopic(store, topicId));
      },
      onClearAll: () => persist(clearAll(store)),
    });

    const applyTheme = (dark: boolean) => {
      clearControl.setDark(dark);
    };
    applyTheme(isDarkTheme());
    const unwatchTheme = watchTheme(applyTheme);

    // --- rendering ---------------------------------------------------------
    function render() {
      const byColor = new Map<string, Range[]>();
      paintedRanges = [];
      for (const [postId, list] of highlightsForPosts(store, posts.keys())) {
        const content = posts.get(postId);
        if (content === undefined) continue;
        for (const h of list) {
          const range = resolveRange(content, h.start, h.end, h.quote);
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
     * The palette, plus an eraser when this selection overlaps a painted
     * highlight. Returns `[]` — offering nothing — for a post we aren't
     * watching or a selection `anchor.ts` refuses to serialize, which is the
     * same gate the old private toolbar applied before showing itself.
     */
    const buttonsFor = (sel: PostSelection): ToolbarButton[] => {
      if (disposed || !posts.has(sel.postId)) return [];
      const serialized = serializeSelection(sel.content, sel.range);
      if (serialized === null) return [];

      // Erase targets: highlights painted on this post whose range overlaps the
      // selection here — compared as DOM ranges, so it's independent of offsets.
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
    void loadHighlightStore().then((loaded) => {
      if (disposed) return;
      apply(loaded);
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
