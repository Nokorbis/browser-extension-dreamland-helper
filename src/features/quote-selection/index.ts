import { i18n } from '#i18n';
import type { Feature } from '../types';
import {
  findMessageTextarea,
  findTopicReview,
  readPostAuthorName,
  readPostSource,
  readQuoteAttributes,
} from '@/lib/phpbb';
import {
  dismissSelectionToolbar,
  registerSelectionToolbarGroup,
  type PostSelection,
  type ToolbarButton,
} from '@/lib/selection-toolbar';
import { insertAtRange, readSelection } from '@/lib/textarea';
import { formatQuote } from './bbcode';
import { sliceQuotableSource, squeeze } from './source';
import { log } from '@/lib/log';

/**
 * Feature #7 — Quote a selected passage.
 *
 * phpBB's quote button quotes the *whole* post, and posts on this forum run to
 * thousands of words, so replying to one line means quoting a wall and deleting
 * the rest. This adds a quote button to the shared selection toolbar: select a
 * passage in the topic review, click it, and just that passage lands in the
 * composer as a `[quote]` block.
 *
 * Three deliberate choices, all recorded in docs/adr/0029:
 *
 * - **The reply page only.** `viewtopic` has no composer, so quoting from there
 *   would mean stashing the passage across a navigation — a different problem.
 *   `findMessageTextarea` returning null is the whole gate.
 * - **phpBB's own quote form.** The attributes come from the review's own
 *   `addquote(…)` handler, so the block renders with the "a écrit" header and
 *   the arrow back to the source post.
 * - **The original BBCode, when it can be recovered.** `source.ts` matches the
 *   selected text against the post's raw source and falls back to plain text
 *   whenever it cannot align the two confidently.
 *
 * The floating row itself belongs to `@/lib/selection-toolbar`, shared with
 * `highlight` (docs/adr/0028); this feature only contributes one button.
 */
export const quoteSelection = {
  // `as const` so the literal survives inference: `FeatureId` in registry.ts is
  // built from these, and a widened `string` would make it match anything.
  id: 'quote-selection' as const,
  name: i18n.t('features.quoteSelection.name'),
  description: i18n.t('features.quoteSelection.description'),
  implemented: true,

  setup() {
    const textarea = findMessageTextarea();
    if (textarea === null) return; // not a composer page — nothing to quote into
    const review = findTopicReview();
    if (review === null) return; // no review (a new topic) — nothing to quote from

    /**
     * Roughly where the selection starts in the post, in non-whitespace
     * characters — enough for `sliceQuotableSource` to pick the right one of
     * several identical passages. Measured the same way the source side counts,
     * so the two are comparable.
     */
    const startHint = (sel: PostSelection): number => {
      try {
        const before = document.createRange();
        before.setStart(sel.content, 0);
        before.setEnd(sel.range.startContainer, sel.range.startOffset);
        return squeeze(before.toString()).squeezed.length;
      } catch {
        return 0;
      }
    };

    const quote = (sel: PostSelection): void => {
      const source = readPostSource(sel.postId);
      const recovered =
        source === null ? null : sliceQuotableSource(source, sel.text, startHint(sel));
      const text = formatQuote(recovered ?? sel.text, {
        author: readPostAuthorName(sel.post),
        attributes: readQuoteAttributes(sel.post),
      });
      // The caret is read now rather than snapshotted earlier: the page
      // selection lives in the post, not in the textarea, and the toolbar
      // cancels its own mousedown, so the composer's caret is untouched by the
      // click. `insertAtRange` is the undo-safe path (docs/adr/0013).
      insertAtRange(textarea, readSelection(textarea), text, text.length);
      dismissSelectionToolbar();
    };

    const buttonsFor = (sel: PostSelection): ToolbarButton[] => {
      // Only posts in the topic review: they are the ones carrying an author,
      // quote attributes and a raw source, and the only ones on this page.
      if (!review.contains(sel.post)) return [];
      return [
        {
          key: 'quote',
          label: i18n.t('features.quoteSelection.toolbar.quote'),
          glyph: '❝',
          onSelect: quote,
        },
      ];
    };

    const unregisterGroup = registerSelectionToolbarGroup({
      id: 'quote-selection',
      buttonsFor,
    });

    log('quote-selection: quoting into the composer from the topic review');

    return unregisterGroup;
  },
} satisfies Feature;
