import { i18n } from '#i18n';
import { createShadowRootUi, type ShadowRootContentScriptUi } from '#imports';
import { mount, unmount } from 'svelte';
import type { Feature } from '../types';
import {
  findFormatButtons,
  findMessageBox,
  findMessageTextarea,
  createFormatButton,
  followTheme,
} from '@/lib/phpbb';
import { insertAtRange, readSelection, type TextRange } from '@/lib/textarea';
import { loadPresetStore, watchPresetStore, type Preset } from '@/lib/presets';
import { createPopover, type Popover } from '@/lib/popover';
import { log, warn } from '@/lib/log';
import { renderPreset, collectPrompts } from './template';
import { createMenuState } from './menu-state.svelte';
import { createPromptState } from './prompt-state.svelte';
import { loadUiState, saveUiState } from './ui-state';
import Menu from './Menu.svelte';
import Panel from './Panel.svelte';
import PromptDialog from './PromptDialog.svelte';

/**
 * BBCode presets: a toolbar button dropping a nested menu, and a collapsible panel beside
 * the editor. Presets are authored on the options page and live in their own storage key
 * (docs/adr/0012); their placeholder grammar is frozen in docs/adr/0015.
 *
 * Three structural choices worth knowing before editing:
 *
 * 1. **The trigger is plain DOM in the *page*, not a shadow root** — it carries phpBB's own
 *    button classes so it inherits the forum skin, which a shadow root would block.
 * 2. **Menu and panel are Svelte in shadow roots** (docs/adr/0016). Only the *menu* is an
 *    anchored popover and goes through `@/lib/popover`; the panel is an inline block inside
 *    `#message-box` with no positioning, dismissal or Escape, mounted by hand below.
 * 3. **A preset carrying `{PROMPT:label}` fields puts up a form first**, from either
 *    surface — the third popover here, and why `insert` splits into begin and perform.
 *    See docs/adr/0026.
 *
 * ⚠ The button sits inside `<form id="postform">` and **must** stay `type="button"` with no
 * `name`, or the exit guard reads its submit event as a genuine post and sends the
 * half-written message. `createFormatButton` enforces that.
 */

/** Marks our injected button so a re-run (phpBB's "Aperçu") doesn't double up. */
const TRIGGER_MARKER = 'data-dlh-presets';

/** Marks the prompt dialog's invisible anchor. */
const PROMPT_ANCHOR_MARKER = 'data-dlh-preset-prompt';

export const bbcodePresets = {
  id: 'bbcode-presets' as const,
  name: i18n.t('features.bbcodePresets.name'),
  description: i18n.t('features.bbcodePresets.description'),
  implemented: true,

  setup(ctx) {
    // Stage 1 of the degradation ladder: only composer pages have anything to attach to.
    // Everything below is guarded independently, so a missing piece costs one surface.
    if (findMessageTextarea() === null) return;

    const menuState = createMenuState();
    const panelState = createMenuState();
    const promptState = createPromptState();
    const controller = new AbortController();
    const { signal } = controller;

    let disposed = false;
    // Assigned at the end of the menu's block, so its callbacks reach it lazily.
    let menuPopover: Popover | null = null;
    let panelUi: ShadowRootContentScriptUi<Record<string, unknown>> | null = null;
    let promptPopover: Popover | null = null;
    let promptAnchor: HTMLElement | null = null;
    let unwatch: (() => void) | null = null;
    let unwatchTheme: (() => void) | null = null;
    let trigger: HTMLButtonElement | null = null;

    /** The preset waiting on the prompt dialog, or `null` when it isn't up. */
    let pending: Preset | null = null;

    // Snapshotted on open rather than read at click time, because by then the click
    // may have collapsed the selection.
    let range: TextRange = { start: 0, end: 0 };
    let selection = '';

    const snapshotSelection = () => {
      const textarea = findMessageTextarea();
      if (textarea === null) return;
      const snapshot = readSelection(textarea);
      range = { start: snapshot.start, end: snapshot.end };
      selection = snapshot.text;
    };

    /** Shut the menu without touching focus, moving `aria-expanded` with it. */
    const collapseMenu = () => {
      menuState.open = false;
      trigger?.setAttribute('aria-expanded', 'false');
    };

    /** Render the preset with whatever it was given, and write it into the editor. */
    const performInsert = (preset: Preset, answers: Record<string, string>) => {
      const textarea = findMessageTextarea();
      if (textarea === null) return;

      const { text, caretOffset, warnings } = renderPreset({
        body: preset.body,
        selection,
        answers,
      });
      // Warnings never block an insertion — they surface where the preset can still
      // be fixed, in the options-page preview.
      if (warnings.length > 0) {
        log(`preset "${preset.name}" rendered with warnings`, warnings);
      }
      insertAtRange(textarea, range, text, caretOffset);
    };

    const closePrompt = () => {
      promptState.open = false;
      pending = null;
    };

    /** Escape, Annuler, or a click outside: insert nothing at all. */
    const cancelPrompt = () => {
      if (!promptState.open) return;
      closePrompt();
      // The dialog held focus, so hand it back rather than leave it on a hidden
      // node with the caret nowhere.
      findMessageTextarea()?.focus();
    };

    const confirmPrompt = () => {
      const preset = pending;
      if (preset === null) return;
      // Out of the reactive proxy into a plain record: nothing here reaches storage,
      // but the pure engine's inputs should be ordinary values all the same.
      const answers = Object.fromEntries(
        promptState.labels.map((label) => [label, promptState.answers[label] ?? '']),
      );
      closePrompt();
      performInsert(preset, answers);
    };

    /**
     * Insert the preset, asking for its `{PROMPT:…}` fields first if it has any. The
     * selection snapshot survives the wait: any pointerdown outside the dialog dismisses it,
     * so the writer cannot move the caret out from under `range` without cancelling first.
     */
    const beginInsert = (preset: Preset) => {
      const labels = collectPrompts(preset.body);
      // With no prompt surface at all, insert unfilled and let the writer edit in place
      // rather than open a dialog nobody can see.
      if (labels.length === 0 || promptPopover === null) {
        collapseMenu();
        performInsert(preset, {});
        return;
      }

      // `collapseMenu`, not `dismissMenu`: the latter would pull focus back to the
      // textarea just as the dialog is about to take it.
      collapseMenu();
      pending = preset;
      promptState.presetName = preset.name;
      promptState.labels = labels;
      // Always blank: a stale value is worse than an empty field (docs/adr/0026).
      promptState.answers = Object.fromEntries(labels.map((label) => [label, '']));
      promptState.open = true;
      promptPopover.positionSoon();
    };

    // --- data: one load and one watcher feeding both surfaces ---
    const applyStore = (store: Awaited<ReturnType<typeof loadPresetStore>>) => {
      if (disposed) return;
      menuState.store = store;
      panelState.store = store;
    };
    void loadPresetStore()
      .then(applyStore)
      .catch((err: unknown) => {
        warn('bbcode-presets: could not load the presets', err);
      });
    unwatch = watchPresetStore(applyStore);

    // --- theme: follow the *forum's* light/dark, not the OS preference ---
    // CSS cannot read the host page's `html.dark` from a shadow root portably, so the
    // flag is pushed in as state.
    unwatchTheme = followTheme((dark) => {
      if (disposed) return;
      menuState.dark = dark;
      panelState.dark = dark;
      promptState.dark = dark;
    });

    // ------------------------------------------------------------------
    // Surface 1 — the toolbar button and its nested menu
    // ------------------------------------------------------------------
    // Stage 2: the toolbar sits behind {IF S_BBCODE_ALLOWED} and a custom skin may not
    // have it. Skip just this surface; the panel below still mounts.
    const formatButtons = findFormatButtons();
    const alreadyInjected = formatButtons?.querySelector(`[${TRIGGER_MARKER}]`) != null;

    if (formatButtons === null) {
      warn('bbcode-presets: no BBCode toolbar here — menu trigger skipped');
    } else if (alreadyInjected) {
      log('bbcode-presets: trigger already present, skipping');
    } else {
      const label = i18n.t('features.bbcodePresets.trigger.title');
      const button = createFormatButton({ icon: 'fa-magic', label, popup: 'menu' });
      button.setAttribute(TRIGGER_MARKER, '');
      formatButtons.append(button);
      trigger = button;

      // Keyboard dismissal must hand focus *back*: the menu grabs it on open, so closing
      // without this leaves focus on a removed node. Kept separate from `collapseMenu`,
      // which the outside-click path uses — pulling focus there would fight the click.
      const dismissMenu = () => {
        collapseMenu();
        findMessageTextarea()?.focus();
      };

      const openMenu = () => {
        snapshotSelection();
        menuState.open = true;
        button.setAttribute('aria-expanded', 'true');
        menuPopover?.position();
      };

      // No `fit`: the composer toolbar is near the top of the page, so this menu has
      // never needed to flip or clamp.
      menuPopover = createPopover({
        ctx: ctx.scriptCtx,
        name: 'dlh-bbcode-presets',
        trigger: button,
        prefix: 'menu',
        isOpen: () => menuState.open,
        isDisposed: () => disposed,
        onClose: collapseMenu,
        onDismiss: dismissMenu,
        onToggle: () => (menuState.open ? collapseMenu() : openMenu()),
        render: (container) =>
          mount(Menu, {
            target: container,
            props: {
              menu: menuState,
              onselect: beginInsert,
              // Escape/Tab from inside the menu — the path a keyboard user actually
              // takes, so it must restore focus.
              onclose: dismissMenu,
            },
          }),
        destroy: (app) => void unmount(app),
        signal,
      });

      log('bbcode-presets: trigger injected into the BBCode toolbar');
    }

    // ------------------------------------------------------------------
    // Surface 2 — the collapsible panel beside the editor
    // ------------------------------------------------------------------
    // Stage 3: anchor to the message box; `findMessageBox` already falls back to the
    // textarea's parent, so only nothing at all skips this surface.
    const messageBox = findMessageBox();
    if (messageBox === null) {
      warn('bbcode-presets: no editor container found — panel skipped');
    } else {
      void (async () => {
        try {
          const uiState = await loadUiState();
          if (disposed) return;
          panelState.open = uiState.panelExpanded;

          const created = await createShadowRootUi(ctx.scriptCtx, {
            name: 'dlh-bbcode-presets-panel',
            position: 'inline',
            anchor: messageBox,
            // INSIDE #message-box, not a sibling before it: prosilver floats
            // #smiley-box right, so a sibling block would span the fieldset and slide
            // under the emoticon list. See the ⚠ on `findMessageBox`.
            append: 'first',
            onMount: (container) =>
              mount(Panel, {
                target: container,
                props: {
                  panel: panelState,
                  // Safe to read the selection at click time here: the panel's own
                  // mousedown handler prevents the focus loss.
                  onselect: (preset: Preset) => {
                    snapshotSelection();
                    beginInsert(preset);
                  },
                  ontoggle: (expanded: boolean) => {
                    panelState.open = expanded;
                    void saveUiState({ panelExpanded: expanded });
                  },
                },
              }),
            onRemove: (mounted) => {
              if (mounted) void unmount(mounted);
            },
          });
          if (disposed) return;

          panelUi = created;
          panelUi.mount();

          // Neutralise the shadow host's box. WXT leaves it unstyled for
          // `position: 'inline'`, and an unknown element defaults to `display: inline`,
          // whose anonymous block boxes ignore the parent's content box.
          const host = panelUi.shadowHost.style;
          host.display = 'block';
          host.boxSizing = 'border-box';
          host.width = 'auto';
          host.maxWidth = '100%';
          host.margin = '0';
          host.padding = '0';

          // Never steal focus on mount — the writer may already be typing.
        } catch (err) {
          warn('bbcode-presets: could not mount the panel', err);
        }
      })();
    }

    // ------------------------------------------------------------------
    // Surface 3 — the prompt dialog, for presets carrying {PROMPT:…} fields
    // ------------------------------------------------------------------
    // This one is never opened by a click, which makes its anchoring unusual:
    // `createPopover` needs a persistent light-DOM element to insert after, re-measure and
    // allowlist in the outside-click test, and all three obvious candidates fail. The
    // clicked *menu item* is transient and in another shadow root; the *toolbar button*
    // already belongs to the menu, so one click would fire both popovers' `onToggle`; and
    // `#message-box` contains the textarea, so clicking into the message would count as
    // "inside" and leave the dialog open over a caret that has moved.
    //
    // So the anchor is ours: an empty zero-size span nobody can click, parked where the
    // dialog should appear. `onToggle` is a no-op because nothing can activate it.
    // See docs/adr/0026.
    if (trigger !== null || messageBox !== null) {
      const anchor = document.createElement('span');
      anchor.setAttribute(PROMPT_ANCHOR_MARKER, '');
      anchor.setAttribute('aria-hidden', 'true');
      anchor.style.display = 'inline-block';
      anchor.style.width = '0';
      anchor.style.height = '0';

      // Under the toolbar button when there is one, so the dialog opens where the menu
      // just was; otherwise at the top of the editor container.
      if (trigger !== null) trigger.after(anchor);
      else messageBox?.prepend(anchor);
      promptAnchor = anchor;

      promptPopover = createPopover({
        ctx: ctx.scriptCtx,
        name: 'dlh-bbcode-presets-prompt',
        trigger: anchor,
        prefix: 'prompt',
        // `fit` on, unlike the menu: a form is as tall as it has fields, and the
        // panel-only anchor can sit well down the page.
        fit: { selector: '.prompt' },
        isOpen: () => promptState.open,
        isDisposed: () => disposed,
        // Outside click closes, inserts nothing and leaves focus where the click put
        // it; Escape arrives through `onDismiss` and hands focus back.
        onClose: closePrompt,
        onDismiss: cancelPrompt,
        onToggle: () => {},
        render: (container) =>
          mount(PromptDialog, {
            target: container,
            props: {
              prompt: promptState,
              onconfirm: confirmPrompt,
              oncancel: cancelPrompt,
            },
          }),
        destroy: (app) => void unmount(app),
        signal,
      });
    } else {
      warn(
        'bbcode-presets: nowhere to anchor the prompt dialog — presets insert unfilled',
      );
    }

    return () => {
      disposed = true;
      controller.abort();
      unwatch?.();
      unwatchTheme?.();
      menuPopover?.remove();
      panelUi?.remove();
      promptPopover?.remove();
      promptAnchor?.remove();
      trigger?.remove();
    };
  },
} satisfies Feature;
