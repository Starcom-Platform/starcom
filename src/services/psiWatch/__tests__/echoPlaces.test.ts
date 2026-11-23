/**
 * Where an Echo's events stood (decision D-PW, PW47, PW54, PW69): every return's events with the newest brightest,
 * the isolated one alone; a heat whose most is 1 and whose seam at 180° holds together; each Zone's count.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { echoPoints, heatGrid, HEAT_COLS, HEAT_ROWS, HEAT_STEP, zoneCounts } from '../echoPlaces';
import { readEventSet } from '../timestream/eventSets';
import type { Echo } from '../timestream/echoes';
import type { PsiSkyEvent } from '../psiEvents';

const DAY = 86_400_000;
const set = readEventSet({
  set: 'quakes', kind: 'k', time: 't', licence: 'public domain', credit: 'c', laterEvents: 'l', source: { file: 'f', sha256: 'x' },
  rows: 3, fromMs: Date.UTC(1992, 0, 1), untilMs: Date.UTC(1992, 11, 31), zones: ['zone:ring-of-fire', 'zone:levant'],
  // 2 Feb, 2 Feb + 1 h, 3 Apr 2020.
  t: [Date.UTC(1992, 1, 2) / 1000, 3600, (Date.UTC(1992, 3, 3) - Date.UTC(1992, 1, 2)) / 1000 - 3600],
  lat: [1000, 1100, 3300], lon: [17900, -17900, 3500], zone: [0, 0, 1],
})!;
const echo: Echo = {
  address: 'w', title: 't', event: {} as PsiSkyEvent, beforeMs: DAY, afterMs: DAY,
  returns: [Date.UTC(1992, 1, 2), Date.UTC(1992, 3, 3)], isolated: null,
};

describe('an Echo\'s places', () => {
  it('gathers every return\'s events, the newest return brightest, or the isolated one alone', () => {
    const all = echoPoints(echo, set);
    expect(all.map((p) => [p.lat, p.newness])).toEqual([[10, 0.25], [11, 0.25], [33, 1]]);
    expect(echoPoints({ ...echo, isolated: Date.UTC(1992, 1, 2) }, set).map((p) => p.newness)).toEqual([1, 1]);
  });

  it('heats the grid, its warmest fiftieth at 1, across the seam at 180°', () => {
    const grid = heatGrid(echoPoints(echo, set));
    expect(Math.max(...grid)).toBeCloseTo(1, 6);
    const at = (lat: number, lon: number) => grid[Math.round((lat + 90) / HEAT_STEP) * HEAT_COLS + Math.round((lon + 180) / HEAT_STEP)];
    // Two quakes either side of the date line warm both edges alike.
    expect(at(10, 180)).toBeCloseTo(at(10, -180), 6);
    expect(at(10, 178)).toBeGreaterThan(0.1);
    expect(at(-60, 0)).toBe(0);
    expect(grid.length).toBe(HEAT_ROWS * HEAT_COLS);
  });

  it('counts each Zone\'s events', () => {
    const { counts, most } = zoneCounts(echo, set);
    expect([...counts]).toEqual([['zone:ring-of-fire', 2], ['zone:levant', 1]]);
    expect(most).toBe(2);
  });
});
