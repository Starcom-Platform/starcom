/**
 * NOAA's own space-weather statement — its scales and its alerts — read as issued.
 *
 * Fixtures are NOAA's responses from 2026-09-11: noaa-scales.json whole (1.1 KB),
 * and twenty messages from alerts.json, verbatim — the three newest plus the first
 * of each kind of product that appeared.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseNoaaScales,
  parseNoaaAlerts,
  fetchNoaaSpaceWeatherSummary,
  clearNoaaSummaryCache,
  NoaaSummaryError,
  NOAA_SCALES_URL,
  NOAA_ALERTS_URL,
} from '../noaaSummary';

const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const SCALES = fixture('noaa-scales.2026-09-11T1814Z.json');
const ALERTS = fixture('noaa-alerts.sample.2026-09-11.json');

describe('parseNoaaScales — the real product', () => {
  it('reads the CURRENT entry, not a forecast day', () => {
    expect(parseNoaaScales(SCALES)).toEqual({
      observedAt: '2026-09-11T18:14:00.000Z',
      scales: [
        { scale: 'R', level: 0, text: 'none' },
        { scale: 'S', level: 0, text: 'none' },
        { scale: 'G', level: 0, text: 'none' },
      ],
    });
  });

  it('reads a real storm level as NOAA states it', () => {
    const storm = structuredClone(SCALES);
    storm['0'].G = { Scale: '3', Text: 'strong' };
    expect(parseNoaaScales(storm).scales.find((s) => s.scale === 'G')).toEqual({ scale: 'G', level: 3, text: 'strong' });
  });

  it('refuses a current entry without a level, rather than calling it 0', () => {
    const missing = structuredClone(SCALES);
    missing['0'].S = { Scale: null, Text: null, Prob: '1' };
    expect(() => parseNoaaScales(missing)).toThrow(NoaaSummaryError);
  });
});

describe('parseNoaaAlerts — the real product', () => {
  const alerts = parseNoaaAlerts(ALERTS);

  it('reads every message with its own headline, newest first', () => {
    expect(alerts).toHaveLength(20);
    expect(alerts[0]).toEqual({
      productId: 'EF3A',
      issuedAt: '2026-09-11T05:01:52.037Z',
      headline: 'CONTINUED ALERT: Electron 2MeV Integral Flux exceeded 1,000pfu',
    });
    expect(alerts.find((a) => a.productId === 'K05A')?.headline).toBe('ALERT: Geomagnetic K-index of 5');
    const times = alerts.map((a) => a.issuedAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  /** NOAA writes issue times with no zone. On a machine not in UTC, reading them as local shifts every one. */
  it('reads NOAA\'s zone-less times as UTC, not local time', () => {
    const was = process.env.TZ;
    process.env.TZ = 'America/Chicago';
    try {
      expect(new Date(Date.UTC(2026, 8, 11)).getTimezoneOffset()).toBe(300);
      expect(parseNoaaAlerts(ALERTS)[0].issuedAt).toBe('2026-09-11T05:01:52.037Z');
    } finally {
      if (was === undefined) delete process.env.TZ; else process.env.TZ = was;
    }
  });

  it('skips a message it cannot date or read, rather than guessing', () => {
    expect(parseNoaaAlerts([{ product_id: 'X', issue_datetime: 'soon', message: 'ALERT: x' }, { product_id: 'Y' }])).toEqual([]);
  });
});

describe('fetchNoaaSpaceWeatherSummary', () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const fetchMock = vi.fn();
  beforeEach(() => { clearNoaaSummaryCache(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('asks NOAA for its two small products, and only those', async () => {
    fetchMock.mockImplementation(async (url: string) => ok(url === NOAA_SCALES_URL ? SCALES : ALERTS));
    const summary = await fetchNoaaSpaceWeatherSummary();
    expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual([NOAA_ALERTS_URL, NOAA_SCALES_URL].sort());
    expect(summary.observedAt).toBe('2026-09-11T18:14:00.000Z');
    expect(summary.alerts).toHaveLength(20);
  });

  it('fails with NOAA\'s status rather than returning a quiet sky', async () => {
    fetchMock.mockImplementation(async (url: string) => (url === NOAA_SCALES_URL ? { ok: false, status: 503, json: async () => ({}) } : ok(ALERTS)));
    await expect(fetchNoaaSpaceWeatherSummary()).rejects.toThrow(/NOAA scales: HTTP 503/);
  });

  it('serves two callers from one fetch', async () => {
    fetchMock.mockImplementation(async (url: string) => ok(url === NOAA_SCALES_URL ? SCALES : ALERTS));
    await Promise.all([fetchNoaaSpaceWeatherSummary(), fetchNoaaSpaceWeatherSummary()]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
