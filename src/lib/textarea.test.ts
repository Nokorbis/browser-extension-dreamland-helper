/**
 * Tests for the pieces of `@/lib/textarea` that are arithmetic rather than DOM
 * work: `planInsertion`, which decides the clamped replacement range and whether
 * the result would blow past a `maxlength`, and `wrapSelection`, which computes
 * the wrapped text and caret offset for an open/close pair.
 *
 * `insertAtRange` itself stays untested on purpose — it is `execCommand` and
 * focus handling, which is cheaper to verify by hand against a real composer
 * (see the scoping note in vitest.config.ts). Extracting the decisions is what
 * lets the parts that can silently corrupt a post be covered without a DOM.
 */
import { describe, it, expect } from 'vitest';
import { planInsertion, wrapSelection } from './textarea';

/** No length limit — what the target forum actually reports. */
const NO_LIMIT = -1;

describe('clamping', () => {
  it('pulls a negative start up to 0', () => {
    const plan = planInsertion(10, { start: -5, end: 3 }, 0, NO_LIMIT);
    expect(plan).toEqual({ ok: true, start: 0, end: 3 });
  });

  it('pulls a start past the end of the value back to its length', () => {
    const plan = planInsertion(10, { start: 99, end: 99 }, 0, NO_LIMIT);
    expect(plan).toEqual({ ok: true, start: 10, end: 10 });
  });

  it('pulls an end past the end of the value back to its length', () => {
    const plan = planInsertion(10, { start: 2, end: 99 }, 0, NO_LIMIT);
    expect(plan).toEqual({ ok: true, start: 2, end: 10 });
  });

  it('never lets the end precede the start', () => {
    // A reversed range would make `end - start` negative and inflate the
    // projection, so the end is clamped to the start rather than to 0.
    const plan = planInsertion(10, { start: 6, end: 2 }, 0, NO_LIMIT);
    expect(plan).toEqual({ ok: true, start: 6, end: 6 });
  });

  it('leaves an already-valid range alone', () => {
    const plan = planInsertion(10, { start: 2, end: 7 }, 3, NO_LIMIT);
    expect(plan).toEqual({ ok: true, start: 2, end: 7 });
  });
});

describe('maxlength', () => {
  it('imposes no limit when maxlength is absent (-1)', () => {
    const plan = planInsertion(100, { start: 0, end: 0 }, 10_000, NO_LIMIT);
    expect(plan.ok).toBe(true);
  });

  it('treats a reported 0 as "no limit", not "allow nothing"', () => {
    // Older implementations reported 0 for an absent maxlength. Honouring it
    // would refuse every single insertion.
    const plan = planInsertion(100, { start: 0, end: 0 }, 50, 0);
    expect(plan.ok).toBe(true);
  });

  it('refuses an insertion that would overflow, reporting the projected length', () => {
    // 100 existing + 10 inserted = 110, over a 105 limit.
    const plan = planInsertion(100, { start: 0, end: 0 }, 10, 105);
    expect(plan).toEqual({ ok: false, projected: 110 });
  });

  it('allows an insertion that lands exactly on the limit', () => {
    const plan = planInsertion(100, { start: 0, end: 0 }, 5, 105);
    expect(plan).toEqual({ ok: true, start: 0, end: 0 });
  });

  it('subtracts the replaced selection before projecting', () => {
    // The case most likely to regress: the field is already full, but the
    // insertion replaces 10 characters with 5, so it gets *shorter*.
    const plan = planInsertion(100, { start: 10, end: 20 }, 5, 100);
    expect(plan).toEqual({ ok: true, start: 10, end: 20 });
  });

  it('refuses when replacing a selection still overflows', () => {
    // Replacing 5 characters with 20 in a full field: 100 - 5 + 20 = 115.
    const plan = planInsertion(100, { start: 0, end: 5 }, 20, 100);
    expect(plan).toEqual({ ok: false, projected: 115 });
  });

  it('projects against the clamped range, not the raw one', () => {
    // Raw end 99 would "remove" 99 characters and make the projection absurdly
    // small; clamped to 10 it removes 8 and the insertion is correctly refused.
    const plan = planInsertion(10, { start: 2, end: 99 }, 50, 20);
    expect(plan).toEqual({ ok: false, projected: 52 });
  });
});

describe('wrapSelection', () => {
  it('keeps a non-empty selection inside the pair, caret after the close', () => {
    const { text, caretOffset } = wrapSelection('[color=#ff0000]', '[/color]', 'hi');
    expect(text).toBe('[color=#ff0000]hi[/color]');
    expect(caretOffset).toBe(text.length);
  });

  it('drops an empty pair with the caret between open and close', () => {
    const { text, caretOffset } = wrapSelection('[color=#ff0000]', '[/color]', '');
    expect(text).toBe('[color=#ff0000][/color]');
    expect(caretOffset).toBe('[color=#ff0000]'.length);
  });
});
