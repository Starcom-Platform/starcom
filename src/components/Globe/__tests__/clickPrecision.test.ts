/**
 * How precisely a click on the globe gives a place (plan item 0.11): a few
 * pixels of ground at the camera's altitude, snapped up to a step a person can
 * choose, so a click is never stated as more exact than it is.
 */
import { describe, it, expect } from 'vitest';
import { clickPrecisionM } from '../clickPrecision';

const VIEW = { globeRadius: 100, fovDeg: 50, viewportHeightPx: 900 };

describe('clickPrecisionM', () => {
  it('is coarse with the whole Earth in view', () => {
    // 2.5 radii up: about 16,000 km of altitude.
    expect(clickPrecisionM({ ...VIEW, cameraDistance: 350 })).toBe(100_000);
  });

  it('is fine close in', () => {
    // 0.001 radii up: about 6 km of altitude.
    expect(clickPrecisionM({ ...VIEW, cameraDistance: 100.1 })).toBe(100);
  });

  it('snaps up, never down, to a step the form offers', () => {
    const steps = [10, 100, 1_000, 10_000, 100_000, 1_000_000];
    for (const distance of [100.01, 100.5, 101, 105, 120, 200, 400, 800]) {
      expect(steps).toContain(clickPrecisionM({ ...VIEW, cameraDistance: distance }));
    }
  });

  it('is at least the finest step, even at the surface', () => {
    expect(clickPrecisionM({ ...VIEW, cameraDistance: 100 })).toBe(10);
  });

  it('says a wide view is coarser than a close one', () => {
    expect(clickPrecisionM({ ...VIEW, cameraDistance: 600 })).toBeGreaterThanOrEqual(clickPrecisionM({ ...VIEW, cameraDistance: 150 }));
  });
});
