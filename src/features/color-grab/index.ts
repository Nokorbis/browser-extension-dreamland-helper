import type { Feature } from '../types';

/**
 * Feature #4 — Color grabbing (STUB — not yet implemented).
 *
 * Goal: quickly grab the color another poster uses (e.g. a character's speech
 * color) and reuse it, without hunting through their BBCode. Design TBD:
 * see `findColouredUsernames` / inline `[color]` spans in `@/lib/phpbb` for the
 * likely DOM sources, plus how the grabbed color is presented and applied.
 */
export const colorGrab: Feature = {
  id: 'color-grab',
  name: 'Color grabber',
  description: "Grab another poster's color and reuse it.",
  implemented: false,

  setup() {
    // TODO(feature-4): implement.
  },
};
