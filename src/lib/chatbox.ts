/**
 * The AJAX Chat ("la Tribune") DOM. Same-origin, never an iframe, but a different system from
 * phpBB with its own id scheme and no `bbcode-*` classes — hence its own module (docs/adr/0017).
 *
 * Two DOM shapes for the same widget, both handled here: the homepage shoutbox
 * (`#ajaxChatInputField`) and the standalone `/chat/` page (`#inputField`).
 */

import { isSafeBBCodeName } from './dom';

export function findChatTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>('#ajaxChatInputField, #inputField');
}

export function findChatBBCodeContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#bbCodeContainer');
}

/**
 * The chat toolbar's button classes, so an injected trigger inherits the widget's look —
 * counterpart of `FORMAT_BUTTON_CLASS` in `phpbb.ts`. No FontAwesome here, so these buttons
 * are `<input type="button">` with a text `value` rather than an icon child.
 */
export const CHAT_BUTTON_CLASS = 'button button-secondary';

/**
 * A single toolbar button, addressed by the BBCode it inserts. Neither DOM shape offers a
 * usable id/class scheme, so this matches the inline handler both share —
 * `onclick="ajaxChat.insertBBCode('b');"`.
 *
 * `null` when the toolbar is absent or this bbcode has no button here (`color` opens a
 * picker; `s`/`spoiler` are missing on the standalone page) — both ordinary.
 */
export function findChatBBCodeButton(bbcode: string): HTMLElement | null {
  // As in findFormatButton: an invalid literal makes querySelector throw a SyntaxError.
  if (!isSafeBBCodeName(bbcode)) return null;
  return (
    findChatBBCodeContainer()?.querySelector<HTMLElement>(
      `input[onclick*="insertBBCode('${bbcode}')"]`,
    ) ?? null
  );
}
