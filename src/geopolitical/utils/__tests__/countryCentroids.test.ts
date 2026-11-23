import { describe, it, expect } from 'vitest';
import { latLonToVector3 } from '../latLonToVector3';
import { computeCountryCentroids, type CentroidSourcePart } from '../countryCentroids';

// Baked positions are built via latLonToVector3(lat, lon, {invertX:false}) with
// z negated on write (see geometryFactory.ts's writeVertex / NationalTerritoriesService's
// buildTerritoriesFromBaked) — reproduce that exact convention for fixtures.
function bakedPoint(lat: number, lon: number): [number, number, number] {
  const v = latLonToVector3(lat, lon, { radius: 100, elevation: 0.5, invertX: false });
  return [v.x, v.y, -v.z];
}

function triangle(points: [number, number, number][]): { positions: number[]; indices: number[] } {
  return { positions: points.flat(), indices: [0, 1, 2] };
}

function haversineDeg(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  // Cheap planar approximation is fine at these small test scales.
  return Math.hypot(a.lat - b.lat, a.lng - b.lng);
}

describe('computeCountryCentroids', () => {
  it('recovers approximately the source lat/lng for a small triangle', () => {
    const part: CentroidSourcePart = {
      countryCode: 'AAA',
      ...triangle([bakedPoint(10.1, 20), bakedPoint(9.9, 19.9), bakedPoint(9.9, 20.1)])
    };
    const result = computeCountryCentroids([part]);
    const centroid = result.get('AAA');
    expect(centroid).toBeDefined();
    expect(haversineDeg(centroid!, { lat: 10, lng: 20 })).toBeLessThan(0.5);
  });

  it('area-weights a multi-part country toward its larger part, not a plain average', () => {
    // A big part at (0,0) and a tiny part at (50,50), same countryCode. A plain
    // (unweighted) average of the two parts' own centroids would land near
    // (25,25) — nowhere close to either. Area-weighting should keep the result
    // near the big part and far from the tiny one.
    const bigPart: CentroidSourcePart = {
      countryCode: 'BBB',
      ...triangle([bakedPoint(10, 0), bakedPoint(-10, -10), bakedPoint(-10, 10)])
    };
    const tinyPart: CentroidSourcePart = {
      countryCode: 'BBB',
      ...triangle([bakedPoint(50.01, 50), bakedPoint(49.99, 49.99), bakedPoint(49.99, 50.01)])
    };
    const result = computeCountryCentroids([bigPart, tinyPart]);
    const centroid = result.get('BBB');
    expect(centroid).toBeDefined();
    const distFromBig = haversineDeg(centroid!, { lat: 0, lng: 0 });
    const distFromTiny = haversineDeg(centroid!, { lat: 50, lng: 50 });
    const distFromPlainAverage = haversineDeg(centroid!, { lat: 25, lng: 25 });
    expect(distFromBig).toBeLessThan(10);
    expect(distFromTiny).toBeGreaterThan(50);
    expect(distFromBig).toBeLessThan(distFromPlainAverage);
  });

  it('skips parts with no countryCode entirely', () => {
    const part: CentroidSourcePart = { ...triangle([bakedPoint(5, 5), bakedPoint(4, 4), bakedPoint(4, 6)]) };
    const result = computeCountryCentroids([part]);
    expect(result.size).toBe(0);
  });

  it('skips a degenerate (empty geometry) part without affecting other countries', () => {
    const degenerate: CentroidSourcePart = { countryCode: 'CCC', positions: [], indices: [] };
    const valid: CentroidSourcePart = {
      countryCode: 'DDD',
      ...triangle([bakedPoint(1, 1), bakedPoint(0, 0), bakedPoint(0, 2)])
    };
    const result = computeCountryCentroids([degenerate, valid]);
    expect(result.has('CCC')).toBe(false);
    expect(result.has('DDD')).toBe(true);
  });

  it('ignores a zero-area (degenerate) triangle mixed into an otherwise valid part', () => {
    const p0 = bakedPoint(2, 2);
    const validAndDegenerate: CentroidSourcePart = {
      countryCode: 'EEE',
      positions: [...p0, ...bakedPoint(1, 1), ...bakedPoint(1, 3), ...p0, ...p0].flat(),
      // triangle 0: real (0,1,2); triangle 1: degenerate, all three indices point at p0 (index 3/4/5, but 3 IS p0 again)
      indices: [0, 1, 2, 3, 3, 3]
    };
    const result = computeCountryCentroids([validAndDegenerate]);
    const centroid = result.get('EEE');
    expect(centroid).toBeDefined();
    expect(Number.isFinite(centroid!.lat)).toBe(true);
    expect(Number.isFinite(centroid!.lng)).toBe(true);
    // Only the real triangle should have contributed area — result should still
    // land close to its (2,2)-centered footprint, not be skewed by the degenerate one.
    expect(haversineDeg(centroid!, { lat: 2, lng: 2 })).toBeLessThan(2);
  });

  it('returns an empty map for an empty input array', () => {
    expect(computeCountryCentroids([]).size).toBe(0);
  });
});

/** A lat/lng box as two triangles, appended to a part being built. */
function addBox(part: { positions: number[]; indices: number[] }, lat0: number, lat1: number, lng0: number, lng1: number) {
  const base = part.positions.length / 3;
  part.positions.push(...bakedPoint(lat0, lng0), ...bakedPoint(lat0, lng1), ...bakedPoint(lat1, lng1), ...bakedPoint(lat1, lng0));
  part.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return part;
}
const inBox = (c: { lat: number; lng: number }, lat0: number, lat1: number, lng0: number, lng1: number, slack = 0.5) =>
  c.lat >= lat0 - slack && c.lat <= lat1 + slack && c.lng >= lng0 - slack && c.lng <= lng1 + slack;

describe('computeCountryCentroids — a point on the country\'s own land', () => {
  it('places a country with a distant second part on its largest part, not in the sea between them', () => {
    // A mainland and an overseas part a sixth its size — France and French Guiana, in
    // shape. Averaged, the point lands in the ocean between them.
    const mainland = addBox({ countryCode: 'FFF', positions: [], indices: [] }, 42, 50, -2, 6);
    const overseas = addBox({ countryCode: 'FFF', positions: [], indices: [] }, 2, 6, -54, -50);
    const c = computeCountryCentroids([mainland, overseas]).get('FFF')!;
    expect(inBox(c, 42, 50, -2, 6)).toBe(true);
  });

  it('places a C-shaped country on its own land, not in the gap its shape encloses', () => {
    // Two arms and a bar across their feet, one part. Its centroid is in the gap.
    const part = { countryCode: 'CCC', positions: [] as number[], indices: [] as number[] };
    addBox(part, -10, 10, -10, -6);
    addBox(part, -10, 10, 6, 10);
    addBox(part, -10, -6, -6, 6);
    const c = computeCountryCentroids([part]).get('CCC')!;
    const onLand = inBox(c, -10, 10, -10, -6) || inBox(c, -10, 10, 6, 10) || inBox(c, -10, -6, -6, 6);
    expect(onLand).toBe(true);
  });

  it('keeps the centroid itself when the country covers it', () => {
    const c = computeCountryCentroids([addBox({ countryCode: 'SSS', positions: [], indices: [] }, -4, 4, 16, 24)]).get('SSS')!;
    expect(haversineDeg(c, { lat: 0, lng: 20 })).toBeLessThan(0.5);
  });
});
