/**
 * The shared store plumbing.
 *
 * `isRecord`/`readString`/`readInt` underpin every `normalize…` in the codebase and were
 * only ever exercised transitively. `runMigrations` matters more: each store used to
 * inline its own version loop, none of them was reachable from a test (the `MIGRATIONS`
 * maps are module-private), and the three had quietly drifted apart — one of them into a
 * shape that could loop forever. These cases pin the reconciled contract.
 */
import { describe, it, expect } from 'vitest';
import { isRecord, readInt, readString, runMigrations } from './store-kit';

describe('isRecord', () => {
  it('accepts a plain object', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('rejects null, arrays and primitives', () => {
    // `typeof null === 'object'` is the trap this exists to close, and an array would
    // otherwise pass an `Object.entries` walk with numeric keys.
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(3)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('readString', () => {
  it('passes a string through, including an empty one', () => {
    expect(readString('hello')).toBe('hello');
    expect(readString('')).toBe('');
  });

  it('falls back for anything that is not a string', () => {
    expect(readString(undefined)).toBe('');
    expect(readString(null)).toBe('');
    expect(readString(42)).toBe('');
    expect(readString({})).toBe('');
  });

  it('uses the fallback the caller supplied', () => {
    expect(readString(undefined, 'default')).toBe('default');
    expect(readString('given', 'default')).toBe('given');
  });
});

describe('readInt', () => {
  it('passes finite integers through, including 0 and negatives', () => {
    expect(readInt(0)).toBe(0);
    expect(readInt(7)).toBe(7);
    expect(readInt(-3)).toBe(-3);
  });

  it('truncates towards zero rather than rounding', () => {
    expect(readInt(2.9)).toBe(2);
    expect(readInt(-2.9)).toBe(-2);
  });

  it('rejects non-finite numbers and non-numbers', () => {
    expect(readInt(NaN)).toBeNull();
    expect(readInt(Infinity)).toBeNull();
    expect(readInt(-Infinity)).toBeNull();
    expect(readInt('5')).toBeNull();
    expect(readInt(null)).toBeNull();
    expect(readInt(undefined)).toBeNull();
  });
});

describe('runMigrations', () => {
  interface Box {
    version: number;
    trail: string[];
  }
  const box = (version: number): Box => ({ version, trail: [] });

  /** A migration that records that it ran and bumps the version, as one should. */
  const step = (n: number) => (b: Box) => ({
    version: n + 1,
    trail: [...b.trail, `${n}->${n + 1}`],
  });

  it('is a no-op when already current', () => {
    const before = box(2);
    expect(runMigrations(before, 2, 2, { 0: step(0), 1: step(1) })).toBe(before);
  });

  it('is a no-op when the map is empty — the state every store ships in today', () => {
    const before = box(0);
    expect(runMigrations(before, 0, 1, {})).toBe(before);
  });

  it('applies each step in order up to the target', () => {
    const result = runMigrations(box(0), 0, 3, { 0: step(0), 1: step(1), 2: step(2) });
    expect(result.trail).toEqual(['0->1', '1->2', '2->3']);
    expect(result.version).toBe(3);
  });

  it('starts from the stored version, not from zero', () => {
    const result = runMigrations(box(1), 1, 3, { 0: step(0), 1: step(1), 2: step(2) });
    expect(result.trail).toEqual(['1->2', '2->3']);
  });

  it('stops at the first gap rather than skipping it', () => {
    // A missing step means we cannot honestly claim the store is current, so we stop
    // and let the caller's repair pass deal with whatever shape it is in.
    const result = runMigrations(box(0), 0, 3, { 0: step(0), 2: step(2) });
    expect(result.trail).toEqual(['0->1']);
  });

  it('terminates even when a migration forgets to bump the version', () => {
    // THE regression this function exists for. `emoji-recents` used to re-read the
    // version off the store each iteration instead of counting, so a migration that
    // returned an unbumped version looped forever — inside a `normalize…` that runs on
    // every read, on every page load. The counter here is local and always advances.
    const forgetful = (b: Box) => ({ version: b.version, trail: [...b.trail, 'ran'] });
    const result = runMigrations(box(0), 0, 3, {
      0: forgetful,
      1: forgetful,
      2: forgetful,
    });
    expect(result.trail).toEqual(['ran', 'ran', 'ran']);
  });

  it('replays from 0 when the stored version is missing or unusable', () => {
    // `readInt` hands us `null` for a corrupt version. Replaying is the safe reading:
    // `presets` used to accept any finite number here, so a stored `-3` skipped every
    // migration and the store was still stamped as current.
    expect(runMigrations(box(0), null, 2, { 0: step(0), 1: step(1) }).trail).toEqual([
      '0->1',
      '1->2',
    ]);
    expect(runMigrations(box(0), -3, 2, { 0: step(0), 1: step(1) }).trail).toEqual([
      '0->1',
      '1->2',
    ]);
  });

  it('floors a fractional stored version instead of indexing between steps', () => {
    expect(
      runMigrations(box(0), 1.7, 3, { 0: step(0), 1: step(1), 2: step(2) }).trail,
    ).toEqual(['1->2', '2->3']);
  });

  it('leaves a version from a newer build alone', () => {
    // Nothing here can migrate *down*. The caller still stamps its own version on top,
    // which is a lossy but deliberate choice documented at each call site.
    const before = box(99);
    expect(runMigrations(before, 99, 2, { 0: step(0), 1: step(1) })).toBe(before);
  });
});
