import { i18n } from '#i18n';
import type { Feature } from '../types';
import {
  findPostForm,
  findReviewHeading,
  findTopicReview,
  isDarkTheme,
  watchTheme,
} from '@/lib/phpbb';
import {
  emptyLayoutPrefs,
  loadLayoutPrefs,
  saveLayoutPrefs,
  watchLayoutPrefs,
  type ComposerSide,
  type LayoutPrefs,
} from '@/lib/composer-layout';
import { createLayoutControls } from './controls';
import { createReplyLayout } from './layout';
import { injectLayoutStyles } from './styles';
import { log, warn } from '@/lib/log';

/**
 * Feature #8 — Reply page layout.
 *
 * phpBB puts the composer above the topic review and reads the review
 * newest-first. On this forum a reply is often an answer to a post several
 * screens away, so writing one means scrolling between the two. Two checkboxes
 * above the form change that:
 *
 * - **Ordre inversé** — the review reads oldest-first, and the composer moves
 *   below it.
 * - **Côte à côte** — the composer sits beside the review instead, on the side
 *   the third control picks. It overrides the vertical placement; the first
 *   checkbox still decides the reading order of the posts.
 *
 * Three deliberate choices, recorded in docs/adr/0030:
 *
 * - **The page is re-wrapped, never re-rendered.** `layout.ts` moves the form's
 *   existing children into two columns, so the textarea keeps its text and
 *   phpBB's own scripts keep their references.
 * - **The post order flips in CSS**, not in the DOM, so `highlight` ranges and
 *   `quote-selection`'s lookups are untouched by it.
 * - **The controls live outside `<form id="postform">`**, where nothing they
 *   carry can reach phpBB's POST or submit it.
 *
 * Reply pages only: without a topic review there is nothing to place the
 * composer against, which is the whole gate below.
 */
export const composerLayout = {
  // `as const` so the literal survives inference: `FeatureId` in registry.ts is
  // built from these, and a widened `string` would make it match anything.
  id: 'composer-layout' as const,
  name: i18n.t('features.composerLayout.name'),
  description: i18n.t('features.composerLayout.description'),
  implemented: true,

  setup() {
    const form = findPostForm();
    if (form === null) return; // not a composer page
    const review = findTopicReview();
    const heading = findReviewHeading();
    // A new topic — or a forum with the review disabled — has one half only.
    if (review === null || heading === null) return;
    // The split is positional inside the form; a skin that moved the heading
    // elsewhere would put every child on one side, so leave the page alone.
    if (heading.parentElement !== form) {
      warn('composer-layout: the review heading is not a child of the post form');
      return;
    }

    let disposed = false;
    let prefs: LayoutPrefs = emptyLayoutPrefs();

    const removeStyles = injectLayoutStyles();
    const layout = createReplyLayout(form, heading, review);

    const controls = createLayoutControls(form, {
      onReverseOrder: (reverseOrder: boolean) => change({ reverseOrder }),
      onSideBySide: (sideBySide: boolean) => change({ sideBySide }),
      onFullWidth: (fullWidth: boolean) => change({ fullWidth }),
      onComposerSide: (composerSide: ComposerSide) => change({ composerSide }),
    });

    // Hoisted `function`s, not `const`s: the handlers above are wired to
    // `change` before this point in the file. That is safe only because they run
    // later, and hoisting is what makes it safe by construction rather than by
    // luck — the same shape as `collapse` in `highlight/toolbar.ts`.

    /** Reflect `next` in the page and in the controls, without writing it. */
    function apply(next: LayoutPrefs): void {
      prefs = next;
      layout.apply(prefs);
      controls.update(prefs);
    }

    /**
     * Apply a change and persist it. The write is reported rather than dropped:
     * a silent failure here is a checkbox that quietly forgets (CLAUDE.md).
     */
    function change(patch: Partial<LayoutPrefs>): void {
      if (disposed) return;
      apply({ ...prefs, ...patch });
      void saveLayoutPrefs(prefs).catch((err: unknown) => {
        warn('composer-layout: could not save the layout choice', err);
      });
    }

    const applyTheme = (dark: boolean) => {
      controls.setDark(dark);
    };
    applyTheme(isDarkTheme());
    const unwatchTheme = watchTheme(applyTheme);

    apply(prefs);
    void loadLayoutPrefs().then((loaded) => {
      if (disposed) return;
      apply(loaded);
    });
    // Another reply page open in a second tab is the case this covers: the
    // layout there follows without a reload.
    const unwatchStore = watchLayoutPrefs((next) => {
      if (disposed) return;
      apply(next);
    });

    log('composer-layout: reply page layout controls installed');

    return () => {
      disposed = true;
      unwatchStore();
      unwatchTheme();
      controls.destroy();
      layout.destroy();
      removeStyles();
    };
  },
} satisfies Feature;
