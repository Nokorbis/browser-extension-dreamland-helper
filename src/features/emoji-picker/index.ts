import { i18n } from '#i18n';
import { mount, unmount } from 'svelte';
import type { Feature } from '../types';
import {
  findFormatButtons,
  findMessageTextarea,
  createFormatButton,
  followTheme,
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
 * A Unicode emoji picker for both writing surfaces, from a toolbar button or Alt+I. Distinct
 * from the *image* emoticon sets both already ship (`#smiley-box`, `#emoticonsContainer`).
 *
 * Three structural choices worth knowing before editing:
 *
 * 1. **Surfaces are enumerated, not detected** — one entry per surface, each skipped when
 *    its selectors don't resolve. There is no URL check anywhere.
 * 2. **The triggers are plain DOM in the *page***, each carrying its own toolbar's classes
 *    so it inherits the skin, which a shadow root would block.
 * 3. **The panel is Svelte in a shadow root** (docs/adr/0016) rendering a dataset fetched
 *    lazily rather than bundled (docs/adr/0022). Anchoring, dismissal and the mount belong
 *    to `@/lib/popover`, shared with the presets menu (docs/adr/0023).
 *
 * ⚠ The composer's button sits inside `<form id="postform">` and **must** stay
 * `type="button"` with no `name`, or the exit guard reads its submit event as a genuine post
 * and sends the half-written message. `createFormatButton` enforces that.
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

function createComposerTrigger(
  label: string,
  tooltip: string,
  aria: string,
): HTMLElement {
  // No `popup:` — the setup loop sets `aria-haspopup`/`aria-expanded` on whichever
  // trigger a surface produced, so this and the chat one get it in one place.
  return createFormatButton({
    icon: 'fa-face-smile',
    label,
    tooltip,
    keyshortcuts: aria,
  });
}

/**
 * Both chat DOM shapes share `#bbCodeContainer` and this button style, so one branch covers
 * them. No FontAwesome: the chat widget is not phpBB and does not load the icon font.
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
      // Ordinary: most pages have no writing surface at all.
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
    void loadEmojiPrefs()
      .then(applyRecent)
      .catch((err: unknown) => {
        warn('emoji-picker: could not load the recents list', err);
      });
    unwatchPrefs = watchEmojiPrefs(applyRecent);

    // ~250 kB outside the bundle, so a real round trip on first use; the panel renders
    // its loading line until it lands.
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
    // Wired after the surfaces are mounted, below — `mountedSurfaces` is empty here.

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

      // Snapshotted on open rather than read at click time: by then the click may have
      // collapsed the selection, and the search box has taken focus.
      let range: TextRange = { start: 0, end: 0 };

      const close = () => {
        state.open = false;
        trigger.setAttribute('aria-expanded', 'false');
      };

      // Keyboard dismissal must hand focus *back*: the search box grabs it on open, so
      // closing without this leaves focus on a hidden node. Kept separate from `close`,
      // which the outside-click path uses — pulling focus there would fight the click.
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

      const searchBox = () =>
        entry.popover?.shadow()?.querySelector<HTMLInputElement>('.search') ?? null;

      const insert = (record: EmojiRecord) => {
        // The chat caps messages at 1040 characters, and `insertAtRange` would refuse
        // the write with only a console warning. Ask first, so the panel can say why
        // nothing happened.
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

        // ⚠ The panel stays open on purpose — picking several emoji in a row is the
        // common case — so two things must be put back before the next pick. The range,
        // read back off the textarea rather than computed so it survives whatever
        // clamping `insertAtRange` applied; without it every emoji after the first
        // overwrites the one before. And focus, which `insertAtRange` took to run
        // `execCommand`; without it the next search is typed into the message.
        range = readSelection(surface.textarea);
        searchBox()?.focus();

        // Optimistic locally, then persisted: `watchEmojiPrefs` echoes the write back to
        // every surface, but this panel shouldn't wait for a round trip to show it. The
        // value is bound here rather than re-read: `applyRecent` leaves `prefs` untouched
        // once disposed, and would then persist the list from before this pick.
        const next = pushRecent(prefs, record.c);
        applyRecent(next);
        void saveEmojiPrefs(next).catch((err) => {
          warn('emoji-picker: could not save the recents list', err);
        });

        // The first insertion makes the "Récents" row appear, changing the panel's
        // height — and one flipped above its trigger is anchored by its bottom edge,
        // so it would drift without a re-measure.
        entry.popover?.positionSoon();
      };

      // On the textarea, not the document: the shortcut must only answer while someone
      // is actually writing.
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

      // `fit` on, unlike the presets menu: the chat toolbar sits at the bottom of the
      // page, so this panel has to be able to flip above its trigger.
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

    unwatchTheme = followTheme(applyTheme);

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
