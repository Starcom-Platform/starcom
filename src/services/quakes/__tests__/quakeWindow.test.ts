/**
 * The quakes for the window shown (D-EQ, EQ1, EQ2, EQ14): which feed, USGS's and EMSC's read in the shapes they serve
 * (taken from both on 4 Nov 2026), and the same quake reported twice folded into one, named by both agencies.
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import {
  emscQueryUrl, emscQuakes, mergeQuakes, QUAKE_FEEDS, quakeWindowFor, quakeWindowWords, readQuakeWindow, REPLAY_CHUNK_S,
  replayQuakeWindow, usgsQuakes,
} from '../quakeWindow';

const NOW = Date.parse('2026-11-04T06:00:00Z');
const DAY = 86_400_000;

const usgsFeature = (id: string, net: string, t: number, lat: number, lng: number, mag: number) => ({
  type: 'Feature', id,
  properties: {
    mag, place: '8 km NNE of Delta, B.C., MX', time: t, url: `https://earthquake.usgs.gov/earthquakes/eventpage/${id}`,
    detail: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/${id}.geojson`, status: 'automatic', tsunami: 0, sig: 63, net,
    types: ',nearby-cities,origin,phase-data,', title: `M ${mag.toFixed(1)} - 8 km NNE of Delta, B.C., MX`,
  },
  geometry: { type: 'Point', coordinates: [lng, lat, 14.25] },
});
const usgsFeed = (...features: ReturnType<typeof usgsFeature>[]) => ({ type: 'FeatureCollection', features });
const emscFeature = (unid: string, auth: string, t: number, lat: number, lon: number, mag: number) => ({
  type: 'Feature', id: unid, geometry: { type: 'Point', coordinates: [lon, lat, -127.3] },
  properties: {
    source_id: '2085085', source_catalog: 'EMSC-RTS', lastupdate: '2026-11-04T05:04:21.446955Z', time: new Date(t).toISOString(),
    flynn_region: 'ANTOFAGASTA, CHILE', lat, lon, depth: 127.3, evtype: 'ke', auth, mag, magtype: 'ml', unid,
  },
});
const emscFeed = (...features: ReturnType<typeof emscFeature>[]) => ({ type: 'FeatureCollection', features });

describe('what a replay reads (EQ7, EQ17)', () => {
  const HOUR = 3_600_000;
  it('inside the feeds, once for the whole play: from its start less the decay to when it began', () => {
    const startMs = NOW - 3 * DAY;
    const read = (atMs: number) => replayQuakeWindow({ startMs, atMs, decayMs: 4 * HOUR, msPerSecond: HOUR, now: NOW });
    expect(read(startMs)).toEqual({ from: startMs - 4 * HOUR, until: NOW, feed: 'week', live: false });
    // The same window however far play has gone: one read.
    expect(read(startMs + 2 * DAY)).toEqual(read(startMs));
    expect(replayQuakeWindow({ startMs: NOW - 10 * HOUR, atMs: NOW - 9 * HOUR, decayMs: HOUR, msPerSecond: HOUR, now: NOW }).feed).toBe('day');
  });
  it('further back, from the history a few seconds of play at a time, the next stretch with it', () => {
    const YEAR = 365 * DAY;
    const startMs = Date.UTC(1960, 0, 1);
    const chunk = REPLAY_CHUNK_S * YEAR;
    const at = (atMs: number) => replayQuakeWindow({ startMs, atMs, decayMs: 4 * YEAR, msPerSecond: YEAR, now: NOW });
    expect(at(startMs)).toEqual({ from: startMs - 4 * YEAR, until: startMs + 2 * chunk, feed: 'history', live: false });
    // Within a stretch, the same window; past it, the next, which still holds every quake still fading.
    expect(at(startMs + chunk - 1)).toEqual(at(startMs));
    const next = at(startMs + chunk + 1);
    expect(next.from).toBe(startMs + chunk - 4 * YEAR);
    expect(next.until).toBe(startMs + 3 * chunk);
    // Never past when play began.
    expect(at(NOW - DAY * 40).until).toBe(NOW);
  });
});

describe('which quakes the window reads', () => {
  it('live: the last day, or the week or 30 days the time bar chose', () => {
    expect(quakeWindowFor({ range: 'all', paused: null, now: NOW })).toEqual({ from: NOW - DAY, until: NOW, feed: 'day', live: true });
    expect(quakeWindowFor({ range: '24h', paused: null, now: NOW })?.feed).toBe('day');
    expect(quakeWindowFor({ range: '1y', paused: null, now: NOW })?.feed).toBe('day');
    expect(quakeWindowFor({ range: '7d', paused: null, now: NOW })).toMatchObject({ from: NOW - 7 * DAY, feed: 'week' });
    expect(quakeWindowFor({ range: '30d', paused: null, now: NOW })).toMatchObject({ from: NOW - 30 * DAY, feed: 'month' });
  });

  it('paused: the smallest feed reaching back to its start, the history before 30 days', () => {
    expect(quakeWindowFor({ range: 'all', paused: { start: NOW - 6 * 3_600_000, end: NOW - 3_600_000 }, now: NOW }))
      .toEqual({ from: NOW - 6 * 3_600_000, until: NOW - 3_600_000, feed: 'day', live: false });
    expect(quakeWindowFor({ range: 'all', paused: { start: NOW - 3 * DAY, end: NOW - 2 * DAY }, now: NOW })?.feed).toBe('week');
    expect(quakeWindowFor({ range: 'all', paused: { start: NOW - 20 * DAY, end: NOW - 19 * DAY }, now: NOW })?.feed).toBe('month');
    // Starting before the last 30 days: the history's (quakeHistory.ts), the window as chosen.
    expect(quakeWindowFor({ range: 'history', paused: { start: NOW - 40 * DAY, end: NOW - 25 * DAY }, now: NOW }))
      .toEqual({ from: NOW - 40 * DAY, until: NOW - 25 * DAY, feed: 'history', live: false });
    expect(quakeWindowWords(quakeWindowFor({ range: 'history', paused: { start: 0, end: DAY }, now: NOW }))).toMatch(/USGS's catalogue, with NOAA's/);
  });

  it('says it in words, and asks EMSC for the same span and least magnitude', () => {
    expect(quakeWindowWords({ from: 0, until: 0, feed: 'week', live: true })).toBe('the last 7 days, every magnitude');
    expect(quakeWindowWords({ from: 0, until: 0, feed: 'month', live: false })).toBe('the window chosen, magnitude 2.5 and over');
    const url = new URL(emscQueryUrl({ from: NOW - 30 * DAY, until: NOW, feed: 'month', live: true }));
    expect(url.searchParams.get('starttime')).toBe('2026-10-05T06:00:00');
    expect(url.searchParams.get('minmag')).toBe('2.5');
    expect(url.searchParams.get('orderby')).toBe('magnitude');
    expect(new URL(emscQueryUrl({ from: NOW - DAY, until: NOW, feed: 'day', live: true })).searchParams.has('minmag')).toBe(false);
  });
});

describe("each agency's quakes", () => {
  it("USGS's, named by their network", () => {
    const [quake] = usgsQuakes(usgsFeed(usgsFeature('ci41572192', 'ci', NOW - 3_600_000, 32.42, -115.16, 2.03)));
    expect(quake).toMatchObject({ id: 'ci41572192', magnitude: 2.03, depthKm: 14.25, reportedBy: ['USGS (ci)'] });
  });

  it("EMSC's, named by the agency EMSC took them from, their depth below ground", () => {
    const [quake] = emscQuakes(emscFeed(emscFeature('20261104_0000055', 'CSN', NOW - 3_600_000, -21.49, -68.55, 2.5)));
    expect(quake).toMatchObject({
      id: 'emsc:20261104_0000055', lat: -21.49, lng: -68.55, magnitude: 2.5, depthKm: 127.3, source: 'EMSC',
      reportedBy: ['EMSC (CSN)'], description: 'M 2.5 - Antofagasta, Chile',
      sourceUrl: 'https://www.seismicportal.eu/eventdetails.html?unid=20261104_0000055',
    });
    expect(emscQuakes({ features: [{ properties: { lat: 95, lon: 0, time: 'x' } }] })).toEqual([]);
  });
});

describe('the same quake, reported twice', () => {
  const t = NOW - 2 * 3_600_000;
  const usgs = usgsQuakes(usgsFeed(usgsFeature('us7000tv4i', 'us', t, 3.74, -75.72, 5.4)));

  it('is folded into USGS\'s, named by both', () => {
    const emsc = emscQuakes(emscFeed(emscFeature('E1', 'GFZ', t + 20_000, 3.9, -75.6, 5.3)));
    const merged = mergeQuakes(usgs, emsc);
    expect(merged).toHaveLength(1);
    expect(merged[0].reportedBy).toEqual(['USGS (us)', 'EMSC (GFZ)']);
  });

  it('stands apart when far, late or of another size, and USGS\'s are never dropped', () => {
    const emsc = emscQuakes(emscFeed(
      emscFeature('far', 'INGV', t, 42, 13, 5.4),
      emscFeature('late', 'GFZ', t + 5 * 60_000, 3.74, -75.72, 5.4),
      emscFeature('small', 'IGP', t, 3.74, -75.72, 3.2),
    ));
    const merged = mergeQuakes(usgs, emsc);
    expect(merged.map((q) => q.id)).toEqual(['us7000tv4i', 'emsc:far', 'emsc:late', 'emsc:small']);
    expect(merged[0].reportedBy).toEqual(['USGS (us)']);
  });
});

describe('reading a window', () => {
  const window = { from: NOW - DAY, until: NOW, feed: 'day' as const, live: true };
  const answer = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body }) as Response;

  it('reads both, keeps what is inside the window, and counts what it folded', async () => {
    const fetcher = vi.fn(async (url: string) => (url === QUAKE_FEEDS.day.url
      ? answer(usgsFeed(usgsFeature('a', 'us', NOW - 3_600_000, 3.74, -75.72, 5.4), usgsFeature('old', 'us', NOW - 2 * DAY, 0, 0, 3)))
      : answer(emscFeed(emscFeature('b', 'GFZ', NOW - 3_600_000 + 10_000, 3.8, -75.7, 5.2), emscFeature('c', 'KOERI', NOW - 7_200_000, 39, 27, 3.1)))));
    const read = await readQuakeWindow(window, { fetcher });
    expect(read.quakes.map((q) => q.id)).toEqual(['a', 'emsc:c']);
    expect(read).toMatchObject({ emscRead: true, folded: 1, added: 1 });
  });

  it("keeps USGS's when EMSC cannot be read, and fails when USGS cannot", async () => {
    const emscDown = vi.fn(async (url: string) => (url === QUAKE_FEEDS.day.url ? answer(usgsFeed(usgsFeature('a', 'us', NOW - 1000, 0, 0, 4))) : answer({}, false)));
    expect(await readQuakeWindow(window, { fetcher: emscDown })).toMatchObject({ emscRead: false, added: 0 });
    const usgsDown = vi.fn(async (url: string) => (url === QUAKE_FEEDS.day.url ? answer({}, false) : answer(emscFeed())));
    await expect(readQuakeWindow(window, { fetcher: usgsDown })).rejects.toThrow('HTTP 503');
  });
});
