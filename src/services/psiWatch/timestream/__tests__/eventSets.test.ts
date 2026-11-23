/**
 * Mecha Jono's event set as Psi Watch reads it (decision D-PW, PW46, PW51): the baked files' moments in order, each
 * event's place and ZSP 2.0 Zone, and the events lane's counts by day, week and year inside each set's record.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { bucketFor, bucketStart, eventBars, readEventSet, type EventSetFile } from '../eventSets';

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const served = (id: string) => JSON.parse(readFileSync(`public/data/psi-events-${id}.json`, 'utf8')) as EventSetFile;

describe('the baked sets', () => {
  it('count Mecha Jono\'s storms a year as their own set does, 22 in 1980', () => {
    const storms = readEventSet(served('storms'))!;
    const year = (y: number) => eventBars(storms, { startMs: Date.UTC(y, 0, 1), spanMs: Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1) - 1 }, 'year')[0].count;
    expect(storms.ms.length).toBe(2985);
    expect([year(1940), year(1980), year(2020), year(2025)]).toEqual([39, 22, 2, 32]);
    expect(storms.lat).toBeNull();
  });

  it('hold every conflict episode and earthquake in time order, placed, most in a ZSP 2.0 Zone', () => {
    for (const [id, rows] of [['conflict', 119143], ['quakes', 12160]] as const) {
      const set = readEventSet(served(id))!;
      expect(set.ms.length).toBe(rows);
      for (let i = 1; i < set.ms.length; i++) if (set.ms[i] < set.ms[i - 1]) throw new Error(`${id} out of order at ${i}`);
      expect(set.zones.every((z) => z.startsWith('zone:'))).toBe(true);
      const inZone = set.zone!.reduce((n, z) => n + (z >= 0 ? 1 : 0), 0);
      expect(inZone / rows).toBeGreaterThan(0.5);
      expect(set.fromMs).toBeLessThan(set.ms[0] + DAY);
      expect(set.untilMs).toBe(Date.UTC(2025, 11, 31));
    }
  });

  it('carry no field that names a person, and say whose they are', () => {
    for (const id of ['conflict', 'quakes', 'storms']) {
      const file = served(id);
      expect(Object.keys(file).sort()).not.toContain('name');
      expect(file.licence.length).toBeGreaterThan(5);
      expect(file.credit.length).toBeGreaterThan(10);
      expect(file.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('the events lane\'s counts', () => {
  const file: EventSetFile = {
    set: 'conflict', kind: 'k', time: 't', licence: 'CC BY 4.0', credit: 'c', laterEvents: 'l', source: { file: 'f', sha256: 'x' },
    rows: 4, fromMs: Date.UTC(2020, 0, 1), untilMs: Date.UTC(2020, 11, 31), zones: ['zone:a'],
    // 1 Jan, 2 Jan, 2 Jan, 9 Jan 2020 as steps of days.
    t: [Date.UTC(2020, 0, 1) / DAY, 1, 0, 7], lat: [100, 200, 300, 400], lon: [0, 0, 0, 0], zone: [0, -1, 0, 0],
  };

  it('reads the steps back into moments, and the places into degrees', () => {
    const set = readEventSet(file)!;
    expect([...set.ms]).toEqual([Date.UTC(2020, 0, 1), Date.UTC(2020, 0, 2), Date.UTC(2020, 0, 2), Date.UTC(2020, 0, 9)]);
    expect(set.lat![1]).toBeCloseTo(2, 5);
    expect([...set.zone!]).toEqual([0, -1, 0, 0]);
    expect(readEventSet({ ...file, rows: 5 })).toBeNull();
  });

  it('counts by day to two months, by week from Monday to three years, by year beyond', () => {
    expect([bucketFor(30 * DAY), bucketFor(YEAR), bucketFor(10 * YEAR)]).toEqual(['day', 'week', 'year']);
    // 1 Jan 2020 was a Wednesday: its week began on Monday 30 Dec 2019.
    expect(bucketStart(Date.UTC(2020, 0, 1, 15), 'week')).toBe(Date.UTC(2019, 11, 30));
    const set = readEventSet(file)!;
    const days = eventBars(set, { startMs: Date.UTC(2020, 0, 1), spanMs: 10 * DAY }, 'day');
    expect(days.slice(0, 3).map((b) => b.count)).toEqual([1, 2, 0]);
    const weeks = eventBars(set, { startMs: Date.UTC(2020, 0, 1), spanMs: 14 * DAY }, 'week');
    expect(weeks.map((b) => b.count)).toEqual([3, 1, 0]);
  });

  it('draws nothing outside the set\'s record', () => {
    const set = readEventSet(file)!;
    expect(eventBars(set, { startMs: Date.UTC(2023, 0, 1), spanMs: 30 * DAY }, 'day')).toEqual([]);
    const across = eventBars(set, { startMs: Date.UTC(2019, 11, 25), spanMs: 20 * DAY }, 'day');
    expect(across[0].fromMs).toBe(Date.UTC(2020, 0, 1));
  });
});
