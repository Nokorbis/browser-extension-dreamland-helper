import { i18n } from '#i18n';
import type { Feature } from '../types';
import {
  findPostForm,
  findReviewHeading,
  findTopicReview,
  followTheme,
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
 * Write next to what you are answering. phpBB puts the composer above the review and reads it
 * newest-first; *ordre inversé* reads the review oldest-first and moves the composer below it,
 * *côte à côte* puts it beside instead, on the side the third control picks.
 *
 * Three choices, all in docs/adr/0030: the page is **re-wrapped, never re-rendered**
 * (`layout.ts`); the post order flips in **CSS**, so `highlight` and every other post lookup
 * is untouched; and the controls live **outside `<form id="postform">`**, out of reach of
 * phpBB's POST.
 *
 * Reply pages only: without a topic review there is nothing to place the composer against.
 */
export const composerLayout = {
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
    // The split is positional inside the form, so a skin that moved the heading
    // elsewhere would put every child on one side. Leave the page alone.
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

    // ⚠ Hoisted `function`s, not `const`s: the handlers above are wired to `change`
    // before this point. Hoisting is what makes that safe by construction rather than
    // by luck.

    /** Reflect `next` in the page and the controls, without writing it. */
    function apply(next: LayoutPrefs): void {
      prefs = next;
      layout.apply(prefs);
      controls.update(prefs);
    }

    /** The write is reported rather than dropped: a silent failure is a checkbox that forgets. */
    function change(patch: Partial<LayoutPrefs>): void {
      if (disposed) return;
      apply({ ...prefs, ...patch });
      void saveLayoutPrefs(prefs).catch((err: unknown) => {
        warn('composer-layout: could not save the layout choice', err);
      });
    }

    const unwatchTheme = followTheme((dark) => {
      controls.setDark(dark);
    });

    // No eager `apply(prefs)`: the page already looks like the defaults (no state class is
    // set yet), so painting them here only adds a reflow before the stored choice lands.
    void loadLayoutPrefs()
      .then((loaded) => {
        if (disposed) return;
        apply(loaded);
      })
      .catch((err: unknown) => {
        warn('composer-layout: could not load the layout choice', err);
      });
    // For a reply page open in a second tab: its layout follows without a reload.
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
