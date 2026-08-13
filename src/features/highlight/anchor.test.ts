import { describe, it, expect } from 'vitest';
import { locateOffset } from './anchor';
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

// `nearestOccurrence` — the re-anchor fallback `resolveRange` uses — moved to
// `@/lib/text-search` when `quote-selection` became its second caller, and its
// cases moved with it to `src/lib/text-search.test.ts` (docs/adr/0023).

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
