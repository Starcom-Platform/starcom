/**
 * The river gauges, read from USGS's Water Data API (api.waterdata.usgs.gov) since
 * WaterServices shuts down on 2027-02-22 (record D-L). The fixtures are real answers,
 * trimmed: California's latest discharge on 2026-10-07 (one gauge reading, one with no
 * value, one discontinued, one at zero flow, one gauge listed twice) and the names USGS
 * gives those gauges.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { USGSStreamflowService } from './USGSStreamflowService';
import latestCa from './__fixtures__/usgs/latest-continuous.ca.json';
import namesFixture from './__fixtures__/usgs/monitoring-locations.names.json';

global.fetch = vi.fn();
const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

type Feature = (typeof latestCa)['features'][number];
const NOW = Date.parse('2026-10-07T06:00:00Z');
const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
const collection = (features: unknown[], links: unknown[] = []) => ({ type: 'FeatureCollection', features, numberReturned: features.length, links });

/** The ids a names request asks for, read back out of its CQL filter. */
const idsAsked = (url: string) => [...(new URL(url).searchParams.get('filter') ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const namesFor = (url: string) => collection(namesFixture.features.filter((f) => idsAsked(url).includes(f.id)));

/** USGS as it answered: California's readings, nothing for the other states, names for whatever is asked. */
function usgs(readings: Record<string, unknown> = { '06': collection(latestCa.features) }) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/collections/monitoring-locations/')) return Promise.resolve(json(namesFor(url)));
    const state = new URL(url).searchParams.get('state_code') ?? '';
    return Promise.resolve(json(readings[state] ?? collection([])));
  });
}
const calls = (part: string) => mockFetch.mock.calls.map(([url]) => String(url)).filter((url) => url.includes(part));

describe('USGSStreamflowService', () => {
  let service: USGSStreamflowService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    service = new USGSStreamflowService();
    mockFetch.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());

  it('reads each gauge\'s latest discharge, where it is and what USGS calls it', async () => {
    usgs();
    const result = await service.getCurrentReadings();
    expect(result.success).toBe(true);
    expect(result.data).toContainEqual({
      siteId: 'USGS-11447650',
      siteName: 'SACRAMENTO R A FREEPORT CA',
      lat: 38.4556638888889,
      lng: -121.501616666667,
      stateCode: 'ca',
      dischargeCfs: 16200,
      timestamp: '2026-10-07T05:15:00+00:00',
    });
  });

  it('asks only for discharge heard from in the last day, gauge by gauge, a state at a time', async () => {
    usgs();
    await service.getCurrentReadings();
    const asked = calls('/collections/latest-continuous/items');
    expect(asked).toHaveLength(6);
    const ca = new URL(asked.find((u) => u.includes('state_code=06'))!);
    expect(ca.origin + ca.pathname).toBe('https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items');
    expect(Object.fromEntries(ca.searchParams)).toMatchObject({
      f: 'json', parameter_code: '00060', statistic_id: '00011', time: '2026-10-06T06:00:00Z/..',
    });
    // The same six states as before, by their ANSI codes: CA, CO, IL, NY, GA, TX.
    expect(asked.map((u) => new URL(u).searchParams.get('state_code')).sort()).toEqual(['06', '08', '13', '17', '36', '48']);
  });

  it('reads zero flow as zero, and drops a gauge with no value or a discontinued one', async () => {
    usgs();
    const { data } = await service.getCurrentReadings();
    const byId = new Map(data!.map((r) => [r.siteId, r]));
    expect(byId.get('USGS-11157500')).toMatchObject({ dischargeCfs: 0, siteName: 'TRES PINOS C NR TRES PINOS CA' });
    expect(byId.has('USGS-10254970')).toBe(false); // UNAVAIL, no value
    expect(byId.has('USGS-11527000')).toBe(false); // DISCONTINUED
  });

  it('drops a discontinued series even when it still carries a value', async () => {
    const discontinued = latestCa.features.find((f) => f.properties.monitoring_location_id === 'USGS-11527000')!;
    usgs({ '06': collection([{ ...discontinued, properties: { ...discontinued.properties, value: '312' } }, latestCa.features[0]]) });
    const { data } = await service.getCurrentReadings();
    expect(data!.map((r) => r.siteId)).toEqual(['USGS-11447650']);
  });

  it('draws only cubic feet per second, the unit the marks are sized in', async () => {
    const [freeport] = latestCa.features;
    const metric: Feature = { ...freeport, properties: { ...freeport.properties, unit_of_measure: 'm^3/s', value: '458.7' } };
    usgs({ '06': collection([metric]) });
    const result = await service.getCurrentReadings();
    expect(result.success).toBe(false);
  });

  it('keeps one reading a gauge, the newest where it reports two', async () => {
    const twice = latestCa.features.filter((f) => f.properties.monitoring_location_id === 'USGS-10340500');
    const later: Feature = { ...twice[1], properties: { ...twice[1].properties, time: '2026-10-07T05:45:00+00:00', value: '75.1' } };
    usgs({ '06': collection([twice[0], later]) });
    const { data } = await service.getCurrentReadings();
    expect(data!.filter((r) => r.siteId === 'USGS-10340500')).toEqual([expect.objectContaining({ dischargeCfs: 75.1 })]);
  });

  it('asks the names of the gauges it draws, at most 150 to a request', async () => {
    const many = Array.from({ length: 320 }, (_, i) => ({
      ...latestCa.features[0],
      properties: { ...latestCa.features[0].properties, monitoring_location_id: `USGS-${String(20000000 + i)}` },
    }));
    usgs({ '06': collection(many) });
    await service.getCurrentReadings();
    const named = calls('/collections/monitoring-locations/items');
    expect(named.map((u) => idsAsked(u).length)).toEqual([150, 150, 20]);
    expect(new URL(named[0]).searchParams.get('filter-lang')).toBe('cql2-text');
  });

  it('keeps names for the session: a later refresh asks no names it already has', async () => {
    usgs();
    await service.getCurrentReadings();
    vi.setSystemTime(NOW + 11 * 60 * 1000);
    await service.getCurrentReadings();
    expect(calls('/collections/latest-continuous/items')).toHaveLength(12);
    expect(calls('/collections/monitoring-locations/items')).toHaveLength(1);
  });

  it('labels a gauge by its id when its name cannot be read', async () => {
    usgs();
    const readingsOnly = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation((url: string) => (url.includes('/collections/monitoring-locations/')
      ? Promise.resolve(json({ code: 'ServerError' }, 503)) : readingsOnly(url)));
    const { data } = await service.getCurrentReadings();
    expect(data!.find((r) => r.siteId === 'USGS-11447650')!.siteName).toBe('USGS-11447650');
  });

  it('follows the next page while one is offered', async () => {
    const [first, ...rest] = latestCa.features;
    const nextUrl = 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items?cursor=abc';
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/collections/monitoring-locations/')) return Promise.resolve(json(namesFor(url)));
      if (url === nextUrl) return Promise.resolve(json(collection(rest)));
      if (url.includes('state_code=06')) return Promise.resolve(json(collection([first], [{ rel: 'next', href: nextUrl }])));
      return Promise.resolve(json(collection([])));
    });
    const { data } = await service.getCurrentReadings();
    expect(data!.map((r) => r.siteId).sort()).toEqual(['USGS-10340500', 'USGS-11157500', 'USGS-11447650']);
  });

  it('continues with the other states when one fails', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/collections/monitoring-locations/')) return Promise.resolve(json(namesFor(url)));
      if (url.includes('state_code=08')) return Promise.reject(new Error('network down'));
      if (url.includes('state_code=06')) return Promise.resolve(json(collection(latestCa.features)));
      return Promise.resolve(json(collection([])));
    });
    const result = await service.getCurrentReadings();
    expect(result.success).toBe(true);
    expect(result.data!.some((r) => r.siteId === 'USGS-11447650')).toBe(true);
  });

  it('returns a failure saying so when every state fails', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    const result = await service.getCurrentReadings();
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
  });

  it('asks nothing again within ten minutes', async () => {
    usgs();
    await service.getCurrentReadings();
    const after = mockFetch.mock.calls.length;
    vi.setSystemTime(NOW + 9 * 60 * 1000);
    await service.getCurrentReadings();
    expect(mockFetch.mock.calls.length).toBe(after);
  });
});
