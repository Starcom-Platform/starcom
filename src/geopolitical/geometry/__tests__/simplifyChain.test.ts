/**
 * A line on the globe, simplified for a device the quality governor steps down (decision D-ZR; the owner's
 * pick of 2026-10-18: where it lags, Sector lines simpler at a distance). Douglas–Peucker in degrees, with a
 * cap on how long a kept span may be: a fat line is drawn as straight segments between its points, so a long
 * span would cut a chord through the globe instead of following it.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { simplifyChain } from '../simplifyChain';

type P = [number, number];
const along = (from: P, to: P, step: number): P[] => {
  const n = Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / step);
  return Array.from({ length: n + 1 }, (_, i): P => [from[0] + ((to[0] - from[0]) * i) / n, from[1] + ((to[1] - from[1]) * i) / n]);
};

describe('simplifyChain', () => {
  it('keeps both ends, and a point every span at most along a straight run', () => {
    const run = along([0, 0], [0, 10], 0.2);
    const out = simplifyChain(run, 0.05, 1);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([0, 10]);
    expect(out.length).toBeLessThan(run.length / 3);
    for (let i = 1; i < out.length; i++) expect(Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1])).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('measures a span east-west by the cosine of its latitude', () => {
    // At 60°N a degree of longitude is half a degree of arc: a span may run two degrees of longitude.
    const out = simplifyChain(along([0, 60], [10, 60], 0.2), 0.05, 1);
    for (let i = 1; i < out.length; i++) expect(out[i][0] - out[i - 1][0]).toBeLessThanOrEqual(2 + 1e-9);
    expect(out.length).toBeLessThanOrEqual(7);
  });

  it('keeps a bend larger than the tolerance, and drops one smaller', () => {
    const bend: P[] = [[0, 0], [0.25, 0], [0.5, 0.3], [0.75, 0], [1, 0]];
    expect(simplifyChain(bend, 0.05, 5)).toContainEqual([0.5, 0.3]);
    const wobble: P[] = [[0, 0], [0.25, 0], [0.5, 0.02], [0.75, 0], [1, 0]];
    expect(simplifyChain(wobble, 0.05, 5)).toEqual([[0, 0], [1, 0]]);
  });

  it('leaves a chain of two points, or fewer, as it is', () => {
    expect(simplifyChain([[1, 2], [3, 4]], 0.05, 1)).toEqual([[1, 2], [3, 4]]);
    expect(simplifyChain([[1, 2]], 0.05, 1)).toEqual([[1, 2]]);
  });
});
