/**
 * The solar wind streaming past the magnetosphere (space-weather-visualization.md, SW6, SW17):
 * potential flow past a half-body standing off at the magnetopause's nose.
 */
import { describe, expect, it } from 'vitest';
import { flowStarts, flowVelocity, insideHalfBody, streamline, surfaceRadiusAt, FLOW_BOX } from '../nearEarthFlow';

const A = 10.5;

describe('the flow', () => {
  it('comes from the Sun at the free stream\'s speed far upstream, and stops at the nose', () => {
    const far = flowVelocity([1e5, 0, 0], A);
    expect(far[0]).toBeCloseTo(-1, 6);
    expect(Math.hypot(...flowVelocity([A, 0, 0], A))).toBeCloseTo(0, 9);
  });

  it('parts round a surface closed at the nose and opening to twice it down the tail', () => {
    expect(surfaceRadiusAt(A + 0.1, A)).toBeNull();
    // Closed at the nose (the surface's equation is flat there to second order, so to a few thousandths).
    expect(surfaceRadiusAt(A, A)).toBeCloseTo(0, 2);
    expect(surfaceRadiusAt(0, A)).toBeCloseTo(Math.SQRT2 * A, 6);
    expect(surfaceRadiusAt(-1000, A)).toBeGreaterThan(1.99 * A);
    expect(surfaceRadiusAt(-1000, A)).toBeLessThan(2 * A);
  });

  it('carries no particle inside the magnetosphere', () => {
    for (const start of flowStarts(40)) {
      const line = streamline(start, A);
      for (let k = 0; k < line.length; k += 3) expect(insideHalfBody([line[k], line[k + 1], line[k + 2]], A, 0.98)).toBe(false);
    }
  });

  it('follows each streamline from upstream until it leaves the box down the tail or out to the side', () => {
    const line = streamline([FLOW_BOX.upstream, 20, 0], A);
    expect(line[0]).toBe(FLOW_BOX.upstream);
    const [x, y, z] = line.slice(-3);
    expect(x < FLOW_BOX.tail || Math.hypot(y, z) > FLOW_BOX.out).toBe(true);
  });

  it('says where the magnetosheath is: between the bow shock (1.3 times as large) and the magnetopause', () => {
    expect(insideHalfBody([A + 1, 0, 0], A, 1.3)).toBe(true);
    expect(insideHalfBody([A + 1, 0, 0], A, 1)).toBe(false);
    expect(insideHalfBody([0, 0, 0], A)).toBe(true);
  });

  it('starts the particles spread across the upstream disc, the same each time', () => {
    const starts = flowStarts(200);
    expect(starts).toEqual(flowStarts(200));
    for (const [x, y, z] of starts) {
      expect(x).toBe(FLOW_BOX.upstream);
      expect(Math.hypot(y, z)).toBeLessThanOrEqual(FLOW_BOX.out);
    }
    const quadrants = new Set(starts.map(([, y, z]) => `${y > 0}${z > 0}`));
    expect(quadrants.size).toBe(4);
  });
});
