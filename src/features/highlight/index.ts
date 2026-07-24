import { i18n } from '#i18n';
import type { Feature } from '../types';
import {
  findPostContentElements,
  readPostId,
  readTopicId,
  isDarkTheme,
  watchTheme,
} from '@/lib/phpbb';
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
import { serializeSelection, resolveRange } from './anchor';
import { isHighlightApiSupported, HighlightRenderer } from './render';
import { createSelectionToolbar, createClearControl } from './toolbar';
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
 * Highlights are keyed by numeric post id, which phpBB encodes identically as
 * `#p<id>` and `#pr<id>` — that's what makes them shared across the two pages.
 *
 * On a browser without the Custom Highlight API (Firefox < 140 / Chrome < 105)
 * the feature no-ops: it doesn't offer to create highlights it couldn't show.
 * The popup's clear buttons still work — they only touch storage.
 */
export const highlight: Feature = {
  id: 'highlight',
  name: i18n.t('features.highlight.name'),
  description: i18n.t('features.highlight.description'),
  implemented: true,

  setup(ctx) {
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
    const controller = new AbortController();
    const { signal } = controller;
    let disposed = false;
    let store: HighlightStore = emptyHighlightStore();

    // The selection captured when the toolbar was shown. `eraseIds` are the
    // highlights whose *painted* range on this page overlaps it — resolved at
    // show time, so the eraser doesn't depend on stored offsets matching.
    let pending: {
      postId: string;
      start: number;
      end: number;
      quote: string;
      eraseIds: string[];
    } | null = null;

    // Highlights currently painted on THIS page, each with its resolved DOM
    // range — rebuilt every render. The eraser matches the selection against
    // these, not against stored offsets, which is what lets it work from either
    // page even though a post's `.content` offsets differ across the two.
    let paintedRanges: { id: string; postId: string; range: Range }[] = [];

    // --- rendering ---------------------------------------------------------
    const render = () => {
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
    };

    const apply = (next: HighlightStore) => {
      store = next;
      render();
    };

    /** Optimistic paint, then persist; report a failed write (never `.finally`). */
    const persist = (next: HighlightStore) => {
      apply(next);
      void saveHighlightStore(next).catch((err) =>
        warn('highlight: could not save', err),
      );
    };

    // --- in-page controls --------------------------------------------------
    const toolbar = createSelectionToolbar({
      onPick: (hex) => {
        if (pending === null) return;
        persist(
          addHighlight(store, {
            id: newId(),
            topicId: topicId ?? '',
            postId: pending.postId,
            start: pending.start,
            end: pending.end,
            quote: pending.quote,
            color: hex,
          }),
        );
        dismiss();
      },
      onErase: () => {
        if (pending === null || pending.eraseIds.length === 0) return;
        persist(deleteHighlights(store, pending.eraseIds));
        dismiss();
      },
    });

    const clearControl = createClearControl({
      onClearTopic: () => {
        if (topicId !== null) persist(clearTopic(store, topicId));
      },
      onClearAll: () => persist(clearAll(store)),
    });

    const applyTheme = (dark: boolean) => {
      toolbar.setDark(dark);
      clearControl.setDark(dark);
    };
    applyTheme(isDarkTheme());
    const unwatchTheme = watchTheme(applyTheme);

    // --- selection → toolbar ----------------------------------------------
    /** The single `.content` (and its post id) a range sits wholly inside. */
    const locate = (
      range: Range,
    ): { content: HTMLElement; postId: string } | null => {
      const common = range.commonAncestorContainer;
      const el =
        common.nodeType === Node.ELEMENT_NODE
          ? (common as Element)
          : common.parentElement;
      const content = el?.closest<HTMLElement>('.content') ?? null;
      if (content === null) return null;
      const postEl = content.closest<HTMLElement>('.post');
      const postId = postEl === null ? null : readPostId(postEl);
      if (postId === null || !posts.has(postId)) return null;
      return { content, postId };
    };

    const dismiss = () => {
      toolbar.hide();
      pending = null;
      window.getSelection()?.removeAllRanges();
    };

    const evaluateSelection = () => {
      if (disposed) return;
      const sel = window.getSelection();
      if (sel === null || sel.isCollapsed || sel.rangeCount === 0) {
        toolbar.hide();
        pending = null;
        return;
      }
      const range = sel.getRangeAt(0);
      const info = locate(range);
      if (info === null) {
        toolbar.hide();
        pending = null;
        return;
      }
      const serialized = serializeSelection(info.content, range);
      if (serialized === null) {
        toolbar.hide();
        pending = null;
        return;
      }
      // Erase targets: highlights painted on this post whose range overlaps the
      // selection here — compared as DOM ranges, so it's independent of offsets.
      const eraseIds = paintedRanges
        .filter((p) => p.postId === info.postId && rangesOverlap(p.range, range))
        .map((p) => p.id);
      pending = { postId: info.postId, ...serialized, eraseIds };
      toolbar.showAt(range.getBoundingClientRect(), {
        canErase: eraseIds.length > 0,
      });
    };

    // Evaluate after the mouseup so the selection is final; ignore clicks that
    // land on our own UI (they'd otherwise dismiss the toolbar being clicked).
    const onOurUi = (event: Event) => {
      const path = event.composedPath();
      return path.includes(toolbar.host);
    };
    document.addEventListener(
      'mouseup',
      (event) => {
        if (onOurUi(event)) return;
        setTimeout(evaluateSelection, 0);
      },
      { signal },
    );
    // Starting a new click/drag elsewhere dismisses a stale toolbar.
    document.addEventListener(
      'mousedown',
      (event) => {
        if (!toolbar.visible || onOurUi(event)) return;
        toolbar.hide();
        pending = null;
      },
      { signal },
    );
    // A fixed toolbar doesn't follow the selection when the page moves.
    const hideOnMove = () => {
      if (toolbar.visible) {
        toolbar.hide();
        pending = null;
      }
    };
    document.addEventListener('scroll', hideOnMove, { capture: true, signal });
    window.addEventListener('resize', hideOnMove, { signal });

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
      controller.abort();
      unwatchStore();
      unwatchTheme();
      renderer.clear();
      toolbar.destroy();
      clearControl.destroy();
    };
  },
};
