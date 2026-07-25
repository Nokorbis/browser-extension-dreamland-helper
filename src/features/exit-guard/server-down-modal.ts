import { i18n } from '#i18n';
import { createShadowHost, MAX_Z, styled, SYSTEM_FONT } from '@/lib/shadow-ui';

/**
 * The "server unavailable" confirmation the exit guard shows when the pre-send
 * reachability check fails. This is the extension's first in-page UI, so it is
 * deliberately self-contained: a Shadow DOM host (to isolate it from phpBB's
 * CSS) styled entirely through the `.style` property — never an injected
 * `<style>` tag — so a page `style-src` CSP can't strip it. See
 * docs/adr/0011-presend-server-reachability-check.md.
 *
 * The default / focused button is "Rester sur la page" (safe): a reflexive
 * Enter, Space, Escape or backdrop click keeps the draft. "Continuer quand
 * même" is the deliberate escape hatch for a false-positive check. This modal
 * is shared by all three guarded submits (post, preview, save-draft), so its
 * copy is deliberately action-neutral. See
 * docs/adr/0021-guard-preview-and-draft-submits.md.
 */
export interface ServerDownModalHandlers {
  /** User chose to stay on the page (default / safe). */
  onStay: () => void;
  /** User chose to continue anyway despite the failed check. */
  onContinueAnyway: () => void;
}

export function showServerDownModal(
  handlers: ServerDownModalHandlers,
): () => void {
  const { host, shadow } = createShadowHost();

  const backdrop = styled(
    document.createElement('div'),
    `position:fixed;inset:0;z-index:${MAX_Z};display:flex;align-items:center;` +
      'justify-content:center;background:rgba(0,0,0,0.5);' +
      `font:14px/1.5 ${SYSTEM_FONT};`,
  );

  const dialog = styled(
    document.createElement('div'),
    'box-sizing:border-box;max-width:420px;width:calc(100% - 32px);padding:20px;' +
      'border-radius:10px;background:#fff;color:#1a1a1a;' +
      'box-shadow:0 10px 40px rgba(0,0,0,0.3);',
  );

  const title = styled(
    document.createElement('h2'),
    'margin:0 0 10px;font-size:17px;font-weight:600;',
  );
  title.textContent = `⚠ ${i18n.t('features.exitGuard.serverDown.title')}`;

  const message = styled(document.createElement('p'), 'margin:0 0 20px;');
  message.textContent = i18n.t('features.exitGuard.serverDown.message');

  const buttons = styled(
    document.createElement('div'),
    'display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;',
  );

  const stayButton = styled(
    document.createElement('button'),
    'cursor:pointer;padding:9px 16px;border-radius:6px;border:none;' +
      'background:#2f6fed;color:#fff;font:inherit;font-weight:600;',
  );
  stayButton.type = 'button';
  stayButton.textContent = i18n.t('features.exitGuard.serverDown.stay');

  const sendButton = styled(
    document.createElement('button'),
    'cursor:pointer;padding:9px 16px;border-radius:6px;border:1px solid #c9c9c9;' +
      'background:#f2f2f2;color:#1a1a1a;font:inherit;',
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
