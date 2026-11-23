/**
 * A geohash names a rectangle, and the radius must come from the hash.
 *
 * Navcom's spec labelled its cell "COARSE (~20km)" and used a 5-character
 * worked example that is ±2.4km — an eight-fold disagreement between a
 * document's label and its own example, in the field whose only job is
 * preventing an operator from being located. Deriving the radius from the hash
 * makes that disagreement impossible to inherit.
 */
import { describe, it, expect } from 'vitest';
import { decodeGeohash } from '../geohash';

describe('decodeGeohash', () => {
  it('decodes a known hash to the right place', () => {
    // 'u4pruydqqvj' is the canonical geohash example (Jutland, Denmark).
    const cell = decodeGeohash('u4pruydqqvj');
    expect(cell).not.toBeNull();
    expect(cell!.lat).toBeCloseTo(57.64911, 3);
    expect(cell!.lon).toBeCloseTo(10.40744, 3);
  });

  it('reports a radius that grows as the hash shortens', () => {
    const chars = [4, 5, 6, 7];
    const radii = chars.map((n) => decodeGeohash('u4pruydqqvj'.slice(0, n))!.radiusM);
    // Strictly decreasing: each extra character must buy precision.
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeLessThan(radii[i - 1]);
    }
  });

  it('puts a 4-character cell in the tens of kilometres, not the hundreds', () => {
    // The order of magnitude Navcom's "COARSE (~20km)" label claims.
    const cell = decodeGeohash('u4pr')!;
    expect(cell.precisionChars).toBe(4);
    expect(cell.radiusM).toBeGreaterThan(10_000);
    expect(cell.radiusM).toBeLessThan(30_000);
  });

  it('narrows the cell towards the poles, because longitude degrees do', () => {
    /*
     * Not a detail. A 4-character cell is ~22km at the equator and ~14km at
     * 57°N, so a single nominal "~20km" figure is wrong nearly everywhere.
     * My own first version of the test above asserted the equatorial number
     * against a Danish hash and failed — which is the argument for deriving
     * the radius from the hash and its latitude rather than quoting a table.
     */
    const equator = decodeGeohash('s000')!;   // lat ~0
    const denmark = decodeGeohash('u4pr')!;   // lat ~57.6
    expect(Math.abs(equator.lat)).toBeLessThan(5);
    expect(denmark.lat).toBeGreaterThan(50);
    expect(denmark.radiusM).toBeLessThan(equator.radiusM);
    // Same cell size in degrees, though — the difference is projection only.
    expect(denmark.lonErrorDeg).toBeCloseTo(equator.lonErrorDeg, 10);
  });

  it('puts a 5-character cell near 2.4km, which is what the example actually was', () => {
    const cell = decodeGeohash('u4pru')!;
    expect(cell.radiusM).toBeGreaterThan(1_500);
    expect(cell.radiusM).toBeLessThan(4_000);
  });

  it('contains the cell — a corner is inside the radius', () => {
    const cell = decodeGeohash('u4pr')!;
    // Distance from centre to the corner, computed independently of the
    // decoder's own arithmetic.
    const latM = cell.latErrorDeg * 111_320;
    const lonM = cell.lonErrorDeg * 111_320 * Math.cos((cell.lat * Math.PI) / 180);
    const corner = Math.sqrt(latM * latM + lonM * lonM);
    expect(cell.radiusM).toBeGreaterThanOrEqual(Math.floor(corner));
  });

  it('returns null rather than a default position for anything unparseable', () => {
    // There is no such thing as a fallback location, so every one of these is
    // a rejection and not a (0,0).
    for (const bad of ['', '   ', 'a4pr', 'i4pr', 'l4pr', 'o4pr', 'u4p!', '???']) {
      expect(decodeGeohash(bad), `"${bad}" should not decode`).toBeNull();
    }
  });

  it('accepts upper case, since relays do not normalise tag values', () => {
    expect(decodeGeohash('U4PR')).toEqual(decodeGeohash('u4pr'));
  });
});
