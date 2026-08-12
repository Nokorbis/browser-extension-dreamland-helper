import { i18n } from '#i18n';
import type { Feature } from '../types';
import { findFormatButton, findFormatButtons, findMessageTextarea } from '@/lib/phpbb';
import {
  findChatBBCodeButton,
  findChatBBCodeContainer,
  findChatTextarea,
} from '@/lib/chatbox';
import { log, warn } from '@/lib/log';
import { setOrRemove } from '@/lib/dom';
import { ariaCombo, formatCombo, isMacPlatform } from '@/lib/keys';
import { KEYMAP, resolveShortcut, type Shortcut } from './keymap';

/**
 * Feature #5 — Keyboard shortcuts for the BBCode toolbar.
 *
 * phpBB's composer is mouse-first: ten of its buttons carry an `accesskey`, but
 * the combo that triggers one differs per browser (Alt on Chromium, Alt+Shift on
 * Firefox, Ctrl+Option on macOS), and the forum's *custom* BBCodes — center,
 * justify, mp3, s, spoiler — carry none at all. This feature puts one consistent
 * set of shortcuts over the whole row — and, since the forum also runs a
 * non-native chat widget (the "Tribune") with its own BBCode toolbar, over that
 * one too.
 *
 * Two things define how it works, both settled in
 * docs/adr/0017-keyboard-shortcuts-delegate-to-toolbar.md:
 *
 * 1. **It clicks the forum's own buttons.** Nothing here inserts text. Their
 *    inline `onclick` (phpBB's `bbstyle(n)`, the chat's `insertBBCode(...)`) is
 *    a listener on the page's node, so a dispatched click runs the page's own
 *    handler even though the content script lives in an isolated world and
 *    cannot call it directly. A shortcut therefore does exactly what clicking
 *    does — including for any BBCode a surface adds later, which we never have
 *    to learn about.
 * 2. **The listener is on the textarea**, not the document, so these overrides
 *    exist only while composing. Outside the editor every key keeps its browser
 *    meaning, and inside it `preventDefault()` happens only once a binding has
 *    actually matched.
 *
 * It binds independently against every composer surface the current page has —
 * phpBB's `#message` and/or the chat's textarea — so a page with only one of
 * the two still works, and a page with neither is a silent no-op. The map and
 * the matching rules live in `./keymap.ts`, which knows nothing about either
 * surface; this file is DOM work.
 */

/** Marks a button we have already annotated, so a re-run can't double the hint. */
const TRIGGER_MARKER = 'data-dlh-shortcut';

/** One composer surface this feature can bind shortcuts inside. */
interface Target {
  textarea: HTMLTextAreaElement | null;
  /** The toolbar's presence gate — a surface with no toolbar has nothing to be a shortcut *to*. */
  toolbar: HTMLElement | null;
  findButton: (bbcode: string) => HTMLElement | null;
}

export const editorShortcuts = {
  // `as const` so the literal survives inference: `FeatureId` in registry.ts is
  // built from these, and a widened `string` would make it match anything.
  id: 'editor-shortcuts' as const,
  name: i18n.t('features.editorShortcuts.name'),
  description: i18n.t('features.editorShortcuts.description'),
  implemented: true,

  setup() {
    const mac = isMacPlatform();
    const controller = new AbortController();
    const restore: Array<() => void> = [];

    const targets: Target[] = [
      {
        textarea: findMessageTextarea(),
        toolbar: findFormatButtons(),
        findButton: findFormatButton,
      },
      {
        textarea: findChatTextarea(),
        toolbar: findChatBBCodeContainer(),
        findButton: findChatBBCodeButton,
      },
    ];

    let totalBound = 0;
    for (const target of targets) {
      // Absence of either half is ordinary — most pages have only one of the
      // two composer surfaces (or, for the chat's toolbar, phpBB's own
      // `{IF S_BBCODE_ALLOWED}` equivalent: BBCode can be off for the widget).
      if (target.textarea === null || target.toolbar === null) continue;
      totalBound += bindTarget(
        target.textarea,
        target.findButton,
        mac,
        controller,
        restore,
      );
    }

    if (totalBound === 0) {
      warn('editor-shortcuts: nothing to bind on this page');
      return;
    }

    log(
      `editor-shortcuts: ${totalBound} buttons bound (${mac ? 'macOS' : 'Ctrl/Alt'} layout)`,
    );

    return () => {
      controller.abort();
      for (const undo of restore) undo();
    };
  },
} satisfies Feature;

/**
 * Binds shortcuts to a single composer textarea, resolving each `KEYMAP` entry
 * through `findButton`. Decorates every matched button (tooltip, aria,
 * accesskey removal) exactly as before, and pushes its undo onto the shared
 * `restore` list so one feature-wide cleanup unwinds every target. Returns the
 * number of buttons bound, so a target that matched nothing contributes 0
 * without needing its own warning — that only fires once, feature-wide, when
 * every target came up empty.
 */
function bindTarget(
  textarea: HTMLTextAreaElement,
  findButton: (bbcode: string) => HTMLElement | null,
  mac: boolean,
  controller: AbortController,
  restore: Array<() => void>,
): number {
  /** BBCode → the live button, for every binding this surface actually has. */
  const buttons = new Map<string, HTMLElement>();
  /** BBCode → its combos, since code and link are bound on both rows. */
  const combos = new Map<string, Shortcut[]>();

  for (const shortcut of KEYMAP) {
    if (!buttons.has(shortcut.bbcode)) {
      const found = findButton(shortcut.bbcode);
      // A BBCode this surface doesn't have: leave the key alone entirely, so
      // it keeps whatever the browser does with it.
      if (found === null) continue;
      buttons.set(shortcut.bbcode, found);
    }
    combos.set(shortcut.bbcode, [...(combos.get(shortcut.bbcode) ?? []), shortcut]);
  }

  if (buttons.size === 0) return 0;

  // --- discoverability: say so on the buttons themselves ---
  for (const [bbcode, button] of buttons) {
    if (button.hasAttribute(TRIGGER_MARKER)) continue;
    const bound = combos.get(bbcode) ?? [];

    const original = {
      title: button.getAttribute('title'),
      accesskey: button.getAttribute('accesskey'),
      aria: button.getAttribute('aria-keyshortcuts'),
    };
    restore.push(() => {
      setOrRemove(button, 'title', original.title);
      setOrRemove(button, 'accesskey', original.accesskey);
      setOrRemove(button, 'aria-keyshortcuts', original.aria);
      button.removeAttribute(TRIGGER_MARKER);
    });

    const hint = bound.map((shortcut) => formatCombo(shortcut, mac)).join(' / ');
    button.setAttribute(
      'title',
      original.title === null
        ? hint
        : i18n.t('features.editorShortcuts.tooltip', {
            base: original.title,
            combo: hint,
          }),
    );
    button.setAttribute(
      'aria-keyshortcuts',
      bound.map((shortcut) => ariaCombo(shortcut, mac)).join(' '),
    );
    // Drop the accesskey we now shadow: on Chromium, Alt+L would otherwise
    // reach both our handler *and* the native accesskey for the same button.
    // Only buttons we bound lose theirs; the rest keep the surface's behaviour.
    button.removeAttribute('accesskey');
    button.setAttribute(TRIGGER_MARKER, '');
  }

  // --- the shortcuts themselves ---
  textarea.addEventListener(
    'keydown',
    (event) => {
      // Mid-composition (IME) these modifiers mean something else, and a held
      // key would otherwise machine-gun the BBCode.
      if (event.isComposing || event.repeat) return;

      const bbcode = resolveShortcut(event, mac);
      if (bbcode === null) return;
      const button = buttons.get(bbcode);
      if (button === undefined) return;

      // Only now: anything we don't handle must reach the browser untouched.
      event.preventDefault();
      // The click runs the page's own inline handler in the page world. The
      // event came from the focused textarea and we never moved focus, so the
      // selection it reads is exactly the user's.
      button.click();
    },
    { signal: controller.signal },
  );

  return buttons.size;
}
