/**
 * Where the e-field's streaks start (space-weather-visualization.md, SW1): only in cells a
 * model holds, anywhere within them, and the same way for the same moment, so a still is
 * drawn again the same.
 */
import { describe, expect, it } from 'vitest';
import { seedParticles } from '../eFieldFlow';
import type { EFieldGrid } from '../../../../services/spaceWeather/eFieldGrid';

// Three columns, two rows: only the south-west and the north-east cells hold the field.
const GRID: EFieldGrid = {
  lon0: -100, lat0: 40, step: 0.5, cols: 3, rows: 2,
  east: new Float32Array([1, Number.NaN, Number.NaN, Number.NaN, Number.NaN, 2]),
  north: new Float32Array([1, Number.NaN, Number.NaN, Number.NaN, Number.NaN, 2]),
  model: new Uint8Array([2, 0, 0, 0, 0, 1]),
  count: 2, fromInterMag: 1, fromUsCanada: 1, maxMagnitude: 2.8, timestamp: null,
};

describe('where the streaks start', () => {
  it('only within a cell a model holds, spread over each', () => {
    const data = new Float32Array(400 * 4);
    seedParticles(data, 12.5, GRID);
    const cells = new Set<string>();
    for (let k = 0; k < data.length; k += 4) {
      const [lon, lat] = [data[k], data[k + 1]];
      const i = Math.round((lon - GRID.lon0) / GRID.step), j = Math.round((lat - GRID.lat0) / GRID.step);
      expect(GRID.model[j * GRID.cols + i]).toBeGreaterThan(0);
      cells.add(`${i},${j}`);
      expect(Math.abs(lon - (GRID.lon0 + i * GRID.step))).toBeLessThanOrEqual(GRID.step / 2);
      // Part way through its life, never past it.
      expect(data[k + 2]).toBeGreaterThanOrEqual(0);
      expect(data[k + 2]).toBeLessThanOrEqual(3 * (1 + data[k + 3]));
    }
    expect([...cells].sort()).toEqual(['0,0', '2,1']);
  });

  it('the same way for the same moment, another way for another', () => {
    const [a, b, c] = [new Float32Array(40), new Float32Array(40), new Float32Array(40)];
    seedParticles(a, 12.5, GRID);
    seedParticles(b, 12.5, GRID);
    seedParticles(c, 13.5, GRID);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });
});
