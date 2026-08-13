import { i18n } from '#i18n';
import { chromeFor, createShadowHost, MAX_Z, styled, SYSTEM_FONT } from '@/lib/shadow-ui';
import { isDarkTheme } from '@/lib/phpbb';

/**
 * The "server unavailable" confirmation shown when the pre-send reachability check fails
 * (docs/adr/0011). A Shadow DOM host styled through `.style` rather than an injected
 * `<style>`, so a page `style-src` CSP can't strip it.
 *
 * The default and focused button is the safe one, "Rester sur la page", so a reflexive
 * Enter, Space, Escape or backdrop click keeps the draft; "Continuer quand même" is the
 * escape hatch for a false positive. Shared by all three guarded submits, hence
 * action-neutral copy.
 */
export interface ServerDownModalHandlers {
  /** User chose to stay on the page (default / safe). */
  onStay: () => void;
  /** User chose to continue anyway despite the failed check. */
  onContinueAnyway: () => void;
}

export function showServerDownModal(handlers: ServerDownModalHandlers): () => void {
  const { host, shadow } = createShadowHost();

  // Follow the *forum's* theme: this used to hardcode a white card, flashing a light
  // dialog over a dark forum at the worst possible moment. Read once rather than
  // watched, since the modal is transient.
  const chrome = chromeFor(isDarkTheme());

  const backdrop = styled(
    document.createElement('div'),
    `position:fixed;inset:0;z-index:${MAX_Z};display:flex;align-items:center;` +
      'justify-content:center;background:rgba(0,0,0,0.5);' +
      `font:14px/1.5 ${SYSTEM_FONT};`,
  );

  const dialog = styled(
    document.createElement('div'),
    'box-sizing:border-box;max-width:420px;width:calc(100% - 32px);padding:20px;' +
      `border-radius:10px;background:${chrome.surface};color:${chrome.fg};` +
      `box-shadow:0 10px 40px ${chrome.shadow};`,
  );
  // A real dialog for assistive tech: without these it announces as an unlabelled
  // group, with no signal that the page behind it is inert.
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');

  const title = styled(
    document.createElement('h2'),
    'margin:0 0 10px;font-size:17px;font-weight:600;',
  );
  title.id = 'dlh-server-down-title';
  title.textContent = `⚠ ${i18n.t('features.exitGuard.serverDown.title')}`;
  dialog.setAttribute('aria-labelledby', title.id);

  const message = styled(document.createElement('p'), 'margin:0 0 20px;');
  message.id = 'dlh-server-down-message';
  message.textContent = i18n.t('features.exitGuard.serverDown.message');
  dialog.setAttribute('aria-describedby', message.id);

  const buttons = styled(
    document.createElement('div'),
    'display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;',
  );

  // The accent stays fixed in both themes: white-on-accent reads either way, and the
  // palette's own accent already shifts for dark.
  const stayButton = styled(
    document.createElement('button'),
    'cursor:pointer;padding:9px 16px;border-radius:6px;border:none;' +
      'background:#2f6fed;color:#fff;font:inherit;font-weight:600;',
  );
  stayButton.type = 'button';
  stayButton.textContent = i18n.t('features.exitGuard.serverDown.stay');

  const sendButton = styled(
    document.createElement('button'),
    'cursor:pointer;padding:9px 16px;border-radius:6px;font:inherit;' +
      `border:1px solid ${chrome.border};background:${chrome.hover};color:${chrome.fg};`,
  );
  sendButton.type = 'button';
  sendButton.textContent = i18n.t('features.exitGuard.serverDown.continueAnyway');

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown, true);
    host.remove();
  };

  const stay = () => {
    close();
    handlers.onStay();
  };
  const continueAnyway = () => {
    close();
    handlers.onContinueAnyway();
  };

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      stay();
      return;
    }

    // Keep Tab inside the dialog, or it walks out into the composer behind — a page the
    // modal is telling the reader not to act on — with no visible way back. Only two
    // stops, so the cycle is written out rather than computed.
    if (event.key !== 'Tab') return;
    // `document.activeElement` reports the shadow *host* for anything focused inside a
    // shadow root; the root's own `activeElement` is the one that resolves.
    const focused = shadow.activeElement;
    const [first, last] = event.shiftKey
      ? [stayButton, sendButton]
      : [sendButton, stayButton];
    if (focused === first) {
      event.preventDefault();
      last.focus();
    }
  }

  stayButton.addEventListener('click', stay);
  sendButton.addEventListener('click', continueAnyway);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) stay();
  });
  document.addEventListener('keydown', onKeydown, true);

  // Rester first (primary / safe), Continuer quand même second.
  buttons.append(stayButton, sendButton);
  dialog.append(title, message, buttons);
  backdrop.append(dialog);
  shadow.append(backdrop);
  document.body.append(host);

  stayButton.focus();

  return close;
}
