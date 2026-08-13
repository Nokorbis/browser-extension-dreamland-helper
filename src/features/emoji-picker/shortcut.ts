/**
 * The combo that opens the emoji picker. Its own module deliberately: `index.ts` pulls in
 * Svelte and the forum DOM, and `src/lib/keys.test.ts` must read this constant without any
 * of that to check it against every other shortcut the extension claims.
 *
 * Secondary row + `i`, for *icône* — not in `RESERVED_LETTERS.secondary` and not claimed by
 * any `KEYMAP` entry. The test is what keeps that true; don't move this without re-running it.
 */
import type { Combo } from '@/lib/keys';

export const EMOJI_COMBO: Combo = { row: 'secondary', letter: 'i' };
