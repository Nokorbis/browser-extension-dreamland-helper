import { describe, it, expect } from 'vitest';
import { nearestOccurrence } from './text-search';

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
