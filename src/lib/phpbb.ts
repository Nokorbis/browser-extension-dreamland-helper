/**
 * Helpers for reading the phpBB 3.20 DOM.
 *
 * Everything the extension knows about the forum's markup lives here, so that
 * when phpBB's HTML changes (or we support another skin) there is exactly one
 * place to update. Features should never hard-code selectors themselves.
 */

/** Origins the extension runs on. Single source of truth for the manifest match. */
export const FORUM_MATCHES = ['*://*.dreamland-reborn.net/*'];

/**
 * The post/reply editor textarea on posting.php pages.
 * phpBB 3.x renders it as `<textarea name="message" id="message">`.
 */
export function findMessageTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(
    'textarea#message, textarea[name="message"]',
  );
}

/** True when the current page is a post/reply/PM composer. */
export function isPostingPage(): boolean {
  return findMessageTextarea() !== null;
}

/**
 * The composer `<form>` that owns the message textarea. phpBB renders it as
 * `<form id="postform" method="post" action="./posting.php?...">`, but we reach
 * it through the textarea's own `form` property so we depend on neither the id
 * nor the skin.
 */
export function findPostForm(): HTMLFormElement | null {
  return findMessageTextarea()?.form ?? null;
}

/**
 * The real "submit the post" button inside the composer form. phpBB names it
 * `post` (`<input type="submit" name="post">`); the Preview, Save-draft and
 * Cancel buttons carry other `name`s. Used as the submitter when re-submitting
 * the form programmatically, so phpBB still receives the `post` field.
 */
export function findSubmitButton(form: HTMLFormElement): HTMLElement | null {
  return form.querySelector<HTMLElement>(
    'input[name="post"], button[name="post"]',
  );
}

/**
 * phpBB's BBCode button bar — the row holding B / i / u / Quote / Code above the
 * composer. prosilver's `posting_buttons.html` renders it as
 * `<div id="format-buttons" class="format-buttons">` with
 * `<button class="button button-icon-only bbcode-*">` children, identically in
 * 3.2.x and 3.3.x.
 *
 * The whole block sits behind `{IF S_BBCODE_ALLOWED}`, so it is legitimately
 * absent when BBCode is disabled for a forum — and a custom skin may drop it
 * altogether. **Callers must handle `null`** and degrade rather than throw.
 *
 * Verified against the live forum: `<div id="format-buttons" class="format-buttons">`,
 * whose children are the stock `bbcode-b/i/u/quote/code/list/img/url/color`
 * buttons, a `select.bbcode-size`, and several admin-added custom BBCodes
 * carrying `button-secondary` instead. We append after all of them.
 */
export function findFormatButtons(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '#format-buttons, .format-buttons',
  );
}

/**
 * A single button in that toolbar, addressed by the BBCode it inserts.
 *
 * phpBB derives each button's class from the BBCode tag name — `bbcode-b`,
 * `bbcode-quote`, `bbcode-img` for the stock set, and the *same* rule for
 * admin-added custom BBCodes, which is why `bbcode-spoiler` and `bbcode-mp3`
 * exist on this forum and are addressable without knowing anything else about
 * them. Non-alphanumerics become `-`, so the ordered-list button (`list=`) is
 * `bbcode-list-`.
 *
 * Matched with `[class~=…]` rather than `.bbcode-…` for two reasons: class
 * selectors match whole tokens, so `.bbcode-list` would not find `bbcode-list-`
 * anyway, and a CSS identifier ending in a hyphen is a needless edge case.
 *
 * Returns `null` when the toolbar is absent *or* when this forum has no such
 * BBCode — both are ordinary, and callers should degrade rather than throw.
 */
export function findFormatButton(bbcode: string): HTMLElement | null {
  // The names are literals from callers' own tables, but an invalid one would
  // make querySelector throw a SyntaxError and take the whole feature down.
  if (!/^[a-z0-9-]+$/.test(bbcode)) return null;
  return (
    findFormatButtons()?.querySelector<HTMLElement>(
      `button[class~="bbcode-${bbcode}"]`,
    ) ?? null
  );
}

/**
 * phpBB's own toolbar-button classes. An injected button carries these so it
 * inherits the forum skin instead of looking like a foreign object — which is
 * also why the trigger button is *not* rendered inside a shadow root, where the
 * skin's styles cannot reach it. See docs/adr/0016-svelte-in-content-script.md.
 *
 * Mirrors the live forum's Bold button exactly:
 *   <button type="button" class="button button-icon-only bbcode-b" …>
 *     <i class="icon fa-bold fa-fw" aria-hidden="true"></i>
 *   </button>
 * so our own `<i class="icon fa-… fa-fw">` child inherits the same FontAwesome
 * sizing. We deliberately omit their `name` and `accesskey` — see the ⚠ note in
 * `src/features/bbcode-presets/index.ts`.
 */
export const FORMAT_BUTTON_CLASS = 'button button-icon-only';

/**
 * The `<div id="message-box">` wrapping the composer textarea — the anchor for
 * any UI that wants to sit beside the editor. Falls back to the textarea's own
 * parent so a skin that renamed the wrapper still gives us something usable.
 *
 * ⚠ Mount editor-adjacent UI **inside** this element, not as a sibling before
 * it. Its siblings in the fieldset are `#format-buttons` and a right-floated
 * `#smiley-box`; a block-level sibling therefore spans the whole fieldset and
 * runs underneath the emoticon list. Anything inside `#message-box` instead
 * inherits the same column the textarea occupies, whatever width the skin
 * chose.
 */
export function findMessageBox(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#message-box, .message-box') ??
    findMessageTextarea()?.parentElement ??
    null
  );
}

/**
 * Whether the forum is currently showing its dark theme.
 *
 * The skin marks it with a `dark` class on `<html>`, toggled without a reload.
 * This is forum knowledge, so it lives here rather than in the feature.
 *
 * In-page UI must key off **this**, not `@media (prefers-color-scheme: dark)`:
 * that media query reports the *operating system's* preference, which says
 * nothing about which theme the forum is showing. (Extension pages — popup,
 * options — are the opposite case and should keep using the media query.)
 */
export function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}

/**
 * Observe theme changes and report the new state. Returns an unsubscriber.
 *
 * A `MutationObserver` rather than a one-shot read because the forum's theme
 * switch mutates the class in place — a UI that only sampled at boot would be
 * left inverted until the next page load.
 *
 * CSS alone cannot do this from inside a shadow root: `:host-context()` would
 * express it, but Firefox does not support it. Hence the JS detour.
 */
export function watchTheme(onChange: (dark: boolean) => void): () => void {
  let last = isDarkTheme();
  const observer = new MutationObserver(() => {
    const next = isDarkTheme();
    if (next !== last) {
      last = next;
      onChange(next);
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}

/**
 * Author-coloured usernames. phpBB emits `<span class="username-coloured"
 * style="color: #rrggbb">` for members whose group has a colour. Useful for the
 * colour-grab feature (#4).
 */
export function findColouredUsernames(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('.username-coloured'),
  );
}
