import { describe, it, expect } from 'vitest';
import {
  aggregateUsage,
  canonicalizeColor,
  partitionByGrid,
  type ColorObservation,
} from './palette-filter';

describe('canonicalizeColor', () => {
  it('reads the rgb() form the browser serialises styles to', () => {
    expect(canonicalizeColor('rgb(128, 64, 0)')).toBe('#804000');
    expect(canonicalizeColor('rgb(0,191,0)')).toBe('#00bf00');
  });

  it('pads single-digit channels', () => {
    expect(canonicalizeColor('rgb(11, 112, 112)')).toBe('#0b7070');
  });

  it('ignores an rgba alpha channel', () => {
    expect(canonicalizeColor('rgba(255, 51, 0, 0.5)')).toBe('#ff3300');
  });

  it('accepts hex with or without a leading #, any case', () => {
    expect(canonicalizeColor('#804000')).toBe('#804000');
    expect(canonicalizeColor('804000')).toBe('#804000');
    expect(canonicalizeColor('#00BF00')).toBe('#00bf00');
  });

  it('expands the 3-digit shorthand', () => {
    expect(canonicalizeColor('#f30')).toBe('#ff3300');
  });

  it('rejects out-of-range and malformed input', () => {
    expect(canonicalizeColor('rgb(300, 0, 0)')).toBeNull();
    expect(canonicalizeColor('transparent')).toBeNull();
    expect(canonicalizeColor('#12g')).toBeNull();
    expect(canonicalizeColor('')).toBeNull();
    expect(canonicalizeColor('   ')).toBeNull();
  });
});

describe('aggregateUsage', () => {
  const obs = (pairs: [string, string][]): ColorObservation[] =>
    pairs.map(([color, author]) => ({ color, author }));

  it('groups by colour with per-author counts', () => {
    const [green] = aggregateUsage(
      obs([
        ['#00bf00', 'Père Castor'],
        ['#00bf00', 'Père Castor'],
        ['#00bf00', 'DarkDog78'],
      ]),
    );
    expect(green).toEqual({
      color: '#00bf00',
      total: 3,
      authors: [
        { author: 'Père Castor', count: 2 },
        { author: 'DarkDog78', count: 1 },
      ],
    });
  });

  it('orders colours by total usage DESC', () => {
    const result = aggregateUsage(
      obs([
        ['#804000', 'Kiratsu'],
        ['#00bf00', 'Père Castor'],
        ['#00bf00', 'DarkDog78'],
        ['#00bf00', 'Père Castor'],
      ]),
    );
    expect(result.map((u) => u.color)).toEqual(['#00bf00', '#804000']);
  });

  it('breaks colour ties by first-seen order', () => {
    const result = aggregateUsage(
      obs([
        ['#bbbbbb', 'Aetos'],
        ['#804000', 'Kiratsu'],
      ]),
    );
    // Both have total 1 — the one seen first stays first.
    expect(result.map((u) => u.color)).toEqual(['#bbbbbb', '#804000']);
  });

  it('breaks author ties by name', () => {
    const [color] = aggregateUsage(
      obs([
        ['#008000', 'Zed'],
        ['#008000', 'Abel'],
      ]),
    );
    expect(color.authors.map((a) => a.author)).toEqual(['Abel', 'Zed']);
  });

  it('returns nothing for no observations', () => {
    expect(aggregateUsage([])).toEqual([]);
  });
});

describe('partitionByGrid', () => {
  it('splits review colours by grid membership, case-insensitively', () => {
    const { inGrid, custom } = partitionByGrid(
      ['#804000', '#9900ff', '#00bf00'],
      ['804000', '00BF00', 'FFFFFF'], // phpBB grid: uppercase, no #
    );
    expect(inGrid).toEqual(['#804000', '#00bf00']);
    expect(custom).toEqual(['#9900ff']);
  });

  it('preserves the input order of the custom colours', () => {
    const { custom } = partitionByGrid(
      ['#111111', '#222222', '#333333'],
      [],
    );
    expect(custom).toEqual(['#111111', '#222222', '#333333']);
  });

  it('drops uncanonicalisable review colours', () => {
    const { inGrid, custom } = partitionByGrid(['not-a-color'], ['804000']);
    expect(inGrid).toEqual([]);
    expect(custom).toEqual([]);
  });
});
