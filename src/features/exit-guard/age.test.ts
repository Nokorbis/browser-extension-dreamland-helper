import { describe, it, expect } from 'vitest';
import { formatAge } from './age';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatAge', () => {
  it.each([
    ['zero', 0],
    ['half a minute', 30 * 1000],
    ['one tick short of a minute', MINUTE - 1],
  ])('reports %s as "now"', (_label, input) => {
    expect(formatAge(input)).toEqual({ unit: 'now', value: 0 });
  });

  it.each([
    [MINUTE, 1],
    [12 * MINUTE, 12],
    [HOUR - 1, 59],
  ])('reports %d ms as %d minutes', (input, value) => {
    expect(formatAge(input)).toEqual({ unit: 'minutes', value });
  });

  it.each([
    [HOUR, 1],
    [DAY - 1, 23],
  ])('reports %d ms as %d hours', (input, value) => {
    expect(formatAge(input)).toEqual({ unit: 'hours', value });
  });

  it.each([
    [DAY, 1],
    [15 * DAY, 15],
  ])('reports %d ms as %d days', (input, value) => {
    expect(formatAge(input)).toEqual({ unit: 'days', value });
  });

  it('rounds down, so a draft is never described as older than it is', () => {
    expect(formatAge(119 * 1000)).toEqual({ unit: 'minutes', value: 1 });
    expect(formatAge(90 * MINUTE)).toEqual({ unit: 'hours', value: 1 });
    expect(formatAge(2 * DAY - 1)).toEqual({ unit: 'days', value: 1 });
  });

  it('treats a backwards clock as "now" rather than an enormous negative age', () => {
    // A laptop waking from sleep can adjust the clock between save and read.
    expect(formatAge(-5 * HOUR)).toEqual({ unit: 'now', value: 0 });
  });

  it('never reports a zero count in a plural bucket', () => {
    for (const ms of [MINUTE, HOUR, DAY]) {
      expect(formatAge(ms).value).toBeGreaterThan(0);
    }
  });
});
