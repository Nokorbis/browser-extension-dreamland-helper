import { i18n } from '#i18n';
import { mount, unmount } from 'svelte';
import type { Feature } from '../types';
import {
  findFormatButtons,
  findMessageTextarea,
  createFormatButton,
  isDarkTheme,
  watchTheme,
} from '@/lib/phpbb';
import {
  CHAT_BUTTON_CLASS,
  findChatBBCodeContainer,
  findChatTextarea,
} from '@/lib/chatbox';
import {
  insertAtRange,
  planInsertion,
  readSelection,
  type TextRange,
} from '@/lib/textarea';
import { ariaCombo, formatCombo, isMacPlatform, matchesCombo } from '@/lib/keys';
import { createPopover, type Popover } from '@/lib/popover';
import {
  emptyEmojiPrefs,
  loadEmojiPrefs,
  pushRecent,
  saveEmojiPrefs,
  watchEmojiPrefs,
  type EmojiPrefs,
} from '@/lib/emoji-recents';
import { log, warn } from '@/lib/log';
import { loadEmojiData } from './data';
import { createPickerState, type PickerState } from './picker-state.svelte';
import { EMOJI_COMBO } from './shortcut';
import type { EmojiRecord } from './types';
import Picker from './Picker.svelte';

/**
 * Feature #6 — Unicode emoji picker.
 *
 * Both writing surfaces already ship an *image* emoticon set — phpBB's
 * `#smiley-box` in the composer, AJAX Chat's `#emoticonsContainer` in the
 * Tribune — and neither offers plain Unicode emoji. This adds one, reachable
 * from a toolbar button or from Alt+I, on whichever of the two surfaces the
 * page happens to have.
 *
 * Three structural choices worth knowing before editing this file:
 *
 * 1. **Surfaces are enumerated, not detected.** Like editor-shortcuts, this
 *    builds one entry per surface and skips whichever selectors don't resolve.
 *    There is no URL check anywhere — the composer, the homepage shoutbox and
 *    the standalone `/chat/` page all fall out of "does this element exist".
 * 2. **The trigger buttons are plain DOM in the *page*.** Each carries its own
 *    toolbar's classes so it inherits the forum skin; inside a shadow root the
 *    skin could not reach them and they would look pasted on.
 * 3. **The panel is Svelte inside a shadow root**, because it is data-driven —
 *    see docs/adr/0016-svelte-in-content-script.md. The dataset it renders is
 *    fetched lazily rather than bundled (docs/adr/0022-lazy-loaded-data-assets.md).
 *    Anchoring it to the trigger, dismissing it and mounting the shadow root are
 *    not this feature's business: `@/lib/popover` owns all three, shared with
 *    the presets menu (docs/adr/0023-shared-primitives-in-lib.md).
 *
 * ⚠ The composer's button sits inside phpBB's `<form id="postform">`. It **must**
 * stay `type="button"` with no `name`: a submit button there fires a submit
 * event that the exit guard reads as a genuine post, which would send the
 * half-written message. See `src/features/exit-guard/index.ts`.
 */

/** Marks our injected buttons so a re-run (phpBB's "Aperçu") doesn't double up. */
const TRIGGER_MARKER = 'data-dlh-emoji';

/** One writing surface: a textarea, the toolbar to hang a button off, and how to build it. */
interface Surface {
  id: string;
  textarea: HTMLTextAreaElement;
  toolbar: HTMLElement;
  /** The trigger element, styled to match this toolbar's own buttons. */
  createTrigger: (label: string, tooltip: string, aria: string) => HTMLElement;
}

/**
 * phpBB's composer toolbar: a button styled like the skin's own bold/italic ones.
 * `createFormatButton` owns the markup — including the `type="button"` rule in the ⚠
 * above, which it now enforces rather than leaving to whoever edits this next.
 */
function createComposerTrigger(
  label: string,
  tooltip: string,
  aria: string,
): HTMLElement {
  // No `popup:` here — the setup loop sets `aria-haspopup`/`aria-expanded` on whichever
  // trigger a surface produced, so both this and the chat one get it in one place.
  return createFormatButton({
    icon: 'fa-face-smile',
    label,
    tooltip,
    keyshortcuts: aria,
  });
}

/**
 * The chat's toolbar: `<input type="button">` with a text value. Both chat DOM
 * shapes — the homepage shoutbox and the standalone page — share `#bbCodeContainer`
 * and this button style, so one branch covers them. No FontAwesome here: the chat
 * widget is not phpBB and does not load the icon font.
 */
function createChatTrigger(label: string, tooltip: string, aria: string): HTMLElement {
  const button = document.createElement('input');
  button.type = 'button';
  button.className = CHAT_BUTTON_CLASS;
  button.value = label;
  button.title = tooltip;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-keyshortcuts', aria);
  return button;
}

export const emojiPicker = {
  // `as const` so the literal survives inference: `FeatureId` in registry.ts is
  // built from these, and a widened `string` would make it match anything.
  id: 'emoji-picker' as const,
  name: i18n.t('features.emojiPicker.name'),
  description: i18n.t('features.emojiPicker.description'),
  implemented: true,

  setup(ctx) {
    const composerTextarea = findMessageTextarea();
    const composerToolbar = findFormatButtons();
    const chatTextarea = findChatTextarea();
    const chatToolbar = findChatBBCodeContainer();

    const surfaces: Surface[] = [];
    if (composerTextarea !== null && composerToolbar !== null) {
      surfaces.push({
        id: 'composer',
        textarea: composerTextarea,
        toolbar: composerToolbar,
        createTrigger: createComposerTrigger,
      });
    }
    if (chatTextarea !== null && chatToolbar !== null) {
      surfaces.push({
        id: 'chat',
        textarea: chatTextarea,
        toolbar: chatToolbar,
        createTrigger: createChatTrigger,
      });
    }

    if (surfaces.length === 0) {
      // Ordinary on viewtopic, the board index and everywhere else — most pages
      // have no writing surface at all.
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    const mac = isMacPlatform();
    const combo = formatCombo(EMOJI_COMBO, mac);
    const aria = ariaCombo(EMOJI_COMBO, mac);
    const label = i18n.t('features.emojiPicker.trigger.title');
    const tooltip = i18n.t('features.emojiPicker.trigger.tooltip', {
      base: label,
      combo,
    });

    let disposed = false;
    let unwatchPrefs: (() => void) | null = null;
    let unwatchTheme: (() => void) | null = null;
    let prefs: EmojiPrefs = emptyEmojiPrefs();

    /** Everything mounted for one surface, so cleanup can walk it. */
    interface Mounted {
      surface: Surface;
      state: PickerState;
      trigger: HTMLElement;
      /** Assigned at the end of the surface's block, so callbacks reach it lazily. */
      popover: Popover | null;
    }
    const mountedSurfaces: Mounted[] = [];

    // --- shared data: one fetch and one watcher feeding every surface ---
    const applyRecent = (next: EmojiPrefs) => {
      if (disposed) return;
      prefs = next;
      for (const entry of mountedSurfaces) entry.state.recent = next.recent;
    };
    void loadEmojiPrefs().then(applyRecent);
    unwatchPrefs = watchEmojiPrefs(applyRecent);

    // The dataset is ~250 kB and lives outside the bundle, so this is a real
    // network-ish round trip on first use; the panel renders its loading line
    // until it lands.
    void loadEmojiData().then((data) => {
      if (disposed) return;
      for (const entry of mountedSurfaces) {
        entry.state.data = data;
        entry.state.status = data.emoji.length > 0 ? 'ready' : 'failed';
      }
    });

    // --- theme: follow the *forum's* light/dark, not the OS preference ---
    const applyTheme = (dark: boolean) => {
      if (disposed) return;
      for (const entry of mountedSurfaces) entry.state.dark = dark;
    };

    for (const surface of surfaces) {
      if (surface.toolbar.querySelector(`[${TRIGGER_MARKER}]`) !== null) {
        log(`emoji-picker: trigger already present on the ${surface.id}, skipping`);
        continue;
      }

      const state = createPickerState();
      const trigger = surface.createTrigger(label, tooltip, aria);
      trigger.setAttribute(TRIGGER_MARKER, '');
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      surface.toolbar.append(trigger);

      const entry: Mounted = { surface, state, trigger, popover: null };
      mountedSurfaces.push(entry);

      // The selection as it was when the panel was opened. Snapshotted then
      // rather than read at click time, because by then the click may have
      // collapsed it — and because the search box takes focus on open.
      let range: TextRange = { start: 0, end: 0 };

      const close = () => {
        state.open = false;
        trigger.setAttribute('aria-expanded', 'false');
      };

      // Dismissing with the keyboard has to hand focus *back* to the textarea:
      // the panel's search box grabs focus on open, so closing without this
      // leaves focus on a hidden node and the caret nowhere. Deliberately not
      // the same function as `close` — the outside-click handler uses that one,
      // and pulling focus back there would fight the click just made.
      const dismiss = () => {
        close();
        surface.textarea.focus();
      };

      const open = () => {
        range = readSelection(surface.textarea);
        state.tooLong = false;
        state.query = '';
        state.open = true;
        trigger.setAttribute('aria-expanded', 'true');
        entry.popover?.positionSoon();
      };

      const toggle = () => (state.open ? dismiss() : open());

      /** The panel's search box. It lives inside the shadow root. */
      const searchBox = () =>
        entry.popover?.shadow()?.querySelector<HTMLInputElement>('.search') ?? null;

      /** Write the emoji into this surface's textarea and remember it. */
      const insert = (record: EmojiRecord) => {
        // The chat caps messages at 1040 characters, and `insertAtRange` would
        // refuse the write with nothing but a console warning. Ask first so the
        // panel can say why nothing happened.
        const plan = planInsertion(
          surface.textarea.value.length,
          range,
          record.c.length,
          surface.textarea.maxLength,
        );
        if (!plan.ok) {
          state.tooLong = true;
          return;
        }
        state.tooLong = false;

        insertAtRange(surface.textarea, range, record.c, record.c.length);

        // The panel stays open on purpose — picking several emoji in a row is
        // the common case, and only Escape or a click outside closes it. Two
        // things have to be put back before the next pick:
        //
        //  - the range, which the insertion just moved. Read it back off the
        //    textarea rather than computing it, so this stays correct whatever
        //    clamping `insertAtRange` applied. Without it every emoji after the
        //    first would overwrite the one before.
        //  - focus, which `insertAtRange` has to hand to the textarea to run
        //    `execCommand`. Without this the "type a name, press Enter" flow
        //    would type the *next* search into the message itself.
        range = readSelection(surface.textarea);
        searchBox()?.focus();

        // Optimistic locally, then persisted: `watchEmojiPrefs` echoes the write
        // back to every surface, but the panel that was just used should not
        // wait for a storage round trip to show the new recent.
        applyRecent(pushRecent(prefs, record.c));
        void saveEmojiPrefs(prefs).catch((err) => {
          warn('emoji-picker: could not save the recents list', err);
        });

        // The first insertion makes the "Récents" row appear, changing the
        // panel's height — and a panel flipped above its trigger is anchored by
        // its bottom edge, so it would drift without a re-measure.
        entry.popover?.positionSoon();
      };

      // The shortcut listens on the textarea, not the document: it must only
      // answer while someone is actually writing. Same stance as
      // editor-shortcuts, with which this shares `@/lib/keys` — including the
      // `RESERVED_LETTERS` that make `i` safe to claim.
      surface.textarea.addEventListener(
        'keydown',
        (event) => {
          if (event.isComposing || event.repeat) return;
          if (!matchesCombo(event, EMOJI_COMBO, mac)) return;
          event.preventDefault();
          toggle();
        },
        { signal },
      );

      // Anchoring, dismissal and the shadow-root mount are all shared with the
      // presets menu — see `@/lib/popover` and docs/adr/0023. `fit` is on here
      // and off there: the chat toolbar sits at the bottom of the page, so this
      // panel has to be able to flip above its trigger.
      entry.popover = createPopover({
        ctx: ctx.scriptCtx,
        name: `dlh-emoji-picker-${surface.id}`,
        trigger,
        prefix: 'emoji',
        fit: { selector: '.panel' },
        isOpen: () => state.open,
        isDisposed: () => disposed,
        onClose: close,
        onDismiss: dismiss,
        onToggle: toggle,
        render: (container) =>
          mount(Picker, {
            target: container,
            props: { picker: state, onselect: insert, onclose: dismiss },
          }),
        destroy: (app) => void unmount(app),
        signal,
      });

      log(`emoji-picker: trigger injected into the ${surface.id} toolbar`);
    }

    applyTheme(isDarkTheme());
    unwatchTheme = watchTheme(applyTheme);

    return () => {
      disposed = true;
      controller.abort();
      unwatchPrefs?.();
      unwatchTheme?.();
      for (const entry of mountedSurfaces) {
        entry.popover?.remove();
        entry.trigger.remove();
      }
    };
  },
} satisfies Feature;
