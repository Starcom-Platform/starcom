/**
 * The e-field's colour field (space-weather-visualization.md, SW1, SW2): every cell of
 * NOAA's grid in one texture, coloured on a log scale of mV/km, on a patch of the
 * sphere over the grid alone.
 */
import { describe, expect, it } from 'vitest';
import { E_FIELD_RANGE, RELIEF_MAX, azimuthOf, eFieldDirectionRgb, eFieldRgb, eFieldTextureData, patchPositions, relativeRange, reliefHeight } from '../eFieldShell';
import type { EFieldGrid } from '../../../../services/spaceWeather/eFieldGrid';
import { DATA_SCALES } from '../../../../styles/tokens';

const bytes = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
const grid = (cells: Array<[number, number] | null>, cols: number): EFieldGrid => {
  const rows = cells.length / cols;
  const east = new Float32Array(cells.length).fill(Number.NaN);
  const north = new Float32Array(cells.length).fill(Number.NaN);
  const model = new Uint8Array(cells.length);
  cells.forEach((c, k) => { if (c) { east[k] = c[0]; north[k] = c[1]; model[k] = 2; } });
  return { lon0: -100, lat0: 40, step: 0.5, cols, rows, east, north, model, count: cells.filter(Boolean).length, fromInterMag: 0, fromUsCanada: 0, maxMagnitude: 0, timestamp: null };
};

describe('the e-field ramp', () => {
  it('is the token\'s colour at each stop, and log-blended between them', () => {
    for (const [mvkm, hex] of DATA_SCALES.eFieldMvKm) expect(eFieldRgb(mvkm)).toEqual(bytes(hex));
    // Halfway in log between 1 and 3 mV/km is √3.
    const stop = (mvkm: number) => bytes(DATA_SCALES.eFieldMvKm.find(([v]) => v === mvkm)![1]);
    const [a, b] = [stop(1), stop(3)];
    expect(eFieldRgb(Math.sqrt(3))).toEqual([0, 1, 2].map((k) => Math.round((a[k] + b[k]) / 2)));
  });

  it('holds its ends past them, and spans the token\'s range', () => {
    expect(eFieldRgb(0.01)).toEqual(bytes(DATA_SCALES.eFieldMvKm[0][1]));
    expect(eFieldRgb(1e6)).toEqual(bytes(DATA_SCALES.eFieldMvKm[DATA_SCALES.eFieldMvKm.length - 1][1]));
    expect(E_FIELD_RANGE).toEqual([Math.log10(0.1), Math.log10(3000)]);
  });
});

describe('the field as a texture', () => {
  it('holds each cell\'s east and north, and whether a model holds it, row by row from the south', () => {
    const data = eFieldTextureData(grid([[3, 4], null, null, [-1, 2]], 2));
    expect(Array.from(data.slice(0, 4))).toEqual([3, 4, 1, 0]);
    // An empty cell is nought with no coverage, so blending toward it fades the field out rather than drawing zero.
    expect(Array.from(data.slice(4, 8))).toEqual([0, 0, 0, 0]);
    expect(Array.from(data.slice(12, 16))).toEqual([-1, 2, 1, 0]);
  });
});

describe('the relative scale', () => {
  it('spans the field drawn now, its 2nd to 98th percentile', () => {
    const cells = Array.from({ length: 100 }, (_, k) => [k + 1, 0] as [number, number]);
    const [lo, hi] = relativeRange(grid(cells, 10));
    expect(lo).toBeCloseTo(Math.log10(3), 1);
    expect(hi).toBeCloseTo(Math.log10(98), 1);
  });

  it('is at least a decade wide, round the middle, when the field is nearly even', () => {
    const [lo, hi] = relativeRange(grid(Array.from({ length: 4 }, () => [10, 0] as [number, number]), 2));
    expect(hi - lo).toBeCloseTo(1, 6);
    expect((lo + hi) / 2).toBeCloseTo(1, 6);
  });

  it('falls back to the absolute range for an empty field', () => {
    expect(relativeRange(grid([null, null], 2))).toEqual(E_FIELD_RANGE);
  });
});

describe('the patch it is drawn on', () => {
  it('lies on the sphere and covers the grid with half a cell to spare', () => {
    const g = grid(Array.from({ length: 6 }, () => [1, 1] as [number, number]), 3);
    const positions = patchPositions(g, 100.1);
    const lats: number[] = [], lons: number[] = [];
    for (let k = 0; k < positions.length; k += 3) {
      const [x, y, z] = [positions[k], positions[k + 1], positions[k + 2]];
      expect(Math.hypot(x, y, z)).toBeCloseTo(100.1, 4);
      lats.push((Math.asin(y / 100.1) * 180) / Math.PI);
      lons.push((Math.atan2(x, z) * 180) / Math.PI);
    }
    expect(Math.min(...lats)).toBeCloseTo(39.75, 4);
    expect(Math.max(...lats)).toBeCloseTo(40.75, 4);
    expect(Math.min(...lons)).toBeCloseTo(-100.25, 4);
    expect(Math.max(...lons)).toBeCloseTo(-98.75, 4);
  });
});

// Step 2: the relief look (SW1), coloured by the way the field points and raised by its strength.
describe('the relief look', () => {
  it('colours a direction by the wheel\'s four hues, blended round between them', () => {
    for (const [deg, hex] of DATA_SCALES.eFieldDirection) expect(eFieldDirectionRgb(deg)).toEqual(bytes(hex));
    const [north, west] = [bytes(DATA_SCALES.eFieldDirection[0][1]), bytes(DATA_SCALES.eFieldDirection[3][1])];
    // Halfway from west back round to north.
    expect(eFieldDirectionRgb(315)).toEqual([0, 1, 2].map((k) => Math.round((west[k] + north[k]) / 2)));
    expect(eFieldDirectionRgb(-45)).toEqual(eFieldDirectionRgb(315));
    expect(eFieldDirectionRgb(405)).toEqual(eFieldDirectionRgb(45));
  });

  it('reads a direction as NOAA\'s components give it: north is 0°, east 90°', () => {
    expect(azimuthOf(0, 1)).toBeCloseTo(0, 6);
    expect(azimuthOf(1, 0)).toBeCloseTo(90, 6);
    expect(azimuthOf(0, -1)).toBeCloseTo(180, 6);
    expect(azimuthOf(-1, 0)).toBeCloseTo(270, 6);
  });

  it('raises a stronger field higher, on the same log scale as the colours, from nothing to its most', () => {
    expect(reliefHeight(0.1)).toBe(0);
    expect(reliefHeight(3000)).toBe(RELIEF_MAX);
    expect(reliefHeight(1e6)).toBe(RELIEF_MAX);
    expect(reliefHeight(Math.sqrt(0.1 * 3000))).toBeCloseTo(RELIEF_MAX / 2, 6);
  });
});
