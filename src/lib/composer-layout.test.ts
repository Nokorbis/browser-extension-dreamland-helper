/**
 * Tests for the reply-layout prefs store: the repair pass every read goes
 * through, and the plain-object rebuild that guards the storage boundary.
 *
 * The layout itself (`src/features/composer-layout/layout.ts`) is DOM glue with
 * no automated coverage by design — see docs/adr/0030.
 */
import { describe, it, expect } from 'vitest';
import {
  COMPOSER_LAYOUT_SCHEMA_VERSION,
  emptyLayoutPrefs,
  normalizeLayoutPrefs,
  toPlainLayoutPrefs,
  type LayoutPrefs,
} from './composer-layout';

describe('normalizeLayoutPrefs', () => {
  it('returns the defaults for anything that is not a record', () => {
    for (const raw of [undefined, null, 42, 'nope', []]) {
      expect(normalizeLayoutPrefs(raw)).toEqual(emptyLayoutPrefs());
    }
  });

  it('defaults to the skin’s own layout: composer on top, review newest-first, centred', () => {
    const prefs = emptyLayoutPrefs();
    expect(prefs.reverseOrder).toBe(false);
    expect(prefs.sideBySide).toBe(false);
    expect(prefs.fullWidth).toBe(false);
  });

  it('keeps stored flags', () => {
    const prefs = normalizeLayoutPrefs({
      version: COMPOSER_LAYOUT_SCHEMA_VERSION,
      reverseOrder: true,
      sideBySide: true,
      fullWidth: true,
      composerSide: 'left',
    });
    expect(prefs).toEqual({
      version: COMPOSER_LAYOUT_SCHEMA_VERSION,
      reverseOrder: true,
      sideBySide: true,
      fullWidth: true,
      composerSide: 'left',
    });
  });

  it('reads a payload written before full width existed', () => {
    const prefs = normalizeLayoutPrefs({
      version: COMPOSER_LAYOUT_SCHEMA_VERSION,
      reverseOrder: true,
      sideBySide: true,
      composerSide: 'left',
    });
    expect(prefs.fullWidth).toBe(false);
    expect(prefs.sideBySide).toBe(true);
  });

  it('falls back per field rather than dropping the whole payload', () => {
    const prefs = normalizeLayoutPrefs({ reverseOrder: 'yes', sideBySide: true });
    expect(prefs.reverseOrder).toBe(false);
    expect(prefs.sideBySide).toBe(true);
  });

  it('only accepts the two known sides, defaulting to the right', () => {
    expect(normalizeLayoutPrefs({ composerSide: 'left' }).composerSide).toBe('left');
    expect(normalizeLayoutPrefs({ composerSide: 'right' }).composerSide).toBe('right');
    expect(normalizeLayoutPrefs({ composerSide: 'middle' }).composerSide).toBe('right');
    expect(normalizeLayoutPrefs({ composerSide: 3 }).composerSide).toBe('right');
  });

  it('stamps the current schema version, whatever was stored', () => {
    for (const version of [undefined, 0, -3, 0.5, 99, 'one']) {
      expect(normalizeLayoutPrefs({ version }).version).toBe(COMPOSER_LAYOUT_SCHEMA_VERSION);
    }
  });
});

describe('toPlainLayoutPrefs', () => {
  it('rebuilds a plain object holding only known fields', () => {
    // Carries an extra field, as an older or newer build's payload might.
    const stored: LayoutPrefs & { extra: string } = {
      ...emptyLayoutPrefs(),
      sideBySide: true,
      extra: 'x',
    };
    const plain = toPlainLayoutPrefs(stored);
    expect(Object.keys(plain).sort()).toEqual([
      'composerSide',
      'fullWidth',
      'reverseOrder',
      'sideBySide',
      'version',
    ]);
    expect(plain.sideBySide).toBe(true);
  });
});
