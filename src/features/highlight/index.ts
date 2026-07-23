import type { Feature } from '../types';

/**
 * Feature #2 — Persistent highlighting (STUB — not yet implemented).
 *
 * Goal: let a writer highlight passages of the GM's post and have that
 * highlight persist, so they can focus on what to respond to without copying
 * the text into their reply. Design TBD with the user (where highlights are
 * stored, per-post keying, how they survive reloads).
 */
export const highlight: Feature = {
  id: 'highlight',
  name: 'Highlight GM text',
  description: 'Keep passages highlighted so you can focus while replying.',
  implemented: false,

  setup() {
    // TODO(feature-2): implement.
  },
};
