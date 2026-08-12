/**
 * Small, generic DOM helpers shared across features. Forum-specific selectors
 * live in `@/lib/phpbb`; this is for plumbing that isn't forum knowledge.
 */

/** Put an attribute back exactly as it was — absent if it was absent. */
export function setOrRemove(el: HTMLElement, name: string, value: string | null): void {
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}

/**
 * Whether a BBCode name is safe to interpolate into a CSS selector.
 *
 * Both toolbar lookups — phpBB's `.bbcode-<name>` class and the chat's
 * `[onclick*="insertBBCode('<name>')"]` — build a selector out of a name that ultimately
 * comes from a keymap table. A name outside this alphabet would make `querySelector`
 * throw a `SyntaxError` and take the whole feature down, so both check first. The check
 * lives here rather than in either DOM module because it is neither forum nor chat
 * knowledge: it is a fact about selector syntax.
 */
export function isSafeBBCodeName(bbcode: string): boolean {
  return /^[a-z0-9-]+$/.test(bbcode);
}
