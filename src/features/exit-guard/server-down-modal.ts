import { i18n } from '#i18n';
import { chromeFor, createShadowHost, MAX_Z, styled, SYSTEM_FONT } from '@/lib/shadow-ui';
import { isDarkTheme } from '@/lib/phpbb';

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
 * copy is deliberately action-neutral.
 */
export interface ServerDownModalHandlers {
  /** User chose to stay on the page (default / safe). */
  onStay: () => void;
  /** User chose to continue anyway despite the failed check. */
  onContinueAnyway: () => void;
}

export function showServerDownModal(handlers: ServerDownModalHandlers): () => void {
  const { host, shadow } = createShadowHost();

  // Follow the *forum's* theme, like every other in-page surface. This modal used to
  // hardcode a white card, which meant a light dialog flashing over a dark forum at the
  // worst possible moment — the reader is about to lose a long post. Read once rather
  // than watched: the modal is transient, and a theme switch underneath it would mean
  // the user went looking for the toggle instead of answering the question.
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
  // A real dialog for assistive tech: without these it announces as an unlabelled group
  // and the reader gets no signal that the page behind it is inert.
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

  // The accent stays fixed in both themes: it is the safe, default action, and the
  // palette's own accent already shifts for dark. White-on-accent reads either way.
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

    // Keep Tab inside the dialog. Without this it walks straight out into the composer
    // behind — a page the modal is telling the reader not to act on yet — and there is
    // no visible way back. Only two stops, so the cycle is written out rather than
    // computed from a focusable-element query.
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
