/**
 * Reading a GFS field at any place: what the heat map's hover says (WX1).
 * Between grid points it blends the four around it, as the shader's texture
 * does, so the number a person reads matches the colour under the pointer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeGrib2, type LatLonGrid } from '../grib2';
import { valueAt } from '../gfsGrid';

const ONE_DEGREE: LatLonGrid = { ni: 360, nj: 181, la1: 90, lo1: 0, la2: -90, lo2: 359, di: 1, dj: 1 };
/** A field whose value is a known function of place, so every answer can be worked by hand. */
function fieldOf(f: (lat: number, lon: number) => number) {
  const values = new Float32Array(360 * 181);
  for (let j = 0; j < 181; j++) for (let i = 0; i < 360; i++) values[j * 360 + i] = f(90 - j, i);
  return { grid: ONE_DEGREE, values };
}

describe('valueAt', () => {
  it('gives a grid point its own value', () => {
    const t = decodeGrib2(new Uint8Array(readFileSync('src/services/weather/gfs/__fixtures__/gfs.t18z.pgrb2.1p00.f003.tmp2m.grib2')));
    // ecCodes: (−3°, 300°) Manaus's cell, and (−78°, 167°) McMurdo's.
    expect(valueAt(t, -3, 300)).toBeCloseTo(308.70212, 4);
    expect(valueAt(t, -78, 167)).toBeCloseTo(261.60212, 4);
    // West longitudes are the same places as their eastern names.
    expect(valueAt(t, -3, -60)).toBeCloseTo(308.70212, 4);
  });

  it('blends the four points around a place, by distance', () => {
    const f = fieldOf((lat, lon) => lat * 10 + lon);
    expect(valueAt(f, 10.25, 20.5)).toBeCloseTo(10.25 * 10 + 20.5, 4);
    expect(valueAt(f, -45.9, 100.1)).toBeCloseTo(-459 + 100.1, 3);
  });

  it('blends across the date line, between 359° and 0°', () => {
    const f = fieldOf((_lat, lon) => (lon === 0 ? 100 : lon === 359 ? 0 : 50));
    expect(valueAt(f, 0, 359.25)).toBeCloseTo(25, 4);
    expect(valueAt(f, 0, -0.5)).toBeCloseTo(50, 4);
    expect(valueAt(f, 0, 360)).toBeCloseTo(100, 4);
  });

  it('reaches the poles, and holds there beyond them', () => {
    const f = fieldOf((lat) => (lat === 90 ? 7 : lat === 89 ? 9 : lat === -90 ? -3 : 0));
    expect(valueAt(f, 90, 123)).toBeCloseTo(7, 4);
    expect(valueAt(f, 89.5, 45)).toBeCloseTo(8, 4);
    expect(valueAt(f, -90, 0)).toBeCloseTo(-3, 4);
    expect(valueAt(f, 91, 0)).toBeCloseTo(7, 4);
  });

  it('says nothing for a place that is not a place', () => {
    const f = fieldOf(() => 1);
    expect(valueAt(f, Number.NaN, 0)).toBeNull();
    expect(valueAt(f, 0, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
