/**
 * The panel's collapsed/expanded flag.
 *
 * One boolean, but it used to be the only storage read in the codebase with no repair
 * pass — a bare `as Partial<PresetsUiState>` spread over the defaults, so a stored
 * `panelExpanded: "no"` reached the UI as a truthy string. The stakes are small; the
 * idiom (ADR 0012) is the point.
 */
import { describe, it, expect } from 'vitest';
import { normalizeUiState } from './ui-state';

describe('normalizeUiState', () => {
  it('passes a real boolean through', () => {
    expect(normalizeUiState({ panelExpanded: true })).toEqual({ panelExpanded: true });
    expect(normalizeUiState({ panelExpanded: false })).toEqual({ panelExpanded: false });
  });

  it('defaults to collapsed when the key is absent', () => {
    expect(normalizeUiState({})).toEqual({ panelExpanded: false });
  });

  it('defaults to collapsed for a non-object payload', () => {
    for (const raw of [undefined, null, 'yes', 42, []]) {
      expect(normalizeUiState(raw)).toEqual({ panelExpanded: false });
    }
  });

  it('rejects a truthy non-boolean instead of letting it through', () => {
    // The actual bug: `{...defaults, ...stored}` would have made this `"no"`.
    for (const panelExpanded of ['no', 'true', 1, {}]) {
      expect(normalizeUiState({ panelExpanded })).toEqual({ panelExpanded: false });
    }
  });
});
