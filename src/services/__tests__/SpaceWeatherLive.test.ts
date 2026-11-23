import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchLiveSolarWindSnapshot,
  fetchGeomagneticForecast,
  fetchGeomagneticDisruptionRisk,
  clearSolarWindCache,
  parsePropagatedSolarWind,
} from '../SpaceWeatherLive';
import { noaaGeomagneticService } from '../NOAAGeomagneticService';
/*
 * NOAA's propagated-solar-wind-1-hour.json exactly as downloaded at
 * 2026-09-11T15:59Z — not a hand-typed fixture. The fixtures this file used
 * before were one-row arrays with a Z on every time tag, which is how they
 * passed while the real feeds differed: one row cannot be in the wrong order,
 * and a Z cannot be missing. Its newest row is 15:52:00Z, speed 409.1, density
 * 6.06, bz 1.38 — checked against NOAA's own one-value summary product at the
 * same moment (proton_speed 409, time_tag 15:52:00Z).
 */
import REAL from './fixtures/noaa-propagated-solar-wind-1-hour.2026-09-11T1559Z.json';

const NEWEST = { speedKmPerSec: 409.1, densityPerCm3: 6.06, bz: 1.38, timestamp: '2026-09-11T15:52:00.000Z' };

const makeFetchResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(payload)
});

describe('parsePropagatedSolarWind — the real product', () => {
  it('reads the newest row of the real response', () => {
    expect(parsePropagatedSolarWind(REAL)).toEqual(NEWEST);
  });

  /**
   * rtsw_mag_1m, which this module read until now, is newest FIRST, and the
   * parser took the last row: a 24-hour-old value presented as current. The
   * newest row is found by its time, so order cannot do that again.
   */
  it('finds the newest row by time, whatever order the rows come in', () => {
    const [header, ...rows] = REAL as unknown[][];
    expect(parsePropagatedSolarWind([header, ...[...rows].reverse()])).toEqual(NEWEST);
  });

  it('finds columns by name, not position', () => {
    const [header, ...rows] = REAL as unknown[][];
    const order = [...header.keys()].reverse();
    const shuffled = [order.map((i) => header[i]), ...rows.map((r) => order.map((i) => r[i]))];
    expect(parsePropagatedSolarWind(shuffled)).toEqual(NEWEST);
  });

  /**
   * rtsw_*_1m's time tags have no zone; a browser reads those as local time.
   *
   * On a machine set to UTC, local time IS UTC and this could not tell the two
   * readings apart — it would pass against the bug. So it runs in a zone that
   * is not UTC, and first proves the zone took hold.
   */
  it('reads a time tag with no zone as UTC, not local time', () => {
    const was = process.env.TZ;
    process.env.TZ = 'America/Chicago';
    try {
      expect(new Date(Date.UTC(2026, 8, 11)).getTimezoneOffset()).toBe(300);
      const [header, ...rows] = REAL as unknown[][];
      const t = header.indexOf('time_tag');
      const unzoned = rows.map((r) => r.map((v, i) => (i === t ? String(v).replace('Z', '') : v)));
      expect(parsePropagatedSolarWind([header, ...unzoned])?.timestamp).toBe(NEWEST.timestamp);
    } finally {
      if (was === undefined) delete process.env.TZ; else process.env.TZ = was;
    }
  });

  /** Number(null) is 0: a missing speed must not become a reading of 0 km/s. */
  it('skips a newest row with a missing value rather than completing it', () => {
    const [header, ...rows] = REAL as unknown[][];
    const s = header.indexOf('speed');
    const last = [...rows[rows.length - 1]];
    last[s] = null;
    const parsed = parsePropagatedSolarWind([header, ...rows.slice(0, -1), last]);
    expect(parsed?.timestamp).toBe('2026-09-11T15:51:00.000Z');
    expect(parsed?.speedKmPerSec).toBe(404.7);
  });

  it('keeps a reading whose Bz alone is missing, without inventing one', () => {
    const [header, ...rows] = REAL as unknown[][];
    const b = header.indexOf('bz');
    const last = [...rows[rows.length - 1]];
    last[b] = null;
    const parsed = parsePropagatedSolarWind([header, ...rows.slice(0, -1), last]);
    expect(parsed?.timestamp).toBe(NEWEST.timestamp);
    expect(parsed?.bz).toBeUndefined();
  });

  it('returns nothing, rather than a stamped guess, for a row with no time', () => {
    const header = ['time_tag', 'speed', 'density', 'bz'];
    expect(parsePropagatedSolarWind([header, [null, 400, 5, -1]])).toBeNull();
  });
});

describe('SpaceWeatherLive.fetchLiveSolarWindSnapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T16:00:00Z'));
    clearSolarWindCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSolarWindCache();
    vi.useRealTimers();
  });

  it('returns the newest reading, live, from one request to the propagated product', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeFetchResponse(REAL));
    // @ts-expect-error allow overriding global fetch for test
    global.fetch = fetchMock;

    const { snapshot, quality } = await fetchLiveSolarWindSnapshot();

    expect(quality).toBe('live');
    expect(snapshot).toEqual(NEWEST);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json',
    );
  });

  it('falls back to modeled snapshot when no row is complete', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(makeFetchResponse([
      ['time_tag', 'speed', 'density', 'bz'],
      ['2026-09-11T15:52:00Z', 'bad', 4, -1],
    ]));
    // @ts-expect-error allow overriding global fetch for test
    global.fetch = fetchMock;

    const { snapshot, quality } = await fetchLiveSolarWindSnapshot();

    expect(quality).toBe('fallback');
    expect(snapshot.speedKmPerSec).toBe(420);
    expect(snapshot.densityPerCm3).toBe(6);
    expect(snapshot.bz).toBe(-2);
  });

  it('falls back when NOAA answers with an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 404, json: () => Promise.resolve({}) });
    // @ts-expect-error allow overriding global fetch for test
    global.fetch = fetchMock;

    expect((await fetchLiveSolarWindSnapshot()).quality).toBe('fallback');
  });

  it('serves a cached result to a second caller within the TTL, without a second real fetch', async () => {
    // Real motivating case: GlobeEngine's periodic poller and the useSolarWindData/
    // useMagnetopauseData HUD hooks all call this independently — before this cache
    // existed, two callers within the same few seconds meant two real NOAA requests.
    const fetchMock = vi.fn().mockResolvedValueOnce(makeFetchResponse(REAL));
    // @ts-expect-error allow overriding global fetch for test
    global.fetch = fetchMock;

    const first = await fetchLiveSolarWindSnapshot();
    const second = await fetchLiveSolarWindSnapshot();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('fetches fresh again once the cache TTL expires', async () => {
    const [header, ...rows] = REAL as unknown[][];
    const later = [...rows[rows.length - 1]];
    later[header.indexOf('time_tag')] = '2026-09-11T15:53:00Z';
    later[header.indexOf('speed')] = 600;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeFetchResponse(REAL))
      .mockResolvedValueOnce(makeFetchResponse([header, ...rows, later]));
    // @ts-expect-error allow overriding global fetch for test
    global.fetch = fetchMock;

    const first = await fetchLiveSolarWindSnapshot();
    vi.setSystemTime(new Date('2026-09-11T16:03:00Z')); // past the 2-minute TTL
    const second = await fetchLiveSolarWindSnapshot();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.snapshot.speedKmPerSec).toBe(409.1);
    expect(second.snapshot.speedKmPerSec).toBe(600);
  });

  it('does not cache a fallback result, so the next call retries for real', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    // @ts-expect-error allow overriding global fetch for test
    global.fetch = fetchMock;

    const first = await fetchLiveSolarWindSnapshot();
    expect(first.quality).toBe('fallback');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await fetchLiveSolarWindSnapshot();
    expect(fetchMock).toHaveBeenCalledTimes(2); // retried, not served a cached fallback
  });
});

describe('SpaceWeatherLive.fetchGeomagneticForecast', () => {
  beforeEach(() => {
    noaaGeomagneticService.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    noaaGeomagneticService.clearCache();
  });

  it('returns a live forecast when the NOAA 3-day forecast endpoint responds', async () => {
    const payload = [
      { DateStamp: '2024-01-02', K: '3' },
      { DateStamp: '2024-01-03', K: '5' }
    ];
    // @ts-expect-error allow overriding global fetch for test
    global.fetch = vi.fn().mockResolvedValue(makeFetchResponse(payload));

    const { forecast, quality } = await fetchGeomagneticForecast();

    expect(quality).toBe('live');
    expect(forecast).toEqual([
      { date: new Date('2024-01-02').toISOString(), predictedKp: 3 },
      { date: new Date('2024-01-03').toISOString(), predictedKp: 5 }
    ]);
  });

  it('returns an empty forecast (not a fabricated one) when the endpoint fails', async () => {
    // @ts-expect-error allow overriding global fetch for test
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve(null) });

    const { forecast, quality } = await fetchGeomagneticForecast();

    expect(quality).toBe('fallback');
    expect(forecast).toEqual([]);
  });
});

describe('SpaceWeatherLive.fetchGeomagneticDisruptionRisk', () => {
  beforeEach(() => {
    noaaGeomagneticService.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    noaaGeomagneticService.clearCache();
  });

  it('returns a live risk assessment when current conditions are available', async () => {
    const payload = [{ time_tag: '2024-01-01T00:00:00Z', kp: '6' }];
    // @ts-expect-error allow overriding global fetch for test
    global.fetch = vi.fn().mockResolvedValue(makeFetchResponse(payload));

    const { risk, quality } = await fetchGeomagneticDisruptionRisk();

    expect(quality).toBe('live');
    expect(risk?.level).toBe('high');
    expect(risk?.description).toContain('Significant');
  });

  it('returns null risk (not a fabricated one) when current conditions fail to load', async () => {
    // @ts-expect-error allow overriding global fetch for test
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve(null) });

    const { risk, quality } = await fetchGeomagneticDisruptionRisk();

    expect(quality).toBe('fallback');
    expect(risk).toBeNull();
  });
});

/**
 * Concurrent callers share one request to NOAA.
 *
 * The 2-minute cache only helps AFTER a response lands. Callers arriving
 * while the first request is still in flight all missed it and fired their
 * own — measured on 2026-09-25 when Globe.tsx began adding the five
 * space-weather overlays to a living engine one by one: each restarted the
 * poller, each restart fetched immediately, and a single layer selection sent
 * NOAA five requests at once instead of one. A public, free service is the
 * last place to be careless with request volume.
 */
describe('fetchLiveSolarWindSnapshot — concurrent callers', () => {
  beforeEach(() => clearSolarWindCache());
  afterEach(() => { vi.unstubAllGlobals(); clearSolarWindCache(); });

  it('sends one request when five callers arrive together', async () => {
    // Every request the module sends is held open, then all are answered — so
    // five requests fail the count below rather than hanging the test.
    const pending: Array<(value: unknown) => void> = [];
    const fetchMock = vi.fn(() => new Promise((resolve) => { pending.push(resolve); }));
    vi.stubGlobal('fetch', fetchMock);

    const calls = Array.from({ length: 5 }, () => fetchLiveSolarWindSnapshot());
    await Promise.resolve();
    for (const resolve of pending) resolve(makeFetchResponse(REAL));
    const results = await Promise.all(calls);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r.snapshot).toEqual(NEWEST);
  });

  it('lets the next caller retry once a failed request has settled', async () => {
    // Sharing an in-flight request must not turn one failure into a stuck one.
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(makeFetchResponse(REAL));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchLiveSolarWindSnapshot();
    const second = await fetchLiveSolarWindSnapshot();

    expect(first.quality).toBe('fallback');
    expect(second.quality).toBe('live');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
