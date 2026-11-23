/**
 * One point to stand for a line or a polygon (decision D-F, step 17).
 *
 * The globe draws a point per report, so a published line or polygon has to be
 * reduced to one. The ingest took the FIRST coordinate: a line's start, a
 * polygon's first vertex. A congressional district then sat on one of its
 * corners — position is the claim, and a corner is not where a district is.
 *
 * A polygon now stands at its centroid and a line at its halfway point along
 * its length. Where that point would mislead, it falls back to the first vertex
 * and says so: a concave shape whose centroid lies outside it, a shape across
 * the antimeridian (where averaging longitudes is meaningless), or one with no
 * area. The reduction is still reported either way; only its quality changes.
 */
import { describe, it, expect } from 'vitest';
import { representativePoint } from '../representativePoint';

const p = (lat: number, lon: number) => ({ lat, lon });

describe('representativePoint — polygons', () => {
  it('puts a square at its centre', () => {
    const r = representativePoint({ kind: 'polygon', rings: [[p(0, 0), p(10, 0), p(10, 10), p(0, 10), p(0, 0)]] });

    expect(r.how).toBe('polygon-centroid');
    expect(r.point.lat).toBeCloseTo(5);
    expect(r.point.lon).toBeCloseTo(5);
  });

  it('falls back to a vertex when the centroid lies outside the shape', () => {
    // A thin "C": its centroid sits in the open middle, outside the polygon.
    const c = [p(0, 0), p(0, 10), p(1, 10), p(1, 1), p(9, 1), p(9, 10), p(10, 10), p(10, 0), p(0, 0)];
    const r = representativePoint({ kind: 'polygon', rings: [c] });

    expect(r.how).toBe('polygon-vertex');
    expect(r.point).toEqual(p(0, 0));
  });

  it('falls back to a vertex across the antimeridian, where averaging is meaningless', () => {
    const r = representativePoint({ kind: 'polygon', rings: [[p(0, 170), p(0, -170), p(10, -170), p(10, 170), p(0, 170)]] });

    expect(r.how).toBe('polygon-vertex');
  });

  it('falls back to a vertex for a shape with no area', () => {
    const r = representativePoint({ kind: 'polygon', rings: [[p(0, 0), p(5, 5), p(10, 10), p(0, 0)]] });

    expect(r.how).toBe('polygon-vertex');
  });
});

describe('representativePoint — lines', () => {
  it('puts a line at the point halfway along its length', () => {
    const r = representativePoint({ kind: 'line', coords: [p(0, 0), p(10, 0)] });

    expect(r.how).toBe('line-midpoint');
    expect(r.point.lat).toBeCloseTo(5);
  });

  it('measures halfway by length, not by counting vertices', () => {
    // Three vertices bunched at the start and one far away: the middle vertex
    // is near the start, but halfway along the line is out past it.
    const r = representativePoint({ kind: 'line', coords: [p(0, 0), p(1, 0), p(2, 0), p(20, 0)] });

    expect(r.point.lat).toBeCloseTo(10);
  });

  it('falls back to a vertex across the antimeridian', () => {
    expect(representativePoint({ kind: 'line', coords: [p(0, 170), p(0, -170)] }).how).toBe('line-vertex');
  });
});

describe('representativePoint — a point', () => {
  it('is itself', () => {
    expect(representativePoint({ kind: 'point', point: p(3, 4) })).toEqual({ point: p(3, 4), how: 'point' });
  });
});
