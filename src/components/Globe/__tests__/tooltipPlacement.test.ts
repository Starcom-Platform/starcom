import { describe, it, expect } from 'vitest';
import { computeTooltipPlacement, estimateTooltipSize, TOOLTIP_MAX_WIDTH } from '../tooltipPlacement';

const VIEWPORT_W = 1280;
const VIEWPORT_H = 720;

describe('computeTooltipPlacement', () => {
  it('centers horizontally on the cursor and shows above it when there is real room', () => {
    const { left, transform } = computeTooltipPlacement(640, 400, VIEWPORT_W, VIEWPORT_H);
    expect(left).toBe(640);
    expect(transform).toContain('-50%');
    expect(transform).toContain('-100%'); // above the cursor
  });

  it('anchors to the left edge instead of centering when too close to the real left edge', () => {
    const { left, transform } = computeTooltipPlacement(5, 400, VIEWPORT_W, VIEWPORT_H);
    expect(left).toBe(12);
    expect(transform).toContain('0%,');
  });

  it('anchors to the right edge instead of centering when too close to the real right edge', () => {
    const { left, transform } = computeTooltipPlacement(1275, 400, VIEWPORT_W, VIEWPORT_H);
    expect(left).toBe(VIEWPORT_W - 12);
    expect(transform).toContain('-100%,');
  });

  it('flips below the cursor instead of above when too close to the real top edge', () => {
    const { transform } = computeTooltipPlacement(640, 10, VIEWPORT_W, VIEWPORT_H);
    expect(transform).not.toContain('calc(-100%');
  });

  it('clamps to the real bottom edge rather than running off-screen', () => {
    const { top } = computeTooltipPlacement(640, 718, VIEWPORT_W, VIEWPORT_H);
    expect(top).toBeLessThanOrEqual(VIEWPORT_H - 12);
  });

  it('allows for a tall tooltip: below the cursor when it would run off the top, and kept on screen there', () => {
    const tall = { width: 360, height: 200 };
    expect(computeTooltipPlacement(640, 400, VIEWPORT_W, VIEWPORT_H, tall).transform).toContain('calc(-100%');
    // Above, it rises from the cursor, never pushed down over it: New Mexico's 362 px hover at y 418.
    expect(computeTooltipPlacement(640, 418, VIEWPORT_W, VIEWPORT_H, { width: 360, height: 362 })).toEqual({ left: 640, top: 418, transform: 'translate(-50%, calc(-100% - 14px))' });
    const below = computeTooltipPlacement(640, 150, VIEWPORT_W, VIEWPORT_H, tall);
    expect(below.transform).not.toContain('calc(-100%');
    const nearBottom = computeTooltipPlacement(640, 150, VIEWPORT_W, 300, tall);
    // Below, its bottom within the viewport: top + gap + height <= height - padding.
    expect(nearBottom.top + 14 + tall.height).toBeLessThanOrEqual(300 - 12);
    // Its width keeps it off the side, as the one-line estimate did.
    expect(computeTooltipPlacement(150, 400, VIEWPORT_W, VIEWPORT_H, tall).left).toBe(12);
    expect(computeTooltipPlacement(150, 400, VIEWPORT_W, VIEWPORT_H).left).toBe(150);
  });
});

describe('estimateTooltipSize', () => {
  it('is one line for a short text, and as many as its words wrap to, or its breaks make, for a long one', () => {
    const one = estimateTooltipSize('Dover lifeboat station');
    expect(one.height).toBeLessThanOrEqual(32);
    expect(one.width).toBeLessThan(TOOLTIP_MAX_WIDTH);
    const long = estimateTooltipSize('x'.repeat(300));
    expect(long.width).toBe(TOOLTIP_MAX_WIDTH);
    expect(long.height).toBeGreaterThanOrEqual(6 * 16);
    expect(estimateTooltipSize('a\nb\nc').height).toBe(3 * 16 + 10);
  });
});
