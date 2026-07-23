/**
 * Tiny prefixed console logger, shared so every message is greppable by the
 * same tag. Content-script logs surface in the *page's* DevTools console (the
 * forum tab), not the extension console — on Firefox especially, that's where
 * to look when checking whether the script and its listeners are live.
 */
const PREFIX = '[DreamlandHelper]';

export const log = (...args: unknown[]): void => console.info(PREFIX, ...args);
export const warn = (...args: unknown[]): void => console.warn(PREFIX, ...args);
export const error = (...args: unknown[]): void => console.error(PREFIX, ...args);
