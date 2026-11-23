/**
 * The Finder's positive controls (decision D-PW, PW61, PW70), on the history as baked: the Zones nearest the plate
 * boundaries hold far more earthquakes per area than the farthest, and storms return 27 days after a storm more
 * often than the usual, both effects already known, so the machinery shows it can find them.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getFinderOpen, platesByTenth, setFinderOpen, stormsAfterStorms, type FinderPlatesFile } from '../finder';
import { readEventSet, type EventSetFile } from '../timestream/eventSets';

const plates = JSON.parse(readFileSync('public/data/psi-finder-plates.json', 'utf8')) as FinderPlatesFile;
const storms = readEventSet(JSON.parse(readFileSync('public/data/psi-events-storms.json', 'utf8')) as EventSetFile)!;

describe('a Zone on a plate boundary', () => {
  it('holds every Zone with its share near a boundary, and the quakes the event set placed', () => {
    expect(plates.withinKm).toBe(150);
    expect(plates.zones.length).toBeGreaterThan(200);
    expect(plates.zones.every((z) => z.share >= 0 && z.share <= 1 && z.areaKm2 > 0)).toBe(true);
    // Every placed quake outside the years held back for sealed tests (PW75), 2000–2024.
    const quakes = readEventSet(JSON.parse(readFileSync('public/data/psi-events-quakes.json', 'utf8')) as EventSetFile)!;
    const open = [...quakes.zone!].filter((z, i) => z >= 0 && (quakes.ms[i] < Date.UTC(2000, 0, 1) || quakes.ms[i] >= Date.UTC(2025, 0, 1))).length;
    expect(plates.zones.reduce((n, z) => n + z.quakes, 0)).toBe(open);
    expect(plates.heldBack).toBe('2000–2024');
  });

  it('finds the known: the most resonant tenth of Zones far above the usual, the least far below', () => {
    const { tenths, usual } = platesByTenth(plates);
    expect(tenths).toHaveLength(10);
    expect(tenths[9].rate).toBeGreaterThan(2 * usual);
    expect(tenths[0].rate).toBeLessThan(usual / 2);
    expect(tenths.reduce((n, t) => n + t.zones, 0)).toBe(plates.zones.length);
  });
});

describe('a 27-day return of geomagnetic activity', () => {
  it('finds the known in the open years (1932–1965): more storms begin 27 days after a storm than the usual, and than at 13 days', () => {
    const { counts, usual } = stormsAfterStorms(storms, 60);
    expect(counts).toHaveLength(60);
    expect(counts[26]).toBeGreaterThan(1.4 * usual);
    expect(counts[26]).toBeGreaterThan(counts[12]);
    // Consecutive storm days are one storm: none begins the day after another.
    expect(counts[0]).toBe(0);
  });
});

describe('the archetype open', () => {
  it('is shared and closes', () => {
    setFinderOpen('plates');
    expect(getFinderOpen()).toBe('plates');
    setFinderOpen(null);
    expect(getFinderOpen()).toBeNull();
  });
});
