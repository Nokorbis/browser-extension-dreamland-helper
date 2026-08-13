/**
 * The reply page's layout controls. A dumb view: the feature owns the store and passes
 * callbacks in. Vanilla `.style` on plain nodes rather than Svelte, being small and static
 * (docs/adr/0016), following the forum's theme through `setDark`.
 *
 * ⚠ Mounted **outside `<form id="postform">`**, above it. Inside, a `name` would be POSTed and
 * anything not `type="button"` would submit; keeping the whole control out makes both hazards
 * unreachable rather than remembered. The inputs sit in a shadow root besides, so they are
 * form controls of nothing.
 */
import { i18n } from '#i18n';
import type { ComposerSide, LayoutPrefs } from '@/lib/composer-layout';
import { createShadowHost, styled, SYSTEM_FONT, themed } from '@/lib/shadow-ui';

export interface LayoutControlHandlers {
  onReverseOrder: (value: boolean) => void;
  onSideBySide: (value: boolean) => void;
  onFullWidth: (value: boolean) => void;
  onComposerSide: (side: ComposerSide) => void;
}

export interface LayoutControls {
  /** Reflect the stored prefs — also called when another tab changes them. */
  update(prefs: LayoutPrefs): void;
  setDark(dark: boolean): void;
  destroy(): void;
}

/** Mounts the bar immediately before `anchor` (the composer form). */
export function createLayoutControls(
  anchor: HTMLElement,
  handlers: LayoutControlHandlers,
): LayoutControls {
  const theme = themed();
  const { host, shadow } = createShadowHost();
  host.style.display = 'block';

  const root = styled(
    document.createElement('div'),
    'display:flex;align-items:center;flex-wrap:wrap;gap:6px 16px;' +
      'margin:0 0 8px;padding:6px 10px;border-radius:8px;' +
      `font:13px/1.4 ${SYSTEM_FONT};`,
  );
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', i18n.t('features.composerLayout.name'));

  const mkLabel = (): HTMLLabelElement =>
    styled(
      document.createElement('label'),
      'display:inline-flex;align-items:center;gap:6px;cursor:pointer;',
    );

  const mkCheckbox = (text: string, onToggle: (value: boolean) => void) => {
    const label = mkLabel();
    const input = document.createElement('input');
    input.type = 'checkbox'; // deliberately no `name` — see the header note
    input.addEventListener('change', () => onToggle(input.checked));
    const caption = document.createElement('span');
    caption.textContent = text;
    label.append(input, caption);
    return { label, input };
  };

  const reverse = mkCheckbox(
    i18n.t('features.composerLayout.controls.reverseOrder'),
    handlers.onReverseOrder,
  );
  const sideBySide = mkCheckbox(
    i18n.t('features.composerLayout.controls.sideBySide'),
    handlers.onSideBySide,
  );
  const fullWidth = mkCheckbox(
    i18n.t('features.composerLayout.controls.fullWidth'),
    handlers.onFullWidth,
  );

  // The side picker only means anything while the columns are side by side, so it
  // appears with them rather than sitting there inert.
  const sideGroup = styled(
    document.createElement('span'),
    'display:none;align-items:center;gap:10px;',
  );
  const sideCaption = document.createElement('span');
  sideCaption.textContent = i18n.t('features.composerLayout.controls.editorSide');
  sideGroup.append(sideCaption);

  const mkRadio = (side: ComposerSide, text: string) => {
    const label = mkLabel();
    const input = document.createElement('input');
    input.type = 'radio';
    // A `name` is safe here and does the grouping: these live in a shadow root outside
    // the form, so they are not form controls of `#postform`.
    input.name = 'dlh-composer-side';
    input.addEventListener('change', () => {
      if (input.checked) handlers.onComposerSide(side);
    });
    const caption = document.createElement('span');
    caption.textContent = text;
    label.append(input, caption);
    sideGroup.append(label);
    return input;
  };

  const leftRadio = mkRadio('left', i18n.t('features.composerLayout.controls.left'));
  const rightRadio = mkRadio('right', i18n.t('features.composerLayout.controls.right'));

  root.append(reverse.label, sideBySide.label, fullWidth.label, sideGroup);
  shadow.append(root);
  anchor.parentElement?.insertBefore(host, anchor);

  theme.paints((chrome) => {
    root.style.background = chrome.surface;
    root.style.border = `1px solid ${chrome.border}`;
    root.style.color = chrome.fg;
    sideCaption.style.color = chrome.muted;
  });

  return {
    update(prefs) {
      reverse.input.checked = prefs.reverseOrder;
      sideBySide.input.checked = prefs.sideBySide;
      fullWidth.input.checked = prefs.fullWidth;
      leftRadio.checked = prefs.composerSide === 'left';
      rightRadio.checked = prefs.composerSide === 'right';
      sideGroup.style.display = prefs.sideBySide ? 'inline-flex' : 'none';
    },
    setDark: theme.setDark,
    destroy() {
      host.remove();
    },
  };
}
