/**
 * The quakes of a window older than the live feeds (D-EQ, EQ3, EQ4, EQ15): USGS's catalogue a decade a file, NOAA's
 * atlas with its deaths and tsunamis, an atlas quake that is one of USGS's folded into it, and USGS's own service for
 * the part past the bake. Fixtures in the shapes the bake scripts write.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ATLAS_URL, atlasMoment, atlasQuakes, catalogueQuakes, decadesOf, foldAtlas, readHistoryWindow, resetHistoryForTests,
} from '../quakeHistory';

const utc = (y: number, m = 0, d = 1) => Date.UTC(y, m, d);

const decade1960 = {
  decade: 1960, from: utc(1960) / 1000, until: utc(1970) / 1000, credit: 'USGS',
  ids: ['official19600522191120_30', 'iscgem876034', 'iscgem869809'],
  t: [Date.parse('1960-05-22T19:11:20Z') / 1000, Date.parse('1964-03-28T03:36:16Z') / 1000, Date.parse('1966-01-05T00:00:00Z') / 1000],
  lat: [-38.14, 60.91, 10], lng: [-73.41, -147.34, 20], depth: [25, 25, -1], mag: [9.5, 9.2, 5.1],
};
const atlas = {
  credit: 'NCEI',
  ids: [1, 5000, 6000],
  year: [-2150, 1964, 1755],
  month: [null, 3, 11],
  day: [null, 28, 1],
  clock: [null, 3 * 3600 + 36 * 60 + 14, null],
  place: ['Jordan: Bab-A-Daraa,Al-Karak', 'Alaska', 'Portugal: Lisbon'],
  lat: [31.1, 61.02, 36.5], lng: [35.5, -147.65, -11], depth: [null, 23, null], mag: [7.3, 9.2, 8.5], intensity: [null, 10, 11],
  deaths: [null, 131, 60000], deathsOrder: [3, 3, 4], damageM: [null, 311, null], tsunami: [false, true, true],
};

describe("an atlas quake's moment", () => {
  it('is as precise as its record: a year, a day, a time; NCEI\'s -2150 is 2150 BC', () => {
    expect(atlasMoment(-2150, null, null, null)).toEqual({ t: new Date('-002149-01-01T00:00:00Z').getTime(), words: '2150 BC' });
    expect(atlasMoment(1755, 11, 1, null).words).toBe('1 Nov 1755');
    expect(atlasMoment(1964, 3, 28, 3 * 3600 + 36 * 60).words).toBe('28 Mar 1964 03:36Z');
    expect(atlasMoment(79, 8, null, null).words).toBe('Aug 79');
  });
});

describe('the decades a window touches', () => {
  it('from 1900, a decade a file', () => {
    expect(decadesOf(utc(1964), utc(1965))).toEqual([1960]);
    expect(decadesOf(utc(1958), utc(1971))).toEqual([1950, 1960, 1970]);
    expect(decadesOf(utc(1850), utc(1905))).toEqual([1900]);
    expect(decadesOf(utc(1700), utc(1800))).toEqual([]);
  });
});

describe("the history's quakes", () => {
  it("USGS's catalogue, inside the window, each linked to its page", () => {
    const quakes = catalogueQuakes(decade1960, utc(1964), utc(1965));
    expect(quakes).toHaveLength(1);
    expect(quakes[0]).toMatchObject({ id: 'iscgem876034', magnitude: 9.2, depthKm: 25, sourceUrl: 'https://earthquake.usgs.gov/earthquakes/eventpage/iscgem876034' });
    expect(catalogueQuakes(decade1960, utc(1966), utc(1967))[0].depthKm).toBeUndefined();
  });

  it("NOAA's atlas, with its deaths, tsunami and the date as it gives it", () => {
    const [lisbon] = atlasQuakes(atlas, utc(1755), utc(1756));
    expect(lisbon).toMatchObject({
      id: 'ncei:6000', magnitude: 8.5, dateWords: '1 Nov 1755', description: 'M 8.5 - Portugal: Lisbon', source: 'NOAA NCEI',
      atlas: { ncei: 6000, deaths: 60000, deathsOrder: 4, tsunami: true, intensity: 11, damageMillions: null },
    });
  });

  it("folds an atlas quake that is one of USGS's into it, keeping NOAA's record", () => {
    const merged = foldAtlas(catalogueQuakes(decade1960, utc(1964), utc(1965)), atlasQuakes(atlas, utc(1964), utc(1965)));
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'iscgem876034', atlas: { deaths: 131, tsunami: true } });
    expect(merged[0].reportedBy).toEqual(["USGS's catalogue", "NOAA NCEI's significant quakes"]);
    expect(merged[0].description).toBe('M 9.2 quake - Alaska');
  });
});

describe('reading a history window', () => {
  afterEach(() => resetHistoryForTests());
  const answer = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body }) as Response;

  it('reads only the decades it touches and the atlas, each once', async () => {
    const fetcher = vi.fn(async (url: string) => (url === ATLAS_URL ? answer(atlas) : url.endsWith('m5-1960.json') ? answer(decade1960) : answer({}, false)));
    const read = await readHistoryWindow({ from: utc(1964), until: utc(1965) }, { fetcher });
    expect(read).toMatchObject({ atlasRead: true, atlasCount: 1 });
    expect(read.quakes.map((q) => q.id)).toEqual(['iscgem876034']);
    await readHistoryWindow({ from: utc(1960), until: utc(1961) }, { fetcher });
    expect(fetcher.mock.calls.map(([url]) => url).sort()).toEqual([ATLAS_URL, '/data/quakes/history/m5-1960.json']);
  });

  it("reads the atlas alone before 1900, and USGS's service past the bake", async () => {
    const before = vi.fn(async (url: string) => (url === ATLAS_URL ? answer(atlas) : answer({}, false)));
    expect((await readHistoryWindow({ from: utc(1755), until: utc(1756) }, { fetcher: before })).quakes.map((q) => q.id)).toEqual(['ncei:6000']);
    resetHistoryForTests();
    const baked = { ...decade1960, decade: 2020, from: utc(2020) / 1000, until: utc(2026, 9, 1) / 1000, ids: [], t: [], lat: [], lng: [], depth: [], mag: [] };
    const recent = { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'us7000late', properties: { mag: 6.1, time: utc(2026, 9, 10), net: 'us', title: 'M 6.1', types: ',origin,' }, geometry: { type: 'Point', coordinates: [140, 35, 10] } }] };
    const after = vi.fn(async (url: string) => (url === ATLAS_URL ? answer(atlas) : url.endsWith('m5-2020.json') ? answer(baked) : url.includes('fdsnws') ? answer(recent) : answer({}, false)));
    const read = await readHistoryWindow({ from: utc(2026, 8, 1), until: utc(2026, 9, 20) }, { fetcher: after });
    expect(read.quakes.map((q) => q.id)).toEqual(['us7000late']);
    const query = new URL(after.mock.calls.map(([url]) => url).find((url) => url.includes('fdsnws')) as string);
    expect(query.searchParams.get('starttime')).toBe('2026-10-01T00:00:00');
    expect(query.searchParams.get('minmagnitude')).toBe('5');
  });
});
