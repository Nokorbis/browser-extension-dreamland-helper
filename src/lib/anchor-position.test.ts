/**
 * The placement geometry shared by every floating surface.
 *
 * Worth its own suite because it is the one part of `@/lib/popover` and
 * `highlight/toolbar.ts` that *can* be tested — CLAUDE.md calls the popover "no automated
 * coverage by design", which is true of its mount and dismissal plumbing and was never
 * true of its arithmetic. Before the extraction the two surfaces disagreed about when to
 * flip; these cases pin the reconciled rule.
 */
import { describe, it, expect } from 'vitest';
import { placeAnchored } from './anchor-position';

const VIEWPORT = { width: 1000, height: 800 };
const GAP = 4;

/** A trigger button sitting comfortably in the middle of the page. */
const anchor = (over: Partial<Parameters<typeof placeAnchored>[0]> = {}) => ({
  top: 100,
  bottom: 120,
  left: 300,
  width: 40,
  ...over,
});

const opts = (over: Partial<Parameters<typeof placeAnchored>[3]> = {}) =>
  ({
    gap: GAP,
    align: 'left' as const,
    side: 'below' as const,
    fit: false,
    ...over,
  }) satisfies Parameters<typeof placeAnchored>[3];

describe('placeAnchored, unfitted', () => {
  it('hangs the surface below the anchor, left edges aligned', () => {
    const { top, left } = placeAnchored(
      anchor(),
      { width: 200, height: 150 },
      VIEWPORT,
      opts(),
    );
    expect(top).toBe(124); // anchor.bottom + gap
    expect(left).toBe(300); // anchor.left
  });

  it('centres on the anchor when asked', () => {
    const { left } = placeAnchored(
      anchor(),
      { width: 200, height: 150 },
      VIEWPORT,
      opts({ align: 'center' }),
    );
    // 300 + 40/2 - 200/2
    expect(left).toBe(220);
  });

  it('places above the anchor when that is the preferred side', () => {
    const { top } = placeAnchored(
      anchor(),
      { width: 200, height: 150 },
      VIEWPORT,
      opts({ side: 'above' }),
    );
    expect(top).toBe(100 - GAP - 150);
  });

  it('never adjusts without `fit`, however far off-screen that lands', () => {
    // The presets menu runs unfitted on purpose; it must keep behaving as it always has.
    const { top, left } = placeAnchored(
      anchor({ bottom: 790, left: 990 }),
      { width: 300, height: 400 },
      VIEWPORT,
      opts(),
    );
    expect(top).toBe(794);
    expect(left).toBe(990);
  });
});

describe('placeAnchored flipping', () => {
  it('flips a below-surface above when it would overrun the bottom', () => {
    const a = anchor({ top: 600, bottom: 620 });
    const { top } = placeAnchored(
      a,
      { width: 200, height: 300 },
      VIEWPORT,
      opts({ fit: true }),
    );
    // 620 + 4 + 300 = 924 > 800, and 600 - 4 - 300 = 296 >= gap, so it flips.
    expect(top).toBe(296);
  });

  it('stays below when there is no room above either', () => {
    // The rule that the highlight toolbar was missing: falling off the top is no
    // better than falling off the bottom, so a surface too tall for either side keeps
    // its preferred placement rather than being pushed somewhere equally unusable.
    const a = anchor({ top: 10, bottom: 30 });
    const { top } = placeAnchored(
      a,
      { width: 200, height: 900 },
      VIEWPORT,
      opts({ fit: true }),
    );
    expect(top).toBe(34);
  });

  it('flips an above-surface below when it would overrun the top', () => {
    const a = anchor({ top: 20, bottom: 40 });
    const { top } = placeAnchored(
      a,
      { width: 200, height: 100 },
      VIEWPORT,
      opts({ fit: true, side: 'above' }),
    );
    // 20 - 4 - 100 = -84 < gap, and 40 + 4 + 100 = 144 <= 800, so it drops below.
    expect(top).toBe(44);
  });

  it('keeps an above-surface above when below is no better', () => {
    const a = anchor({ top: 20, bottom: 40 });
    const { top } = placeAnchored(
      a,
      { width: 200, height: 900 },
      VIEWPORT,
      opts({ fit: true, side: 'above' }),
    );
    expect(top).toBe(20 - GAP - 900);
  });

  it('does not flip while the surface is still unrendered', () => {
    // Height 0 is what every caller sees on first open, before the framework has drawn
    // the surface. Flipping on a zero height would place it against the wrong edge and
    // then jump on the next frame.
    const a = anchor({ top: 790, bottom: 799 });
    const { top } = placeAnchored(
      a,
      { width: 0, height: 0 },
      VIEWPORT,
      opts({ fit: true }),
    );
    expect(top).toBe(803);
  });
});

describe('placeAnchored clamping', () => {
  it('pulls a surface back from the right edge', () => {
    const { left } = placeAnchored(
      anchor({ left: 900 }),
      { width: 300, height: 100 },
      VIEWPORT,
      opts({ fit: true }),
    );
    expect(left).toBe(VIEWPORT.width - 300 - GAP); // 696
  });

  it('pulls a surface back from the left edge', () => {
    const { left } = placeAnchored(
      anchor({ left: 10, width: 20 }),
      { width: 300, height: 100 },
      VIEWPORT,
      opts({ fit: true, align: 'center' }),
    );
    // Centring would put it at 10 + 10 - 150 = -130.
    expect(left).toBe(GAP);
  });

  it('prefers the left edge when the surface is wider than the viewport', () => {
    // The clamp range inverts here (min 4, max -204). Overflowing right keeps the
    // start of the content visible, which is the readable direction.
    const { left } = placeAnchored(
      anchor(),
      { width: 1200, height: 100 },
      VIEWPORT,
      opts({ fit: true }),
    );
    expect(left).toBe(GAP);
  });

  it('leaves the horizontal position alone while the surface is unrendered', () => {
    const { left } = placeAnchored(
      anchor({ left: 990 }),
      { width: 0, height: 100 },
      VIEWPORT,
      opts({ fit: true }),
    );
    expect(left).toBe(990);
  });

  it('clamps and flips independently', () => {
    const a = anchor({ top: 600, bottom: 620, left: 900 });
    const { top, left } = placeAnchored(
      a,
      { width: 300, height: 300 },
      VIEWPORT,
      opts({ fit: true }),
    );
    expect(top).toBe(296);
    expect(left).toBe(696);
  });
});
