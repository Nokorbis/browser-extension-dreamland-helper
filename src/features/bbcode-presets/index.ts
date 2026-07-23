import type { Feature } from '../types';

/**
 * Feature #3 — BBCode presets (STUB — not yet implemented).
 *
 * Goal: insert complex BBCode structures into the editor in one click, so
 * elaborate formatting doesn't have to be typed by hand each time. Design TBD:
 * preset storage/editing, placeholder handling, and how presets are surfaced
 * near phpBB's own BBCode toolbar.
 */
export const bbcodePresets: Feature = {
  id: 'bbcode-presets',
  name: 'BBCode presets',
  description: 'Insert complex BBCode snippets in one click.',
  implemented: false,

  setup() {
    // TODO(feature-3): implement.
  },
};
