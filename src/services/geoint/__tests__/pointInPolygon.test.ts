/**
 * The geometry that decides which territory a report falls in.
 *
 * Tested against real Natural Earth polygons as well as hand-made squares:
 * a ray-casting bug that a unit square cannot show — a hole, a concave edge,
 * a point exactly on a vertex — is the kind that misplaces a report by a
 * country.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pointInRing, pointInPolygon, pointInGeometry, boundsOf, type Ring } from '../pointInPolygon';

/** A square from (0,0) to (10,10), as [lng, lat]. */
const square: Ring = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
/** A hole from (4,4) to (6,6). */
const hole: Ring = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];

describe('pointInRing', () => {
  it('is inside for a point in the middle', () => {
    expect(pointInRing(5, 5, square)).toBe(true);
  });

  it('is outside for a point beyond every edge', () => {
    expect(pointInRing(15, 5, square)).toBe(false);
    expect(pointInRing(5, -5, square)).toBe(false);
  });

  it('does not confuse latitude with longitude', () => {
    // A square spanning 0..10 in both is symmetric and would hide a transpose,
    // so this one is deliberately not.
    const tall: Ring = [[0, 0], [2, 0], [2, 20], [0, 20], [0, 0]];
    expect(pointInRing(15, 1, tall)).toBe(true);   // lat 15, lon 1 — inside
    expect(pointInRing(1, 15, tall)).toBe(false);  // transposed — outside
  });
});

describe('a point on an edge two rings share', () => {
  // A traced partition's neighbours share every edge, each ring running it the other way. A point exactly on it must
  // fall in exactly one of them, or a coverage check calls it a hole or an overlap. Lattice values like these are the
  // kind a 0.1° trace keeps, and they are not exact in binary.
  const edge: Array<[number, number]> = [[-12.3, 41.7], [-11.9, 43.1], [-10.2, 43.9], [-9.7, 46.3]];
  const west: Ring = [...edge, [-20, 46.3], [-20, 41.7], edge[0]];
  const east: Ring = [[0, 41.7], [0, 46.3], ...[...edge].reverse(), [0, 41.7]];

  it('falls in exactly one at every vertex and along every segment', () => {
    // Not the top end: a point on the partition's own top edge belongs to whatever lies above, here neither ring.
    const points: Array<[number, number]> = edge.slice(0, -1);
    for (let i = 0; i + 1 < edge.length; i += 1) {
      for (let k = 1; k < 10; k += 1) {
        const [x0, y0] = edge[i]; const [x1, y1] = edge[i + 1];
        points.push([x0 + ((x1 - x0) * k) / 10, y0 + ((y1 - y0) * k) / 10]);
      }
    }
    const off = points.filter(([lon, lat]) => Number(pointInRing(lat, lon, west)) + Number(pointInRing(lat, lon, east)) !== 1);
    expect(off).toEqual([]);
  });
});

describe('pointInPolygon', () => {
  it('excludes a point inside a hole', () => {
    expect(pointInPolygon(5, 5, [square, hole])).toBe(false);
    expect(pointInPolygon(2, 2, [square, hole])).toBe(true);
  });

  it('is outside for an empty ring list rather than throwing', () => {
    expect(pointInPolygon(5, 5, [])).toBe(false);
  });
});

describe('pointInGeometry', () => {
  it('accepts a MultiPolygon if any part contains the point', () => {
    const far: Ring = [[100, 100 - 100], [110, 0], [110, 10], [100, 10], [100, 0]];
    const geometry = { type: 'MultiPolygon' as const, coordinates: [[square], [far]] };
    expect(pointInGeometry(5, 5, geometry)).toBe(true);
    expect(pointInGeometry(5, 105, geometry)).toBe(true);
    expect(pointInGeometry(50, 50, geometry)).toBe(false);
  });
});

describe('against real Natural Earth territories', () => {
  const path = 'public/geopolitical/world-territories-lod0.geojson';
  const geo = JSON.parse(fs.readFileSync(path, 'utf8'));
  const find = (lat: number, lon: number) =>
    geo.features.filter((f: { geometry: never }) => pointInGeometry(lat, lon, f.geometry));

  it('places a coordinate in exactly one territory', () => {
    // Washington DC. More than one match would mean overlapping polygons or a
    // ring test that leaks.
    const hits = find(38.9072, -77.0369);
    expect(hits).toHaveLength(1);
  });

  it('places a mid-ocean coordinate in none', () => {
    // South Atlantic, far from any landmass.
    expect(find(-35, -25)).toHaveLength(0);
  });

  it('distinguishes neighbours', () => {
    const dc = find(38.9072, -77.0369)[0];
    const paris = find(48.8566, 2.3522)[0];
    expect(dc).toBeTruthy();
    expect(paris).toBeTruthy();
    expect(JSON.stringify(dc.properties)).not.toBe(JSON.stringify(paris.properties));
  });
});

describe('boundsOf', () => {
  it('bounds a polygon for narrowing before the precise test', () => {
    expect(boundsOf({ type: 'Polygon', coordinates: [square] })).toEqual([0, 0, 10, 10]);
  });
});
