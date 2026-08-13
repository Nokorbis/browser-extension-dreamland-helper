import { i18n } from '#i18n';
import { chromeFor, createShadowHost, styled, SYSTEM_FONT } from '@/lib/shadow-ui';
import type { Age } from './age';

/**
 * The draft-recovery bar — a strip at the top of the composer offering a saved draft back.
 * Vanilla rather than Svelte, being small, static and shown once (docs/adr/0016), built like
 * `highlight/toolbar.ts`.
 *
 * Two things differ from the other vanilla surfaces, both load-bearing:
 *
 * 1. **It mounts in flow, inside `#message-box`**, where the others are `position: fixed` on
 *    `document.body` — it has to occupy space above the textarea. See the ⚠ on
 *    `findMessageBox` for why *inside* rather than a sibling. `createShadowHost` leaves the
 *    host at `all:initial`, so the block display is set here.
 * 2. ⚠ **Its buttons live inside `<form id="postform">`**, so they are `type="button"` with
 *    no `name`: either would fire a submit `exit-guard` reads as a genuine post and **send
 *    the half-written message**.
 */

export interface RecoveryBarHandlers {
  /** "Restaurer" — put the draft back into the composer. */
  onRestore: () => void;
  /** "Ignorer" — the writer doesn't want it; delete the draft. */
  onIgnore: () => void;
}

export interface RecoveryBar {
  /** Mount inside `anchor`, immediately above `before` (the textarea), showing `age`. */
  show(anchor: HTMLElement, before: Node, age: Age): void;
  setDark(dark: boolean): void;
  destroy(): void;
}

/** The localised age phrase. A switch, so every `i18n.t` key is a checkable literal. */
function ageLabel(age: Age): string {
  switch (age.unit) {
    case 'minutes':
      return i18n.t('features.exitGuard.draft.age.minutes', age.value);
    case 'hours':
      return i18n.t('features.exitGuard.draft.age.hours', age.value);
    case 'days':
      return i18n.t('features.exitGuard.draft.age.days', age.value);
    default:
      return i18n.t('features.exitGuard.draft.age.now');
  }
}

export function createRecoveryBar(handlers: RecoveryBarHandlers): RecoveryBar {
  let chrome = chromeFor(false);

  const { host, shadow } = createShadowHost();
  // `all:initial` computes to display:inline; this bar has to take a line of its own.
  host.style.display = 'block';

  const bar = styled(
    document.createElement('div'),
    'display:flex;flex-wrap:wrap;align-items:center;gap:8px;box-sizing:border-box;' +
      'width:100%;margin:0 0 6px;padding:7px 10px;border-radius:6px;' +
      `font:13px/1.35 ${SYSTEM_FONT};`,
  );
  bar.setAttribute('role', 'status');

  const message = styled(document.createElement('span'), 'flex:1 1 auto;');

  const mkButton = (text: string, onClick: () => void) => {
    const btn = styled(
      document.createElement('button'),
      'flex:0 0 auto;cursor:pointer;padding:4px 10px;border-radius:5px;font:inherit;',
    );
    // ⚠ MANDATORY inside #postform — see the module comment. Never add a `name`.
    btn.type = 'button';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    btn.addEventListener('mouseenter', () => {
      btn.style.background = chrome.hover;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = chrome.surface;
    });
    return btn;
  };

  const restore = mkButton(i18n.t('features.exitGuard.draft.bar.restore'), handlers.onRestore);
  const ignore = mkButton(i18n.t('features.exitGuard.draft.bar.ignore'), handlers.onIgnore);

  bar.append(message, restore, ignore);
  shadow.append(bar);

  const paint = () => {
    bar.style.background = chrome.warnBg;
    bar.style.color = chrome.warnFg;
    bar.style.border = `1px solid ${chrome.warnBorder}`;
    for (const btn of [restore, ignore]) {
      btn.style.background = chrome.surface;
      btn.style.color = chrome.fg;
      btn.style.border = `1px solid ${chrome.border}`;
    }
  };
  paint();

  return {
    show(anchor, before, age) {
      message.textContent = i18n.t('features.exitGuard.draft.bar.recovered', {
        age: ageLabel(age),
      });
      // Directly above the textarea, which also puts it *below* the `bbcode-presets`
      // panel already in the first-child slot rather than pushing that panel off the
      // top. Appending to the anchor instead would drop the bar below the editor.
      if (before.parentNode === anchor) anchor.insertBefore(host, before);
      else anchor.prepend(host);
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
