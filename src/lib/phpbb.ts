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
 * Author-coloured usernames. phpBB emits `<span class="username-coloured"
 * style="color: #rrggbb">` for members whose group has a colour. Useful for the
 * colour-grab feature (#4).
 */
export function findColouredUsernames(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('.username-coloured'),
  );
}
