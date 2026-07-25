import { i18n } from '#i18n';
import {
  chromeFor,
  createShadowHost,
  MAX_Z,
  styled,
  SYSTEM_FONT,
} from '@/lib/shadow-ui';
import { HIGHLIGHT_COLORS } from './palette';

/**
 * The two vanilla in-page controls for the highlight feature:
 *
 * - a **selection toolbar** — a small row of colour swatches (plus an eraser
 *   when the selection overlaps an existing highlight) that floats above a
 *   selection inside a post, and
 * - a **clear control** — a corner pill offering "clear this discussion" and
 *   "clear everything".
 *
 * Both follow the `server-down-modal` pattern rather than Svelte: a Shadow DOM
 * host with `all:initial` to fence off phpBB's CSS, styled through the `.style`
 * property (never an injected `<style>`), because they are small and static —
 * exactly the case docs/adr/0016 keeps out of the shadow-root Svelte path. Theme
 * follows the *forum's* light/dark, pushed in via `setDark` (the feature reads
 * `isDarkTheme`/`watchTheme`).
 *
 * These are dumb views: the feature owns the pending range and the store, and
 * only wires the callbacks here.
 */

/**
 * The localised name of a palette colour. A switch (not a templated key) so
 * every `i18n.t` argument is a literal the typed catalogue can check; an unknown
 * id degrades to the raw id rather than failing the build.
 */
function colorLabel(id: string): string {
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
// Selection toolbar
// ---------------------------------------------------------------------------

export interface SelectionToolbarHandlers {
  /** A swatch was clicked — paint the pending selection this colour. */
  onPick: (hex: string) => void;
  /** The eraser was clicked — remove highlights under the pending selection. */
  onErase: () => void;
}

export interface SelectionToolbar {
  /** Position above `rect` (or below when there's no room) and reveal. */
  showAt(rect: DOMRect, opts: { canErase: boolean }): void;
  hide(): void;
  /** True while the toolbar is on screen. */
  readonly visible: boolean;
  /** The shadow host, for `composedPath` containment tests. */
  readonly host: HTMLElement;
  setDark(dark: boolean): void;
  destroy(): void;
}

export function createSelectionToolbar(
  handlers: SelectionToolbarHandlers,
): SelectionToolbar {
  let chrome = chromeFor(false);
  let shown = false;

  const { host, shadow } = createShadowHost();

  const bar = styled(
    document.createElement('div'),
    'position:fixed;z-index:' +
      MAX_Z +
      ';display:none;box-sizing:border-box;gap:5px;align-items:center;' +
      'padding:5px 6px;border-radius:8px;' +
      `font:13px/1 ${SYSTEM_FONT};`,
  );

  const swatches = HIGHLIGHT_COLORS.map((color) => {
    const label = colorLabel(color.id);
    const btn = styled(
      document.createElement('button'),
      'width:20px;height:20px;padding:0;border-radius:4px;cursor:pointer;' +
        `background:${color.hex};`,
    );
    btn.type = 'button';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    // preventDefault keeps the page selection alive across the click.
    btn.addEventListener('mousedown', (event) => event.preventDefault());
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      handlers.onPick(color.hex);
    });
    return btn;
  });

  const eraser = styled(
    document.createElement('button'),
    'width:22px;height:20px;padding:0;border-radius:4px;cursor:pointer;' +
      `font:15px/1 ${SYSTEM_FONT};background:transparent;`,
  );
  eraser.type = 'button';
  eraser.textContent = '⌫';
  const eraseLabel = i18n.t('features.highlight.toolbar.remove');
  eraser.title = eraseLabel;
  eraser.setAttribute('aria-label', eraseLabel);
  eraser.addEventListener('mousedown', (event) => event.preventDefault());
  eraser.addEventListener('click', (event) => {
    event.preventDefault();
    handlers.onErase();
  });

  bar.append(...swatches, eraser);
  shadow.append(bar);
  document.body.append(host);

  const paint = () => {
    bar.style.background = chrome.surface;
    bar.style.border = `1px solid ${chrome.border}`;
    bar.style.boxShadow = `0 4px 16px ${chrome.shadow}`;
    for (const btn of swatches) btn.style.border = `1px solid ${chrome.border}`;
    eraser.style.color = chrome.fg;
    eraser.style.border = `1px solid ${chrome.border}`;
  };
  paint();

  return {
    get visible() {
      return shown;
    },
    host,
    showAt(rect, opts) {
      eraser.style.display = opts.canErase ? 'inline-flex' : 'none';
      bar.style.display = 'inline-flex';
      // Measure off-screen, then place centred above the selection (or below).
      bar.style.left = '-9999px';
      bar.style.top = '-9999px';
      const box = bar.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - box.width / 2;
      left = Math.max(6, Math.min(left, window.innerWidth - box.width - 6));
      let top = rect.top - box.height - 8;
      if (top < 6) top = rect.bottom + 8;
      bar.style.left = `${Math.round(left)}px`;
      bar.style.top = `${Math.round(top)}px`;
      shown = true;
    },
    hide() {
      bar.style.display = 'none';
      shown = false;
    },
    setDark(dark) {
      chrome = chromeFor(dark);
      paint();
    },
    destroy() {
      host.remove();
    },
  };
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

export function createClearControl(
  handlers: ClearControlHandlers,
): ClearControl {
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

  const collapse = () => {
    expanded = false;
    menu.style.display = 'none';
    toggle.setAttribute('aria-expanded', 'false');
  };
  const openMenu = () => {
    expanded = true;
    menu.style.display = 'flex';
    toggle.setAttribute('aria-expanded', 'true');
  };
  toggle.setAttribute('aria-haspopup', 'menu');
  collapse();
  toggle.addEventListener('click', () => (expanded ? collapse() : openMenu()));

  // Collapse when clicking elsewhere. Retargeted to the host in the shadow DOM,
  // so composedPath is the only reliable containment test.
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
      toggleLabel.textContent = i18n.t(
        'features.highlight.control.count',
        count,
      );
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
