import { i18n } from '#i18n';
import { chromeFor, createShadowHost, MAX_Z, styled, SYSTEM_FONT } from '@/lib/shadow-ui';

/**
 * The highlight feature's own in-page control: the corner pill offering "clear this
 * discussion" and "clear everything". The *selection toolbar* moved to
 * `@/lib/selection-toolbar` (docs/adr/0028); `colorLabel` stayed because it is highlight's
 * own vocabulary, naming the swatches the feature registers.
 *
 * A dumb view — the feature owns the store and wires the callbacks. Vanilla rather than
 * Svelte, being small and static (docs/adr/0016): a Shadow DOM host with `all:initial` to
 * fence off phpBB's CSS, styled through `.style` and never an injected `<style>`, with the
 * forum's theme pushed in via `setDark`.
 */

/**
 * A switch, not a templated key, so every `i18n.t` argument is a literal the typed catalogue
 * can check; an unknown id degrades to the raw id rather than failing the build.
 */
export function colorLabel(id: string): string {
  switch (id) {
    case 'yellow':
      return i18n.t('features.highlight.colors.yellow');
    case 'green':
      return i18n.t('features.highlight.colors.green');
    case 'pink':
      return i18n.t('features.highlight.colors.pink');
    case 'blue':
      return i18n.t('features.highlight.colors.blue');
    default:
      return id;
  }
}

// ---------------------------------------------------------------------------
// Clear control
// ---------------------------------------------------------------------------

export interface ClearControlHandlers {
  onClearTopic: () => void;
  onClearAll: () => void;
}

export interface ClearControl {
  /** Reflect current state; hides itself entirely when `count` is 0. */
  update(state: { count: number; hasTopic: boolean }): void;
  setDark(dark: boolean): void;
  destroy(): void;
}

export function createClearControl(handlers: ClearControlHandlers): ClearControl {
  let chrome = chromeFor(false);
  let expanded = false;

  const { host, shadow } = createShadowHost();

  const root = styled(
    document.createElement('div'),
    'position:fixed;right:12px;bottom:12px;z-index:' +
      MAX_Z +
      ';display:none;flex-direction:column;align-items:flex-end;gap:6px;' +
      `font:13px/1.2 ${SYSTEM_FONT};`,
  );

  const menu = styled(
    document.createElement('div'),
    'display:none;flex-direction:column;gap:4px;padding:6px;border-radius:8px;',
  );

  const mkMenuButton = (text: string, onClick: () => void) => {
    const btn = styled(
      document.createElement('button'),
      'cursor:pointer;text-align:left;white-space:nowrap;padding:6px 10px;' +
        'border-radius:6px;background:transparent;font:inherit;',
    );
    btn.type = 'button';
    btn.textContent = text;
    btn.addEventListener('click', () => {
      collapse();
      onClick();
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.background = chrome.hover;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });
    return btn;
  };

  const clearTopicBtn = mkMenuButton(
    i18n.t('features.highlight.control.clearTopic'),
    handlers.onClearTopic,
  );
  const clearAllBtn = mkMenuButton(
    i18n.t('features.highlight.control.clearAll'),
    handlers.onClearAll,
  );
  menu.append(clearTopicBtn, clearAllBtn);

  const toggle = styled(
    document.createElement('button'),
    'cursor:pointer;padding:7px 12px;border-radius:999px;font:inherit;' +
      'display:inline-flex;align-items:center;gap:6px;',
  );
  toggle.type = 'button';
  const toggleLabel = document.createElement('span');
  toggle.append(document.createTextNode('🖍'), toggleLabel);

  // ⚠ Hoisted `function`, not a `const`: `mkMenuButton` wires this into a click handler
  // before this point. Hoisting makes that safe by construction rather than by luck.
  function collapse() {
    expanded = false;
    menu.style.display = 'none';
    toggle.setAttribute('aria-expanded', 'false');
  }
  const openMenu = () => {
    expanded = true;
    menu.style.display = 'flex';
    toggle.setAttribute('aria-expanded', 'true');
  };
  toggle.setAttribute('aria-haspopup', 'menu');
  collapse();
  toggle.addEventListener('click', () => (expanded ? collapse() : openMenu()));

  // Targets inside a shadow root are retargeted to the host, so composedPath is the
  // only reliable containment test.
  const onDocPointerDown = (event: Event) => {
    if (!expanded) return;
    if (event.composedPath().includes(host)) return;
    collapse();
  };
  document.addEventListener('pointerdown', onDocPointerDown, true);

  root.append(menu, toggle);
  shadow.append(root);

  const paint = () => {
    menu.style.background = chrome.surface;
    menu.style.border = `1px solid ${chrome.border}`;
    menu.style.boxShadow = `0 6px 20px ${chrome.shadow}`;
    for (const btn of [clearTopicBtn, clearAllBtn]) btn.style.color = chrome.fg;
    toggle.style.background = chrome.surface;
    toggle.style.border = `1px solid ${chrome.border}`;
    toggle.style.color = chrome.fg;
    toggle.style.boxShadow = `0 3px 12px ${chrome.shadow}`;
  };
  paint();

  return {
    update({ count, hasTopic }) {
      if (count <= 0) {
        collapse();
        root.style.display = 'none';
        if (host.isConnected) host.remove();
        return;
      }
      if (!host.isConnected) document.body.append(host);
      root.style.display = 'flex';
      clearTopicBtn.style.display = hasTopic ? 'block' : 'none';
      toggleLabel.textContent = i18n.t('features.highlight.control.count', count);
    },
    setDark(dark) {
      chrome = chromeFor(dark);
      paint();
    },
    destroy() {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      host.remove();
    },
  };
}
