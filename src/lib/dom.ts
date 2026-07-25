/**
 * Small, generic DOM helpers shared across features. Forum-specific selectors
 * live in `@/lib/phpbb`; this is for plumbing that isn't forum knowledge.
 */

/** Put an attribute back exactly as it was — absent if it was absent. */
export function setOrRemove(
  el: HTMLElement,
  name: string,
  value: string | null,
): void {
  if (value === null) el.removeAttribute(name);
  else el.setAttribute(name, value);
}
