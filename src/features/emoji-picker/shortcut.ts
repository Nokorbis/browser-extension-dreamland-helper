/**
 * The combo that opens the emoji picker.
 *
 * Its own module, deliberately: `index.ts` pulls in Svelte and the forum DOM,
 * and `src/lib/keys.test.ts` needs to read this constant without any of that to
 * check it against every other shortcut the extension claims.
 *
 * Secondary row (Alt, or Ctrl+Option on macOS) + `i`, for *icône*. Free on both
 * counts at the time of writing: `i` is not in `RESERVED_LETTERS.secondary`, and
 * no `KEYMAP` entry in editor-shortcuts claims it. The test is what keeps that
 * true — do not move this binding without re-running it.
 */
import type { Combo } from '@/lib/keys';

export const EMOJI_COMBO: Combo = { row: 'secondary', letter: 'i' };
