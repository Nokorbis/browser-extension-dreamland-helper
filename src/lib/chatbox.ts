/**
 * Everything the extension knows about the AJAX Chat ("la Tribune") DOM. Same-origin and
 * never an iframe, but a different system from phpBB with its own id scheme and no
 * `bbcode-*` classes, hence its own module — see docs/adr/0017.
 *
 * Two DOM shapes exist for the same widget, both handled here: the homepage shoutbox
 * (`#ajaxChatInputField`, toolbar buttons with no id or class of their own) and the
 * standalone `/chat/` page (`#inputField`, ids that don't follow the bbcode name, e.g.
 * `#bbCodeURL` for `url`).
 */

import { isSafeBBCodeName } from './dom';

export function findChatTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>('#ajaxChatInputField, #inputField');
}

export function findChatBBCodeContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#bbCodeContainer');
}

/**
 * The chat toolbar's own button classes, so an injected trigger inherits the widget's look.
 * Counterpart of `FORMAT_BUTTON_CLASS` in `phpbb.ts`. The chat is not phpBB and does not
 * load FontAwesome, so its buttons are `<input type="button">` with a text `value` rather
 * than an icon child.
 */
export const CHAT_BUTTON_CLASS = 'button button-secondary';

/**
 * A single toolbar button, addressed by the BBCode it inserts.
 *
 * Neither DOM shape offers a usable id/class scheme, so we match the inline handler both
 * share instead — `onclick="ajaxChat.insertBBCode('b');"`.
 *
 * `null` when the toolbar is absent or this bbcode has no button here (`color` opens a
 * picker rather than calling `insertBBCode`; `s`/`spoiler` are missing on the standalone
 * page) — both ordinary, so degrade rather than throw.
 */
export function findChatBBCodeButton(bbcode: string): HTMLElement | null {
  // Same guard as findFormatButton: an invalid literal would make
  // querySelector throw a SyntaxError and take the whole feature down.
  if (!isSafeBBCodeName(bbcode)) return null;
  return (
    findChatBBCodeContainer()?.querySelector<HTMLElement>(
      `input[onclick*="insertBBCode('${bbcode}')"]`,
    ) ?? null
  );
}
