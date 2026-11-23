/**
 * The GDELT events the app draws, loaded from the snapshot this build carries.
 *
 * These tests used to call GDELT over the network from inside the unit suite,
 * from Node — where the http→https redirect GDELT answers with is followed
 * without a CORS check. So they passed while every browser was refused, and
 * "real, not mocked" meant "proven in the one environment that could not fail
 * the way production did". The live fetch now happens at build time
 * (scripts/snapshot-gdelt.mjs) and its parser is tested against real rows
 * (__tests__/gdeltEventExport.test.ts). What is tested here is what the app
 * does with the file — including when there is no file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getRealDiplomaticEvents,
  getRealConflictEvents,
  filterToRealCountryPairs,
  clearGdeltSnapshotCache,
  type RealGdeltEvent,
} from './GDELTEventService';
import { parseGdeltExport, COOPERATIVE_ROOT_CODES, CONFLICT_ROOT_CODES } from './gdeltEventExport';
import { buildGdeltSnapshot, windowsEndingAt, GDELT_SNAPSHOT_URL } from './gdeltSnapshot';

const REAL = parseGdeltExport(fs.readFileSync(path.join(__dirname, '__tests__/fixtures/gdelt-20260911170000.export.sample.csv'), 'utf8'));
const SNAPSHOT = buildGdeltSnapshot({
  requested: windowsEndingAt('20260911170000'),
  received: new Map([['20260911170000', REAL]]),
  retrievedAt: new Date(Date.UTC(2026, 8, 11, 17, 3)),
});

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => JSON.parse(JSON.stringify(body)),
});
const fetchMock = vi.fn();

describe('GDELTEventService — reading the snapshot', () => {
  beforeEach(() => { clearGdeltSnapshotCache(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reads from our own origin, not from GDELT', async () => {
    fetchMock.mockResolvedValue(json(SNAPSHOT));
    await getRealDiplomaticEvents();
    expect(fetchMock).toHaveBeenCalledWith(GDELT_SNAPSHOT_URL);
  });

  it("splits one file between the two layers by CAMEO range, with the data's own time", async () => {
    fetchMock.mockResolvedValue(json(SNAPSHOT));
    const [diplomatic, conflict] = await Promise.all([getRealDiplomaticEvents(), getRealConflictEvents()]);
    // 31 cooperative rows, 13 events once counted per article (D-DP, DP1), as counted from the raw
    // fixture by article, pair and CAMEO code.
    expect(diplomatic.events).toHaveLength(13);
    expect(conflict.events).toHaveLength(5);
    expect(diplomatic.events.every((e) => COOPERATIVE_ROOT_CODES.has(e.eventRootCode))).toBe(true);
    expect(conflict.events.every((e) => CONFLICT_ROOT_CODES.has(e.eventRootCode))).toBe(true);
    expect(new Date(diplomatic.asOf).toISOString()).toBe('2026-09-11T17:00:00.000Z');
    expect(conflict.asOf).toBe(diplomatic.asOf);
  });

  // D-DP, DP1: diplomacy counts one event per article; Conflict Zones keeps its rows as they are.
  it('gives diplomacy one event per article, and conflict every row', async () => {
    const twice = (e: RealGdeltEvent, id: string) => ({ ...e, id, dateAdded: e.dateAdded });
    const cooperative = REAL.find((e) => ['03', '04', '05', '06', '07', '08'].includes(e.eventRootCode))!;
    const fighting = REAL.find((e) => ['14', '15', '16', '17', '18', '19', '20'].includes(e.eventRootCode))!;
    const doubled = buildGdeltSnapshot({
      requested: windowsEndingAt('20260911170000'),
      received: new Map([['20260911170000', [cooperative, twice(cooperative, '9000000001'), fighting, twice(fighting, '9000000002')]]]),
      retrievedAt: new Date(Date.UTC(2026, 8, 11, 17, 3, 0)),
    });
    fetchMock.mockResolvedValue(json(doubled));
    const [diplomatic, conflict] = await Promise.all([getRealDiplomaticEvents(), getRealConflictEvents()]);
    expect(diplomatic.events).toHaveLength(1);
    expect(diplomatic.events[0].rows).toBe(2);
    expect(conflict.events).toHaveLength(2);
  });

  it('asks once when both layers ask at once', async () => {
    fetchMock.mockResolvedValue(json(SNAPSHOT));
    await Promise.all([getRealDiplomaticEvents(), getRealConflictEvents()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  /**
   * The old service answered every failure with an empty list, which the
   * layers drew as no activity. A missing snapshot is a failure and says so.
   */
  it('says so when the build carries no snapshot — it does not return an empty day', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) });
    await expect(getRealDiplomaticEvents()).rejects.toThrow(/carries no GDELT snapshot/);
  });

  it("treats a dev server's index.html fallback as no snapshot, not as a corrupt one", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, headers: new Headers({ 'content-type': 'text/html' }), json: async () => { throw new SyntaxError('<!doctype'); } });
    await expect(getRealConflictEvents()).rejects.toThrow(/carries no GDELT snapshot/);
  });

  it('refuses a file that is not a snapshot', async () => {
    fetchMock.mockResolvedValue(json({ ...SNAPSHOT, version: 99 }));
    await expect(getRealDiplomaticEvents()).rejects.toThrow(/snapshot/);
  });

  it('asks again after a failure rather than remembering it', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, headers: new Headers(), json: async () => ({}) });
    await expect(getRealDiplomaticEvents()).rejects.toThrow(/HTTP 503/);
    fetchMock.mockResolvedValueOnce(json(SNAPSHOT));
    await expect(getRealDiplomaticEvents()).resolves.toMatchObject({ events: expect.any(Array) });
  });
});

describe('filterToRealCountryPairs (bug-injection verified)', () => {
  const sample: RealGdeltEvent[] = [
    { id: '1', actor1ISO3: 'USA', actor2ISO3: 'CHN', eventCode: '042', eventRootCode: '04', goldsteinScale: 3, lat: 1, lng: 1, sourceUrl: 'https://a.com', dateAdded: '1' },
    { id: '2', actor1ISO3: 'USA', actor2ISO3: 'EUR', eventCode: '042', eventRootCode: '04', goldsteinScale: 3, lat: 1, lng: 1, sourceUrl: 'https://a.com', dateAdded: '1' }, // EUR isn't a real individual country
    { id: '3', actor1ISO3: 'UNO', actor2ISO3: 'CHN', eventCode: '042', eventRootCode: '04', goldsteinScale: 3, lat: 1, lng: 1, sourceUrl: 'https://a.com', dateAdded: '1' } // UNO isn't a real individual country
  ];
  const realCountries = new Set(['USA', 'CHN', 'RUS']);

  it('keeps only events where both actors are real, individual countries', () => {
    const result = filterToRealCountryPairs(sample, realCountries);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });

  it('drops an event when only one side resolves a real country', () => {
    const result = filterToRealCountryPairs(
      [{ id: '4', actor1ISO3: 'USA', actor2ISO3: 'XXX', eventCode: '042', eventRootCode: '04', goldsteinScale: 3, lat: 1, lng: 1, sourceUrl: 'https://a.com', dateAdded: '1' }],
      realCountries
    );
    expect(result.length).toBe(0);
  });

  it('returns everything unchanged when all actors are real countries', () => {
    const allReal: RealGdeltEvent[] = [
      { id: '5', actor1ISO3: 'USA', actor2ISO3: 'RUS', eventCode: '042', eventRootCode: '04', goldsteinScale: 3, lat: 1, lng: 1, sourceUrl: 'https://a.com', dateAdded: '1' }
    ];
    expect(filterToRealCountryPairs(allReal, realCountries)).toEqual(allReal);
  });
});
