import { i18n } from '#i18n';
import { createShadowRootUi, type ShadowRootContentScriptUi } from '#imports';
import { mount, unmount } from 'svelte';
import type { Feature } from '../types';
import {
  findFormatButtons,
  findMessageBox,
  findMessageTextarea,
  createFormatButton,
  isDarkTheme,
  watchTheme,
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
 * Feature #3 — BBCode presets.
 *
 * Two ways into the same library, both inserting into phpBB's composer and
 * wrapping whatever was selected:
 *
 * - a button in phpBB's BBCode toolbar that drops down a nested menu, and
 * - a collapsible panel pinned beside the editor.
 *
 * Presets are authored in the extension's options page and live in their own
 * storage key (docs/adr/0012-feature-owned-data-stores.md); the placeholder
 * grammar they use is frozen in docs/adr/0015-preset-placeholder-syntax.md.
 *
 * Two structural choices worth knowing before editing this file:
 *
 * 1. **The trigger button is plain DOM in the *page*, not in a shadow root.**
 *    It carries phpBB's own `button` classes so it inherits the forum skin —
 *    inside a shadow root the skin cannot reach it and it would look foreign.
 * 2. **The menu and panel are Svelte inside shadow roots**, because both are
 *    data-driven and recursive. See docs/adr/0016-svelte-in-content-script.md.
 *    Only the *menu* is an anchored popover, so only it goes through
 *    `@/lib/popover` (shared with the emoji picker — docs/adr/0023); the panel
 *    is an inline block inside `#message-box` with no positioning, no outside-
 *    click dismissal and no Escape, and is mounted by hand below.
 * 3. **A preset carrying `{PROMPT:label}` fields is not inserted straight away**
 *    — it puts up a small form first, from either surface. That is the third
 *    popover here, and the reason `insert` is split into "begin" and "perform".
 *    See docs/adr/0026-prompted-preset-placeholders.md.
 *
 * ⚠ The button sits inside phpBB's `<form id="postform">`. It **must** stay
 * `type="button"` with no `name`: a submit button here fires a submit event that
 * the exit guard reads as a genuine post, which would send the half-written
 * message. See `src/features/exit-guard/index.ts`.
 */

/** Marks our injected button so a re-run (phpBB's "Aperçu") doesn't double up. */
const TRIGGER_MARKER = 'data-dlh-presets';

/** Marks the prompt dialog's invisible anchor, so it is recognisable in the DOM. */
const PROMPT_ANCHOR_MARKER = 'data-dlh-preset-prompt';

export const bbcodePresets = {
  // `as const` so the literal survives inference: `FeatureId` in registry.ts is
  // built from these, and a widened `string` would make it match anything.
  id: 'bbcode-presets' as const,
  name: i18n.t('features.bbcodePresets.name'),
  description: i18n.t('features.bbcodePresets.description'),
  implemented: true,

  setup(ctx) {
    // Stage 1 of the degradation ladder: only composer pages have anything to
    // attach to. Everything below is independently guarded so a missing piece
    // costs one surface, never the whole feature.
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

    // The selection as it was when the menu or panel was last interacted with.
    // Snapshotted on open rather than read at click time, because by then the
    // click may have collapsed it.
    let range: TextRange = { start: 0, end: 0 };
    let selection = '';

    const snapshotSelection = () => {
      const textarea = findMessageTextarea();
      if (textarea === null) return;
      const snapshot = readSelection(textarea);
      range = { start: snapshot.start, end: snapshot.end };
      selection = snapshot.text;
    };

    /**
     * Shut the menu without touching focus. Defined up here rather than inside
     * the menu's own block because the insertion path below needs it, and the
     * `aria-expanded` on the trigger has to move with it.
     */
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
      // Warnings never block an insertion — they are surfaced where the preset
      // can still be fixed, in the options-page preview.
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
      // The dialog held focus, so hand it back rather than leaving it on a
      // hidden node with the caret nowhere — same reasoning as `dismissMenu`.
      findMessageTextarea()?.focus();
    };

    const confirmPrompt = () => {
      const preset = pending;
      if (preset === null) return;
      // Copy the answers out of the reactive proxy into a plain record before
      // handing them to the pure engine. Nothing here reaches storage, but the
      // engine's inputs should be ordinary values all the same.
      const answers = Object.fromEntries(
        promptState.labels.map((label) => [label, promptState.answers[label] ?? '']),
      );
      closePrompt();
      performInsert(preset, answers);
    };

    /**
     * Shared by both surfaces: insert the preset, asking for its `{PROMPT:…}`
     * fields first if it has any.
     *
     * The selection snapshot survives the wait: any pointerdown outside the
     * dialog dismisses it, so the writer cannot move the caret out from under
     * `range` without cancelling first.
     */
    const beginInsert = (preset: Preset) => {
      const labels = collectPrompts(preset.body);
      // No prompt surface (no toolbar *and* no editor container) degrades to
      // the pre-0026 behaviour — insert unfilled and let the writer edit in
      // place — rather than opening a dialog nobody can see.
      if (labels.length === 0 || promptPopover === null) {
        collapseMenu();
        performInsert(preset, {});
        return;
      }

      // Deliberately `collapseMenu`, not `dismissMenu`: the latter would pull
      // focus back to the textarea just as the dialog is about to take it.
      collapseMenu();
      pending = preset;
      promptState.presetName = preset.name;
      promptState.labels = labels;
      // Always blank. Remembering the last answers would need a store of its
      // own, and a stale value is worse than an empty field (docs/adr/0026).
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
    void loadPresetStore().then(applyStore);
    unwatch = watchPresetStore(applyStore);

    // --- theme: follow the *forum's* light/dark, not the OS preference ---
    // Both surfaces render inside shadow roots, where CSS cannot read the host
    // page's `html.dark` portably, so the flag is pushed in as state.
    const applyTheme = (dark: boolean) => {
      if (disposed) return;
      menuState.dark = dark;
      panelState.dark = dark;
      promptState.dark = dark;
    };
    applyTheme(isDarkTheme());
    unwatchTheme = watchTheme(applyTheme);

    // ------------------------------------------------------------------
    // Surface 1 — the toolbar button and its nested menu
    // ------------------------------------------------------------------
    // Stage 2: the toolbar sits behind {IF S_BBCODE_ALLOWED} and a custom skin
    // may not have it. Skip just this surface; the panel below still mounts.
    const formatButtons = findFormatButtons();
    const alreadyInjected = formatButtons?.querySelector(`[${TRIGGER_MARKER}]`) != null;

    if (formatButtons === null) {
      warn('bbcode-presets: no BBCode toolbar here — menu trigger skipped');
    } else if (alreadyInjected) {
      log('bbcode-presets: trigger already present, skipping');
    } else {
      const label = i18n.t('features.bbcodePresets.trigger.title');
      // `createFormatButton` owns the markup, including the `type="button"` rule in the
      // ⚠ above — which it enforces structurally rather than leaving it to be remembered.
      const button = createFormatButton({ icon: 'fa-magic', label, popup: 'menu' });
      button.setAttribute(TRIGGER_MARKER, '');
      formatButtons.append(button);
      trigger = button;

      // Dismissing with the keyboard has to hand focus *back* to the composer:
      // the menu grabs focus on open (see Menu.svelte), so closing it without
      // this leaves focus on a removed node and the caret nowhere.
      // Deliberately not the same function as collapseMenu — the outside-click
      // handler uses that one, and pulling focus back there would fight the
      // click the user just made.
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

      // Anchoring, dismissal and the shadow-root mount are all shared with the
      // emoji picker's panel — see `@/lib/popover` and docs/adr/0023. No `fit`
      // here: the composer toolbar is near the top of the page, so this menu has
      // never needed to flip above its trigger or clamp its left edge, and
      // turning fitting on would change long-settled behaviour for no reported
      // problem.
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
              // Escape/Tab from inside the menu — must restore focus, since
              // this is the path that actually runs for a keyboard user.
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
    // Stage 3: anchor to the message box, falling back to the textarea's own
    // parent inside findMessageBox(). Only if there is nothing at all do we skip.
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
            // INSIDE #message-box, above the textarea — not as a sibling before
            // it. prosilver floats #smiley-box to the right and lets
            // #message-box take the remaining column, so a sibling block would
            // span the whole fieldset and slide under the emoticon list. As the
            // first child it simply inherits the textarea's own content box, at
            // whatever width the skin gives it.
            append: 'first',
            onMount: (container) =>
              mount(Panel, {
                target: container,
                props: {
                  panel: panelState,
                  // Reading the selection at click time is safe here: the
                  // panel's own mousedown handler prevents the focus loss.
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

          // Neutralise the shadow host's own box. WXT leaves it unstyled for
          // `position: 'inline'`, and an unknown custom element defaults to
          // `display: inline` — an inline host wrapping block content generates
          // anonymous block boxes that ignore the parent's content box. As a
          // plain block inside #message-box it lines up with the textarea.
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
    // Unlike the other two this one is never opened by a click, which is what
    // makes its anchoring unusual. `createPopover` wants a persistent light-DOM
    // element: it inserts the shadow host after it, re-measures it on scroll and
    // resize, and allowlists it in the outside-click test. Three candidates,
    // two of them wrong:
    //
    //  - the *menu item* that was clicked (what the design note first sketched)
    //    is transient and lives in another shadow root — it is gone by the time
    //    the dialog is up;
    //  - the *toolbar button* already belongs to the menu, so a single click
    //    would fire both popovers' `onToggle`;
    //  - `#message-box` contains the textarea, so `composedPath()` would treat
    //    clicking into the message as "inside", leaving the dialog open over a
    //    caret that has since moved.
    //
    // So the anchor is an element of our own: an empty, zero-size span nobody
    // can click, parked where the dialog should appear. `onToggle` is a no-op
    // because nothing can activate it. See docs/adr/0026.
    if (trigger !== null || messageBox !== null) {
      const anchor = document.createElement('span');
      anchor.setAttribute(PROMPT_ANCHOR_MARKER, '');
      anchor.setAttribute('aria-hidden', 'true');
      anchor.style.display = 'inline-block';
      anchor.style.width = '0';
      anchor.style.height = '0';

      // Under the toolbar button when there is one, so the dialog opens where
      // the menu just was; otherwise at the top of the editor container.
      if (trigger !== null) trigger.after(anchor);
      else messageBox?.prepend(anchor);
      promptAnchor = anchor;

      promptPopover = createPopover({
        ctx: ctx.scriptCtx,
        name: 'dlh-bbcode-presets-prompt',
        trigger: anchor,
        prefix: 'prompt',
        // `fit` on, unlike the menu: a form is as tall as it has fields, and
        // the panel-only anchor can sit well down the page.
        fit: { selector: '.prompt' },
        isOpen: () => promptState.open,
        isDisposed: () => disposed,
        // Outside click: close, insert nothing, and leave focus where the click
        // put it. Escape comes through `onDismiss` and hands focus back.
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
      warn('bbcode-presets: nowhere to anchor the prompt dialog — presets insert unfilled');
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
