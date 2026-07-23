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
 * Author-coloured usernames. phpBB emits `<span class="username-coloured"
 * style="color: #rrggbb">` for members whose group has a colour. Useful for the
 * colour-grab feature (#4).
 */
export function findColouredUsernames(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('.username-coloured'),
  );
}
