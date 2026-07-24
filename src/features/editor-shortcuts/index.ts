import { i18n } from '#i18n';
import type { Feature } from '../types';
import {
  findFormatButton,
  findFormatButtons,
  findMessageTextarea,
} from '@/lib/phpbb';
import { log, warn } from '@/lib/log';
import {
  ariaCombo,
  formatCombo,
  isMacPlatform,
  KEYMAP,
  resolveShortcut,
  type Shortcut,
} from './keymap';

/**
 * Feature #5 — Keyboard shortcuts for the BBCode toolbar.
 *
 * phpBB's composer is mouse-first: ten of its buttons carry an `accesskey`, but
 * the combo that triggers one differs per browser (Alt on Chromium, Alt+Shift on
 * Firefox, Ctrl+Option on macOS), and the forum's *custom* BBCodes — center,
 * justify, mp3, s, spoiler — carry none at all. This feature puts one consistent
 * set of shortcuts over the whole row.
 *
 * Two things define how it works, both settled in
 * docs/adr/0017-keyboard-shortcuts-delegate-to-toolbar.md:
 *
 * 1. **It clicks the forum's own buttons.** Nothing here inserts text. Their
 *    inline `onclick="bbstyle(n)"` is a listener on the page's node, so a
 *    dispatched click runs phpBB's own handler even though the content script
 *    lives in an isolated world and cannot call `bbstyle` itself. A shortcut
 *    therefore does exactly what clicking does — including for any BBCode the
 *    admins add later, which we never have to learn about.
 * 2. **The listener is on the textarea**, not the document, so these overrides
 *    exist only while composing. Outside the editor every key keeps its browser
 *    meaning, and inside it `preventDefault()` happens only once a binding has
 *    actually matched.
 *
 * The map and the matching rules live in `./keymap.ts`; this file is DOM work.
 */

/** Marks a button we have already annotated, so a re-run can't double the hint. */
const MARKER = 'data-dlh-shortcut';

export const editorShortcuts: Feature = {
  id: 'editor-shortcuts',
  name: i18n.t('features.editorShortcuts.name'),
  description: i18n.t('features.editorShortcuts.description'),
  implemented: true,

  setup() {
    const textarea = findMessageTextarea();
    if (textarea === null) return; // not a composer page
    if (findFormatButtons() === null) {
      // The toolbar sits behind {IF S_BBCODE_ALLOWED}; with no buttons there is
      // nothing to be a shortcut *to*.
      warn('editor-shortcuts: no BBCode toolbar here — nothing to bind');
      return;
    }

    const mac = isMacPlatform();
    const controller = new AbortController();
    /** BBCode → the live button, for every binding this forum actually has. */
    const buttons = new Map<string, HTMLElement>();
    /** BBCode → its combos, since code and link are bound on both rows. */
    const combos = new Map<string, Shortcut[]>();

    for (const shortcut of KEYMAP) {
      let button = buttons.get(shortcut.bbcode);
      if (button === undefined) {
        const found = findFormatButton(shortcut.bbcode);
        // A BBCode this forum doesn't have: leave the key alone entirely, so it
        // keeps whatever the browser does with it.
        if (found === null) continue;
        button = found;
        buttons.set(shortcut.bbcode, found);
      }
      combos.set(shortcut.bbcode, [...(combos.get(shortcut.bbcode) ?? []), shortcut]);
    }

    if (buttons.size === 0) {
      warn('editor-shortcuts: toolbar found but none of its buttons matched');
      return;
    }

    // --- discoverability: say so on the buttons themselves ---
    const restore: Array<() => void> = [];

    for (const [bbcode, button] of buttons) {
      if (button.hasAttribute(MARKER)) continue;
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
        button.removeAttribute(MARKER);
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
      // Only buttons we bound lose theirs; the rest keep phpBB's behaviour.
      button.removeAttribute('accesskey');
      button.setAttribute(MARKER, '');
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
        // The click runs phpBB's inline handler in the page world. The event
        // came from the focused textarea and we never moved focus, so the
        // selection bbstyle() is about to read is exactly the user's.
        button.click();
      },
      { signal: controller.signal },
    );

    log(
      `editor-shortcuts: ${buttons.size} buttons bound (${mac ? 'macOS' : 'Ctrl/Alt'} layout)`,
    );

    return () => {
      controller.abort();
      for (const undo of restore) undo();
    };
  },
};

/** Put an attribute back exactly as it was — absent if it was absent. */
function setOrRemove(el: HTMLElement, name: string, value: string | null): void {
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}
