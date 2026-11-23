/**
 * The GDELT snapshot: what the build writes, and what the app will and will
 * not accept from it. Built from real parsed rows (the export fixture), so the
 * round trip is exercised on data GDELT actually produced.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseGdeltExport } from '../gdeltEventExport';
import {
  buildGdeltSnapshot,
  readGdeltSnapshot,
  windowsEndingAt,
  GdeltSnapshotError,
  GDELT_WINDOWS_PER_SNAPSHOT,
} from '../gdeltSnapshot';

const REAL = parseGdeltExport(
  fs.readFileSync(path.join(__dirname, 'fixtures/gdelt-20260911170000.export.sample.csv'), 'utf8'),
);
const NEWEST = '20260911170000';
const requested = windowsEndingAt(NEWEST);
/** Built three minutes AFTER its newest window — the ordinary case. */
const LATE = new Date(Date.UTC(2026, 8, 11, 17, 3, 0));

function snapshot(opts: { received?: Map<string, typeof REAL>; retrievedAt?: Date } = {}) {
  return buildGdeltSnapshot({
    requested,
    received: opts.received ?? new Map([[NEWEST, REAL]]),
    retrievedAt: opts.retrievedAt ?? LATE,
  });
}

describe('buildGdeltSnapshot → readGdeltSnapshot', () => {
  it('round-trips every real event exactly', () => {
    const loaded = readGdeltSnapshot(JSON.parse(JSON.stringify(snapshot())));
    const byId = (list: typeof REAL) => [...list].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(loaded.events)).toEqual(byId(REAL));
  });

  it('lists the day of windows it asked for, and which did not arrive', () => {
    const s = snapshot();
    expect(s.windows.requested).toHaveLength(GDELT_WINDOWS_PER_SNAPSHOT);
    expect(s.windows.requested[0]).toBe(NEWEST);
    expect(s.windows.missing).toHaveLength(GDELT_WINDOWS_PER_SNAPSHOT - 1);
    expect(s.windows.missing).not.toContain(NEWEST);
  });

  /** Same windows, same bytes: the claim that makes it rebuildable from GDELT's archive. */
  it('is deterministic — input order does not change the output', () => {
    const shuffled = new Map([[NEWEST, [...REAL].reverse()]]);
    expect(JSON.stringify(snapshot({ received: shuffled }))).toBe(JSON.stringify(snapshot()));
  });

  it('counts one event once, however many windows carried it', () => {
    const second = requested[1];
    const s = snapshot({ received: new Map([[NEWEST, REAL], [second, REAL.slice(0, 5)]]) });
    expect(s.rows).toHaveLength(REAL.length);
  });
});

describe('asOf — the data\'s own time', () => {
  it('is the newest window that arrived', () => {
    const at = readGdeltSnapshot(snapshot()).asOf;
    expect(new Date(at).toISOString()).toBe('2026-09-11T17:00:00.000Z');
  });

  it('is the newest window that ARRIVED, not the newest asked for', () => {
    const older = requested[4];
    const loaded = readGdeltSnapshot(snapshot({ received: new Map([[older, REAL]]) }));
    expect(new Date(loaded.asOf).toISOString()).toBe('2026-09-11T16:00:00.000Z');
  });

  /**
   * GDELT publishes a window before its stamped time: at 16:57 UTC the newest
   * file was already 170000. Data cannot be newer than its fetch.
   */
  // D-DP, DP15: in live mode a GDELT layer shows the snapshot's whole day, from its oldest window.
  it('says where its day starts: the oldest window that arrived', () => {
    const oldest = requested[GDELT_WINDOWS_PER_SNAPSHOT - 1];
    const loaded = readGdeltSnapshot(snapshot({ received: new Map([[NEWEST, REAL], [oldest, REAL.slice(0, 2)]]) }));
    expect(new Date(loaded.from).toISOString()).toBe('2026-09-10T17:15:00.000Z');
  });

  it('is never later than the moment the build fetched it', () => {
    const early = new Date(Date.UTC(2026, 8, 11, 16, 57, 11));
    expect(readGdeltSnapshot(snapshot({ retrievedAt: early })).asOf).toBe(early.getTime());
  });
});

describe('what readGdeltSnapshot refuses', () => {
  const good = () => JSON.parse(JSON.stringify(snapshot()));

  it('a file that is not this schema and version', () => {
    // Version 3 is this build's; 1 and 2 still read (below); 4 is not one it knows.
    expect(() => readGdeltSnapshot({ ...good(), version: 4 })).toThrow(GdeltSnapshotError);
    expect(() => readGdeltSnapshot({ ...good(), schema: 'something.else' })).toThrow(GdeltSnapshotError);
    expect(() => readGdeltSnapshot(null)).toThrow(GdeltSnapshotError);
  });

  it('columns in another order — which would put latitudes in the Goldstein slot', () => {
    const s = good();
    [s.columns[5], s.columns[6]] = [s.columns[6], s.columns[5]];
    expect(() => readGdeltSnapshot(s)).toThrow(/columns/);
  });

  it('a malformed row, rather than drawing part of the file', () => {
    const s = good();
    s.rows[3][6] = 'not a latitude';
    expect(() => readGdeltSnapshot(s)).toThrow(/row 3/);
  });

  it('a snapshot in which no window arrived', () => {
    const s = good();
    s.windows.missing = [...s.windows.requested];
    expect(() => readGdeltSnapshot(s)).toThrow(/no GDELT windows/);
  });
});

describe('windowsEndingAt', () => {
  it('steps back fifteen minutes at a time, across midnight', () => {
    const w = windowsEndingAt('20260911000000', 3);
    expect(w).toEqual(['20260911000000', '20260910234500', '20260910233000']);
  });
});

/*
 * D-DP, DP3: version 2 keeps each event's place name, its precision and GDELT's counts. The file a
 * build already deployed is version 1 and must still read: until the next build replaces it, the
 * layers draw from it.
 */
describe('the first version', () => {
  const v1 = () => {
    const built = buildGdeltSnapshot({ requested, received: new Map([[NEWEST, REAL]]), retrievedAt: LATE });
    return {
      ...built, version: 1,
      columns: ['id', 'actor1ISO3', 'actor2ISO3', 'eventCode', 'eventRootCode', 'goldsteinScale', 'lat', 'lng', 'sourceUrl', 'dateAdded'],
      rows: built.rows.map((r) => r.slice(0, 10)),
    };
  };

  it('is still read, its events lacking only what it never kept', () => {
    const read = readGdeltSnapshot(JSON.parse(JSON.stringify(v1())));
    expect(read.events).toHaveLength(REAL.length);
    expect(read.events[0]).not.toHaveProperty('placeName');
    expect(read.events[0].id).toBe([...REAL].sort((a, b) => a.dateAdded.localeCompare(b.dateAdded) || a.id.localeCompare(b.id))[0].id);
  });

  it('keeps the place, its precision and the counts from version 2 on', () => {
    const built = buildGdeltSnapshot({ requested, received: new Map([[NEWEST, REAL]]), retrievedAt: LATE });
    const read = readGdeltSnapshot(JSON.parse(JSON.stringify(built)));
    expect(read.events.find((e) => e.id === '1322612028')).toMatchObject({ placeName: 'United Kingdom', placePrecision: 'country' });
  });

  it('refuses a version it does not know', () => {
    const built = buildGdeltSnapshot({ requested, received: new Map([[NEWEST, REAL]]), retrievedAt: LATE });
    expect(() => readGdeltSnapshot({ ...built, version: 4 })).toThrow(GdeltSnapshotError);
  });
});

/*
 * D-DP, DP10: version 3 keeps the lead paragraph and the coder's highest confidence, from the day's
 * Mentions files, and lists a Mentions file that did not arrive. Version 2 still reads.
 */
describe('version 3', () => {
  const confidence = new Map([['1322612028', 80]]);
  const built = () => buildGdeltSnapshot({
    requested, received: new Map([[NEWEST, REAL]]), retrievedAt: LATE,
    mentions: { confidence, missing: [requested[1]] },
  });

  it('keeps the lead paragraph and the confidence, and which Mentions files did not arrive', () => {
    const s = built();
    expect(s.version).toBe(3);
    expect(s.windows.mentionsMissing).toEqual([requested[1]]);
    const read = readGdeltSnapshot(JSON.parse(JSON.stringify(s)));
    expect(read.events.find((e) => e.id === '1322612028')).toMatchObject({ confidence: 80 });
    expect(read.events.filter((e) => e.lead === true)).toHaveLength(REAL.filter((e) => e.lead === true).length);
    expect(read.events.filter((e) => e.lead === false)).toHaveLength(REAL.filter((e) => e.lead === false).length);
  });

  it('leaves a confidence it never had unknown, never guessed', () => {
    const read = readGdeltSnapshot(JSON.parse(JSON.stringify(built())));
    expect(read.events.filter((e) => e.confidence !== undefined)).toHaveLength(1);
  });

  it('still reads version 2', () => {
    const s = built();
    const v2 = {
      ...s, version: 2,
      columns: s.columns.slice(0, 15),
      rows: s.rows.map((r) => r.slice(0, 15)),
      windows: { requested: s.windows.requested, missing: s.windows.missing },
    };
    const read = readGdeltSnapshot(JSON.parse(JSON.stringify(v2)));
    expect(read.events).toHaveLength(REAL.length);
    expect(read.events[0]).not.toHaveProperty('confidence');
    expect(read.events[0]).not.toHaveProperty('lead');
  });

  it('refuses a confidence that is not a percent', () => {
    const s = JSON.parse(JSON.stringify(built()));
    s.rows[0][16] = 140;
    expect(() => readGdeltSnapshot(s)).toThrow(/row 0/);
  });
});
