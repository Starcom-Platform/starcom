/**
 * The magnetopause and the bow shock as contour lines (SW26, critique C31): on the same deformed Shue surface the
 * filled shells were drawn from, in the shell's own frame (+x toward the Sun).
 */
import { Vector3 } from 'three';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { createBowShockContours, createMagnetopauseContours } from '../SpaceWeatherGeometry';
import type { BowShockPayload, MagnetopausePayload } from '../../services/SpaceWeatherModeling';

/** Every point the contour lines pass through. */
const pointsOf = (group: { children: unknown[] }): Vector3[] => {
  const lines = group.children.find((c) => (c as LineSegments2).isLineSegments2) as LineSegments2;
  const start = lines.geometry.getAttribute('instanceStart');
  return Array.from({ length: start.count }, (_, i) => new Vector3(start.getX(i), start.getY(i), start.getZ(i)));
};

const deformed = {
  modelVersion: 'shue-approx-v1', noseRe: 10, flankRe: 16, tailRe: 40, alpha: 0.72, aberrationDeg: 4,
  dawnDuskSkew: 0.2, northSouthSkew: -0.1, confidence: 0.9,
};

describe('the boundaries as contour lines', () => {
  it('lies on a sphere at the standoff distance when no deformation is known', () => {
    const payload: MagnetopausePayload = { standoffRe: 10, quality: 'live', lastUpdated: '2024-01-01T00:00:00Z' };
    const points = pointsOf(createMagnetopauseContours(payload));
    expect(points.length).toBeGreaterThan(400);
    for (const p of points) expect(p.length()).toBeCloseTo(1000, 3);
  });

  it('follows the deformed surface: the nose at its standoff, sunward, the flanks farther out', () => {
    const payload: MagnetopausePayload = { standoffRe: 10, quality: 'live', lastUpdated: '2024-01-01T00:00:00Z', deformation: deformed };
    const points = pointsOf(createMagnetopauseContours(payload));
    const nose = points.reduce((a, b) => (b.x > a.x ? b : a));
    expect(nose.x).toBeCloseTo(1000, -1);
    // At 90° from the nose, the flank: well past the nose's distance.
    const flank = Math.max(...points.filter((p) => Math.abs(p.x) < 20).map((p) => Math.hypot(p.y, p.z)));
    expect(flank).toBeGreaterThan(1400);
  });

  it('turns the bow shock by the wind\'s aberration, as its surface was', () => {
    const payload: BowShockPayload = { radiusRe: 14, quality: 'live', lastUpdated: '2024-01-01T00:00:00Z', deformation: { ...deformed, noseRe: 14, flankRe: 20, tailRe: 46, aberrationDeg: 6 } };
    expect(createBowShockContours(payload).rotation.y).toBeCloseTo(-6 * Math.PI / 180, 9);
  });
});
