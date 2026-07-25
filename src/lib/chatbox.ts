/**
 * Helpers for reading the AJAX Chat (blueimp) DOM — the "Tribune" chatbox that
 * runs alongside the forum, not phpBB itself. Same-origin, never an iframe, so
 * it is reachable from the same content script as `phpbb.ts`, but its markup is
 * a different system with its own id scheme and no `bbcode-*` classes, so it
 * gets its own module rather than being folded into `phpbb.ts` — see
 * docs/adr/0017-keyboard-shortcuts-delegate-to-toolbar.md.
 *
 * Two DOM shapes exist for the same widget, both handled here:
 *  - the shoutbox embedded on the forum homepage (`#ajaxChatInputField`,
 *    toolbar buttons with no id or per-bbcode class);
 *  - the standalone `/chat/` page (`#inputField`, toolbar buttons with
 *    individual but bbcode-inconsistent ids, e.g. `#bbCodeURL` for `url`).
 */

/**
 * The chat's message-composer textarea, in either DOM shape.
 */
export function findChatTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(
    '#ajaxChatInputField, #inputField',
  );
}

/**
 * The chat's BBCode toolbar (`<div id="bbCodeContainer">`), identical id in
 * both DOM shapes.
 */
export function findChatBBCodeContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('#bbCodeContainer');
}

/**
 * A single toolbar button, addressed by the BBCode it inserts.
 *
 * Neither DOM shape gives a usable id/class scheme: the embedded widget's
 * buttons carry no id and only a shared `class="button button-secondary"`,
 * and the standalone page's ids (`#bbCodeURL`, `#bbCodeIMG`, …) aren't
 * derivable from the bbcode string the way phpBB's `bbcode-*` class is. What
 * both shapes share is the inline handler itself —
 * `onclick="ajaxChat.insertBBCode('b');"` — so that is what we match on.
 *
 * Returns `null` when the toolbar is absent or this bbcode has no button here
 * (e.g. `color`, which opens a picker instead of calling `insertBBCode`, or
 * `s`/`spoiler` on the standalone page) — both ordinary, callers should
 * degrade rather than throw.
 */
export function findChatBBCodeButton(bbcode: string): HTMLElement | null {
  // Same guard as findFormatButton: an invalid literal would make
  // querySelector throw a SyntaxError and take the whole feature down.
  if (!/^[a-z0-9-]+$/.test(bbcode)) return null;
  return (
    findChatBBCodeContainer()?.querySelector<HTMLElement>(
      `input[onclick*="insertBBCode('${bbcode}')"]`,
    ) ?? null
  );
}
