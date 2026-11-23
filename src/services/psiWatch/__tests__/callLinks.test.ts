/**
 * What fell in a call's window (decision D-PW, PW40, PW56, PW74; step 9c): USGS's query for M5.5+ over the Zone's box
 * and the window; its answer read, then kept to the Zone and the window; a storm call's storms from the Kp record,
 * measured values only, consecutive slots one storm; nothing linked in the years held back; found once a visit.
 *
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { KP_BASES, KP_SLOT_MS, type KpRecord } from '../timestream/kp';
import { quakesIn, quakesUrl, readQuakes, resetCallLinksForTests, stormsIn, useQuakeLinks } from '../callLinks';
import type { CallText } from '../calls';

vi.mock('../../../features/globe/areas/areaShapes', () => ({
  loadAreaShapes: async () => new Map([['zone:box', { name: 'Box Zone', geometry: { type: 'Polygon', coordinates: [[[30, 30], [40, 30], [40, 40], [30, 40], [30, 30]]] } }]]),
}));

const FROM = Date.UTC(2026, 10, 1, 12);
const UNTIL = Date.UTC(2026, 10, 2, 12);
const BOX = { type: 'Polygon' as const, coordinates: [[[30, 30], [40, 30], [40, 40], [30, 40], [30, 30]]] as [number, number][][] };
const feature = (id: string, mag: number, ms: number, lon: number, lat: number) => ({ id, properties: { mag, time: ms, place: `${id} place` }, geometry: { coordinates: [lon, lat, 10] } });

describe('quakes', () => {
  it('asks USGS for M5.5+ over the window and the Zone\'s box', () => {
    const url = new URL(quakesUrl(FROM, UNTIL, [30, 30, 40, 40]));
    expect(url.origin + url.pathname).toBe('https://earthquake.usgs.gov/fdsnws/event/1/query');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: 'geojson', starttime: '2026-11-01T12:00:00', endtime: '2026-11-02T12:00:00', minmagnitude: '5.5', orderby: 'time-asc',
      minlatitude: '30', maxlatitude: '40', minlongitude: '30', maxlongitude: '40',
    });
  });

  it('reads the answer and keeps the quakes in the Zone and the window', () => {
    const read = readQuakes({ features: [
      feature('in', 6.1, FROM + 1000, 35, 35), feature('outside', 6.0, FROM + 1000, 45, 35), feature('late', 5.8, UNTIL + 1000, 35, 35),
      feature('small', 5.4, FROM + 1000, 35, 35), { id: 'broken', properties: {} },
    ] });
    expect(read.map((q) => q.id)).toEqual(['in', 'outside', 'late', 'small']);
    expect(quakesIn(read, BOX, FROM, UNTIL)).toEqual([{ id: 'in', ms: FROM + 1000, mag: 6.1, lat: 35, lon: 35, place: 'in place' }]);
    expect(readQuakes(null)).toEqual([]);
  });
});

describe('stormsIn', () => {
  const record = (start: number, kps: number[], basis = 'observed'): KpRecord => ({
    startMs: start, kp3: Uint8Array.from(kps.map((k) => Math.round(k * 3))), basis: Uint8Array.from(kps.map(() => KP_BASES.indexOf(basis as (typeof KP_BASES)[number]))), outlook: [],
  });

  it('joins a storm\'s consecutive slots, each storm with its largest Kp', () => {
    const r = record(FROM, [3, 5, 6.33, 4, 5.67, 2]);
    expect(stormsIn(r, FROM, UNTIL)).toEqual([
      { fromMs: FROM + KP_SLOT_MS, untilMs: FROM + 3 * KP_SLOT_MS, kp: 19 / 3 },
      { fromMs: FROM + 4 * KP_SLOT_MS, untilMs: FROM + 5 * KP_SLOT_MS, kp: 17 / 3 },
    ]);
  });

  it('links no predicted storm, and none in the years held back', () => {
    expect(stormsIn(record(FROM, [7, 7], 'predicted'), FROM, UNTIL)).toEqual([]);
    const old = Date.UTC(2003, 9, 29);
    expect(stormsIn(record(old, [9, 9]), old, old + 86_400_000)).toEqual([]);
  });
});

describe('useQuakeLinks', () => {
  afterEach(() => { resetCallLinksForTests(); vi.unstubAllGlobals(); });
  const text = (kind: 'quakes' | 'storm', start: number, end: number): CallText => ({
    window: { address: 'w', title: 'A window', start: start / 1000, end: end / 1000 }, place: { zone: 'zone:box', name: 'Box Zone' }, expects: { kind }, words: 'x',
  });

  it('finds a closed earthquake call\'s quakes once a visit, and asks nothing of an open or storm call', async () => {
    const fetched: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      fetched.push(url);
      return { ok: true, json: async () => ({ features: [feature('in', 6.1, FROM + 1000, 35, 35), feature('out', 6.1, FROM + 1000, 50, 35)] }) };
    }));
    const calls = [
      { key: 'closed', text: text('quakes', FROM, UNTIL) },
      { key: 'open', text: text('quakes', FROM, UNTIL + 10 * 86_400_000) },
      { key: 'storm', text: text('storm', FROM, UNTIL) },
    ];
    const { result, rerender } = renderHook(() => useQuakeLinks(calls, UNTIL + 86_400_000, true));
    await waitFor(() => expect(result.current.get('closed')).toMatchObject({ state: 'done' }));
    const links = result.current.get('closed');
    expect(links?.state === 'done' && links.quakes.map((q) => q.id)).toEqual(['in']);
    expect([...result.current.keys()]).toEqual(['closed']);
    rerender();
    expect(fetched).toHaveLength(1);
  });

  it('says so when USGS does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const { result } = renderHook(() => useQuakeLinks([{ key: 'k', text: text('quakes', FROM, UNTIL) }], UNTIL + 1, true));
    await waitFor(() => expect(result.current.get('k')).toEqual({ state: 'failed' }));
  });
});
