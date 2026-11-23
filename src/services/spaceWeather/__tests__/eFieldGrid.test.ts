/**
 * The geoelectric field as one grid (space-weather-visualization.md, SW1): NOAA's two
 * models on their shared 0.5° grid, every sample kept, the 3D model where it has one.
 */
import { describe, expect, it } from 'vitest';
import { eFieldAt, eFieldGrid } from '../eFieldGrid';
import type { ProcessedElectricFieldData } from '../../../types/data/spaceWeather';

const sample = (longitude: number, latitude: number, ex: number, ey: number) => ({
  longitude, latitude, ex, ey, magnitude: Math.hypot(ex, ey), direction: 0, quality: 5, stationDistance: 0,
});
const set = (source: ProcessedElectricFieldData['source'], vectors: ReturnType<typeof sample>[], timestamp = '2026-10-10T12:15:30Z') =>
  ({ timestamp, source, unit: 'mV/km', vectors, coverage: { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 }, statistics: {} }) as unknown as ProcessedElectricFieldData;

const INTERMAG = set('InterMagEarthScope', [sample(-100, 40, 3, 4), sample(-99.5, 40, 1, 0)]);
const US_CANADA = set('US-Canada-1D', [sample(-100, 40, 9, 9), sample(-120, 55, -2, 1)], '2026-10-10T12:16:30Z');

describe('the e-field grid', () => {
  it('keeps every sample on the 0.5° grid, north from Ex and east from Ey, as NOAA states them', () => {
    const grid = eFieldGrid({ interMag: INTERMAG, usCanada: null })!;
    expect(grid).toMatchObject({ lon0: -100, lat0: 40, step: 0.5, cols: 2, rows: 1, count: 2, fromInterMag: 2, fromUsCanada: 0 });
    expect(eFieldAt(grid, 40, -100)).toEqual({ north: 3, east: 4, magnitude: 5, model: 'InterMagEarthScope' });
    expect(eFieldAt(grid, 40, -99.5)).toMatchObject({ north: 1, east: 0, magnitude: 1 });
  });

  it('takes the 3D model where both have a value, and the 1D model where only it does', () => {
    const grid = eFieldGrid({ interMag: INTERMAG, usCanada: US_CANADA })!;
    expect(grid).toMatchObject({ lon0: -120, lat0: 40, cols: 42, rows: 31, count: 3, fromInterMag: 2, fromUsCanada: 1 });
    expect(eFieldAt(grid, 40, -100)).toMatchObject({ north: 3, east: 4, model: 'InterMagEarthScope' });
    expect(eFieldAt(grid, 55, -120)).toEqual({ north: -2, east: 1, magnitude: Math.hypot(2, 1), model: 'US-Canada-1D' });
    // A cell no model holds is empty, never zero.
    expect(eFieldAt(grid, 45, -110)).toBeNull();
    expect(Number.isNaN(grid.east[(10 * grid.cols) + 20])).toBe(true);
    // The newest of the two files read.
    expect(grid.timestamp).toBe('2026-10-10T12:16:30Z');
    // The strongest kept: the 1D model's 12.7 at the shared cell gave way to the 3D model's 5.
    expect(grid.maxMagnitude).toBe(5);
  });

  it('draws only the grids asked for', () => {
    expect(eFieldGrid({ interMag: INTERMAG, usCanada: US_CANADA }, 'usCanada')).toMatchObject({ count: 2, fromInterMag: 0, fromUsCanada: 2 });
    expect(eFieldGrid({ interMag: INTERMAG, usCanada: US_CANADA }, 'interMag')).toMatchObject({ count: 2, fromInterMag: 2, fromUsCanada: 0 });
    expect(eFieldGrid({ interMag: null, usCanada: US_CANADA }, 'interMag')).toBeNull();
    expect(eFieldGrid({ interMag: null, usCanada: null })).toBeNull();
  });

  it('places a sample off the grid in its nearest cell, and answers only within half a step of one', () => {
    const grid = eFieldGrid({ interMag: set('InterMagEarthScope', [sample(-100.24, 39.76, 1, 1)]), usCanada: null })!;
    expect(grid).toMatchObject({ lon0: -100, lat0: 40, count: 1 });
    expect(eFieldAt(grid, 40.2, -99.8)).toMatchObject({ north: 1, east: 1 });
    expect(eFieldAt(grid, 40.3, -100)).toBeNull();
    expect(eFieldAt(grid, 40, -101)).toBeNull();
  });

  it('skips a sample whose components are not numbers', () => {
    const grid = eFieldGrid({ interMag: set('InterMagEarthScope', [sample(-100, 40, Number.NaN, 1), sample(-99.5, 40, 1, 1)]), usCanada: null })!;
    expect(grid.count).toBe(1);
  });
});
