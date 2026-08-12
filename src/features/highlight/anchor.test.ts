import { describe, it, expect } from 'vitest';
import { locateOffset, nearestOccurrence } from './anchor';
import { highlightRegistryName, HIGHLIGHT_COLORS } from './palette';

/**
 * The pure arithmetic behind anchoring. The Range/TreeWalker glue is verified by
 * hand against the live forum (the suite has no DOM env — see CLAUDE.md); these
 * pin the parts that can be wrong in a way tests would catch.
 */

describe('locateOffset', () => {
  it('finds a target inside a single node', () => {
    expect(locateOffset([10], 4)).toEqual({ index: 0, local: 4 });
  });

  it('walks across nodes, accumulating lengths', () => {
    // "abcd" | "efghi" | "jk"  → offset 7 is index 1, local 3 ("h")
    expect(locateOffset([4, 5, 2], 7)).toEqual({ index: 1, local: 3 });
  });

  it('maps offset 0 to the very start', () => {
    expect(locateOffset([3, 4], 0)).toEqual({ index: 0, local: 0 });
  });

  it('resolves a node boundary to the end of the earlier node', () => {
    // offset 4 sits at the boundary of node 0 (len 4) and node 1.
    expect(locateOffset([4, 5], 4)).toEqual({ index: 0, local: 4 });
  });

  it('maps the total length to the end of the last node', () => {
    expect(locateOffset([4, 5], 9)).toEqual({ index: 1, local: 5 });
  });

  it('skips leading empty nodes for a zero target', () => {
    expect(locateOffset([0, 4], 0)).toEqual({ index: 0, local: 0 });
  });

  it('returns null past the end', () => {
    expect(locateOffset([4], 5)).toBeNull();
  });

  it('returns null for a negative target', () => {
    expect(locateOffset([4], -1)).toBeNull();
  });

  it('returns null when there are no nodes', () => {
    expect(locateOffset([], 0)).toBeNull();
  });
});

describe('nearestOccurrence', () => {
  const full = 'the cat sat on the mat, the cat ran';

  it('finds the only occurrence', () => {
    expect(nearestOccurrence(full, 'mat', 0)).toBe(full.indexOf('mat'));
  });

  it('picks the occurrence nearest the hint', () => {
    // "the" appears at 0, 15, 24. Hint near the end → 24.
    expect(nearestOccurrence(full, 'the', 30)).toBe(24);
  });

  it('picks the earliest when the hint is near the start', () => {
    expect(nearestOccurrence(full, 'the', 1)).toBe(0);
  });

  it('breaks ties toward the earlier occurrence', () => {
    // "the cat" at 0 and 24; hint 12 is equidistant-ish, 0 is closer (12 vs 12→ earlier wins)
    const s = 'the cat and the cat';
    // occurrences of "the cat" at 0 and 12; hint 6 → |0-6|=6, |12-6|=6 → earlier (0)
    expect(nearestOccurrence(s, 'the cat', 6)).toBe(0);
  });

  it('returns null when absent', () => {
    expect(nearestOccurrence(full, 'dog', 0)).toBeNull();
  });

  it('returns null for an empty needle', () => {
    expect(nearestOccurrence(full, '', 0)).toBeNull();
  });
});

describe('highlightRegistryName', () => {
  it('is deterministic for the same colour', () => {
    expect(highlightRegistryName('#ffe86b')).toBe(highlightRegistryName('#ffe86b'));
  });

  it('strips the hash and lowercases, so equivalent spellings share a slot', () => {
    expect(highlightRegistryName('#FFE86B')).toBe('dlh-hl-ffe86b');
    expect(highlightRegistryName('ffe86b')).toBe('dlh-hl-ffe86b');
  });

  it('gives different colours different slots', () => {
    const names = HIGHLIGHT_COLORS.map((c) => highlightRegistryName(c.hex));
    expect(new Set(names).size).toBe(HIGHLIGHT_COLORS.length);
  });

  it('yields a valid CSS custom-ident for every shipped colour', () => {
    // The name is a `::highlight()` custom-ident *and* a `CSS.highlights` key. An
    // invalid ident makes the whole rule fail to parse, so nothing paints — and
    // `clear()` then can't find the entry to remove either.
    for (const { hex } of HIGHLIGHT_COLORS) {
      expect(highlightRegistryName(hex)).toMatch(/^[a-zA-Z][\w-]*$/);
    }
  });
});
