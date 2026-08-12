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
import { renderPreset } from './template';
import { createMenuState } from './menu-state.svelte';
import { loadUiState, saveUiState } from './ui-state';
import Menu from './Menu.svelte';
import Panel from './Panel.svelte';

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
 *
 * ⚠ The button sits inside phpBB's `<form id="postform">`. It **must** stay
 * `type="button"` with no `name`: a submit button here fires a submit event that
 * the exit guard reads as a genuine post, which would send the half-written
 * message. See `src/features/exit-guard/index.ts`.
 */

/** Marks our injected button so a re-run (phpBB's "Aperçu") doesn't double up. */
const TRIGGER_MARKER = 'data-dlh-presets';

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
    const controller = new AbortController();
    const { signal } = controller;

    let disposed = false;
    // Assigned at the end of the menu's block, so its callbacks reach it lazily.
    let menuPopover: Popover | null = null;
    let panelUi: ShadowRootContentScriptUi<Record<string, unknown>> | null = null;
    let unwatch: (() => void) | null = null;
    let unwatchTheme: (() => void) | null = null;
    let trigger: HTMLButtonElement | null = null;

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

    /** Shared by both surfaces: render the preset and write it into the editor. */
    const insert = (preset: Preset) => {
      const textarea = findMessageTextarea();
      if (textarea === null) return;

      const { text, caretOffset, warnings } = renderPreset({
        body: preset.body,
        selection,
      });
      // Warnings never block an insertion — they are surfaced where the preset
      // can still be fixed, in the options-page preview.
      if (warnings.length > 0) {
        log(`preset "${preset.name}" rendered with warnings`, warnings);
      }
      insertAtRange(textarea, range, text, caretOffset);
      menuState.open = false;
      trigger?.setAttribute('aria-expanded', 'false');
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

      const closeMenu = () => {
        menuState.open = false;
        button.setAttribute('aria-expanded', 'false');
      };

      // Dismissing with the keyboard has to hand focus *back* to the composer:
      // the menu grabs focus on open (see Menu.svelte), so closing it without
      // this leaves focus on a removed node and the caret nowhere.
      // Deliberately not the same function as closeMenu — the outside-click
      // handler uses that one, and pulling focus back there would fight the
      // click the user just made.
      const dismissMenu = () => {
        closeMenu();
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
        onClose: closeMenu,
        onDismiss: dismissMenu,
        onToggle: () => (menuState.open ? closeMenu() : openMenu()),
        render: (container) =>
          mount(Menu, {
            target: container,
            props: {
              menu: menuState,
              onselect: insert,
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
                    insert(preset);
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

    return () => {
      disposed = true;
      controller.abort();
      unwatch?.();
      unwatchTheme?.();
      menuPopover?.remove();
      panelUi?.remove();
      trigger?.remove();
    };
  },
} satisfies Feature;
