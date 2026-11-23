/**
 * Pings on what lands in a watched place (D-WL, WL2, WL3, WL6, WL7): which items ping and in which watches, the
 * feeds read only for the kinds watched, a feed's first read only learning, one ping for one item. USGS's and GDACS's
 * feeds in the shapes they serve (as quakePings.test.ts and GeoEventsDataProvider.test.ts have them).
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  counts, hazardItems, landedPings, newKnown, newWatchPings, quakeFeedFor, quakeItems, resetWatchPingsForTests,
  watchPings, watchWatchlist, WATCH_QUAKE_FEEDS, intelItems, warItems, unrestItems, type EcoItem, type WatchItem,
} from '../watchPings';
import { GDACS_LIST_URL } from '../../gdacs/gdacsList';
import { claimPing, resetPingClaimsForTests } from '../../pings/pingClaims';
import type { Watch } from '../../../features/watch/watchlist';
import type { PolygonGeometry } from '../../geoint/pointInPolygon';

const NOW = Date.parse('2026-11-08T08:00:00Z');
const box: PolygonGeometry = { type: 'Polygon', coordinates: [[[130, 30], [146, 30], [146, 46], [130, 46], [130, 30]]] };
const outline = (code: string) => (code === 'jp' ? { geometry: box } : null);
/** Kinds as step 1 named them, The Record's off unless said. */
type Some = Pick<Watch['kinds'], 'quakes' | 'hazards'> & Partial<Watch['kinds']>;
const k = (kinds: Some): Watch['kinds'] => ({ intel: false, war: false, unrest: false, ...kinds });
const japan = (kinds: Some, madeMs = NOW - 3_600_000): Watch => ({ id: 'w-jp', place: { kind: 'territory', code: 'jp', name: 'Japan' }, kinds: k(kinds), madeMs });
const tokyo = (kinds: Some, madeMs = NOW - 3_600_000): Watch => ({ id: 'w-tk', place: { kind: 'circle', lat: 35.68, lng: 139.69, km: 300, name: 'Tokyo' }, kinds: k(kinds), madeMs });

const quakeFeature = (id: string, mag: number, lat = 35.4, lng = 139.8, t = NOW - 3 * 60_000) => ({
  type: 'Feature', id,
  properties: { mag, place: '30 km S of Tokyo, Japan', time: t, title: `M ${mag.toFixed(1)} - 30 km S of Tokyo, Japan`, net: 'us', tsunami: 0 },
  geometry: { type: 'Point', coordinates: [lng, lat, 40] },
});
const usgs = (...features: ReturnType<typeof quakeFeature>[]) => ({ type: 'FeatureCollection', features });
const gdacsFeature = (eventid: number, eventtype: string, alertlevel: 'Green' | 'Orange' | 'Red', lat = 34, lng = 135) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: {
    eventid, episodeid: 3, eventtype, name: `Event ${eventid}`, country: 'Japan',
    fromdate: '2026-11-07T00:00:00', todate: '2026-11-08T06:00:00', alertlevel, alertscore: 2,
    severitydata: { severity: 100, severitytext: 'Test severity text', severityunit: 'unit' },
    url: { geometry: 'https://www.gdacs.org/gdacsapi/api/polygons/getgeometry', report: `https://www.gdacs.org/report.aspx?eventid=${eventid}` },
  },
});
const gdacs = (...features: ReturnType<typeof gdacsFeature>[]) => ({ type: 'FeatureCollection', features });

beforeEach(() => { resetWatchPingsForTests(); resetPingClaimsForTests(); });
afterEach(() => { vi.useRealTimers(); });

const item = (over: Partial<EcoItem>): WatchItem => ({
  id: 'q1', kind: 'quake', lat: 35.4, lng: 139.8, level: 5.2, timeMs: NOW - 60_000,
  event: { id: 'q1', lat: 35.4, lng: 139.8, type: 'earthquake' }, ...over,
});

describe('what counts', () => {
  it('a quake from its magnitude, a hazard from its alert', () => {
    expect(counts(k({ quakes: '4.5', hazards: null }), item({ level: 4.5 }))).toBe(true);
    expect(counts(k({ quakes: '5', hazards: null }), item({ level: 4.9 }))).toBe(false);
    expect(counts(k({ quakes: null, hazards: 'orange' }), item({ kind: 'hazard', level: 1 }))).toBe(true);
    expect(counts(k({ quakes: '2.5', hazards: 'red' }), item({ kind: 'hazard', level: 1 }))).toBe(false);
  });

  it('reads the M2.5 feed only when a watch counts from 2.5, and none when no watch counts quakes', () => {
    expect(quakeFeedFor([])).toBeNull();
    expect(quakeFeedFor([japan({ quakes: null, hazards: 'red' })])).toBeNull();
    expect(quakeFeedFor([japan({ quakes: '5', hazards: null })])).toBe(WATCH_QUAKE_FEEDS['4.5']);
    expect(quakeFeedFor([japan({ quakes: '5', hazards: null }), tokyo({ quakes: '2.5', hazards: null })])).toBe(WATCH_QUAKE_FEEDS['2.5']);
  });

  it("takes GDACS's five hazards, ranked by alert, and passes over its quakes", () => {
    const items = hazardItems(gdacs(gdacsFeature(1, 'FL', 'Orange'), gdacsFeature(2, 'VO', 'Red'), gdacsFeature(3, 'WF', 'Green'), gdacsFeature(4, 'EQ', 'Red')) as never);
    expect(items.map((i) => [i.id, i.level, i.event.type])).toEqual([['gdacs-1', 1, 'flood'], ['gdacs-2', 2, 'volcano'], ['gdacs-3', 0, 'wildfire']]);
  });
});

describe('which items ping (WL2, WL6)', () => {
  it('those first read after the watch was made, of the kind it counts, in its place, once, naming every watch', () => {
    const known = newKnown();
    const list = [japan({ quakes: '4.5', hazards: null }), tokyo({ quakes: '5', hazards: null })];
    const found = newWatchPings([item({ id: 'a', level: 5.5 }), item({ id: 'b', level: 4.6 }), item({ id: 'c', lat: 10, lng: 10 })], known, list, outline, NOW);
    expect(found.map((p) => [p.item.id, p.watches.map((w) => w.name)])).toEqual([
      ['a', ['Japan', '300 km around Tokyo']],
      ['b', ['Japan']],
    ]);
  });

  it('none for a watch made after the item was first read; one revised over a least pings then', () => {
    const known = newKnown();
    const late = japan({ quakes: '4.5', hazards: null }, NOW + 60_000);
    expect(newWatchPings([item({ id: 'a' })], known, [late], outline, NOW)).toEqual([]);
    expect(newWatchPings([item({ id: 'a' })], known, [late], outline, NOW + 120_000)).toEqual([]);
    const strict = japan({ quakes: '6', hazards: null });
    expect(newWatchPings([item({ id: 'b', level: 5.8 })], known, [strict], outline, NOW)).toEqual([]);
    expect(newWatchPings([item({ id: 'b', level: 6.1 })], known, [strict], outline, NOW + 300_000).map((p) => p.item.id)).toEqual(['b']);
  });
});

describe('the watcher (WL3)', () => {
  const run = (list: Watch[], reads: Record<string, object[]>) => {
    const fetcher = vi.fn(async (url: string) => {
      const queue = reads[url];
      if (!queue) throw new Error(`not read: ${url}`);
      return new Response(JSON.stringify(queue.length > 1 ? queue.shift() : queue[0]), { status: 200 });
    });
    const onPing = vi.fn();
    let tellList: (() => void) | null = null;
    const stop = watchWatchlist({
      list: () => list, subscribe: (l) => { tellList = l; return () => { tellList = null; }; },
      outline: async () => outline, onPing, fetcher, quakesEveryMs: 1000, hazardsEveryMs: 2000, now: () => NOW,
    });
    return { fetcher, onPing, stop, changed: () => tellList?.() };
  };

  it('learns each feed first, then pings what is new; reads only the kinds watched', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { fetcher, onPing, stop } = run([japan({ quakes: '4.5', hazards: null })], {
      [WATCH_QUAKE_FEEDS['4.5']]: [usgs(quakeFeature('old', 6)), usgs(quakeFeature('old', 6), quakeFeature('new', 5.1), quakeFeature('far', 6, -20, -70))],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onPing).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPing.mock.calls.map(([p]) => p.item.id)).toEqual(['new']);
    expect(watchPings().map((p) => p.item.id)).toEqual(['new']);
    expect(landedPings().map((p) => p.item.id)).toEqual(['new']);
    expect(fetcher.mock.calls.every(([url]) => url !== GDACS_LIST_URL)).toBe(true);
    stop();
  });

  it('starts reading a kind once a watch counts it, and passes over a quake the M6+ ping told of first', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const list: Watch[] = [];
    const { fetcher, onPing, stop, changed } = run(list, {
      [WATCH_QUAKE_FEEDS['4.5']]: [usgs(), usgs(quakeFeature('told', 6.4), quakeFeature('mine', 5))],
      [GDACS_LIST_URL]: [gdacs(), gdacs(gdacsFeature(9, 'TC', 'Red'))],
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).not.toHaveBeenCalled();
    list.push(japan({ quakes: '4.5', hazards: 'orange' }));
    changed();
    await vi.advanceTimersByTimeAsync(0);
    expect(claimPing('told')).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onPing.mock.calls.map(([p]) => p.item.id).sort()).toEqual(['gdacs-9', 'mine']);
    stop();
  });
});

describe('quake items', () => {
  it('need a magnitude and a time', () => {
    expect(quakeItems([{ id: 'x', lat: 1, lng: 2, type: 'earthquake', timestamp: new Date(NOW).toISOString() }])).toEqual([]);
  });
});

describe('what The Record carries (step 2, WL10–WL12)', () => {
  const report = (id: string, over: Record<string, unknown> = {}) => ({
    id, title: `Report ${id}`, content: 'body', createdAt: new Date(NOW + 60_000), latitude: 35.4, longitude: 139.8, jurisdictions: ['JP'], ...over,
  }) as never;
  const line = (id: string, role: string, over: Record<string, unknown> = {}) => ({
    id, family: 'item', role, title: `Line ${id}`, reportedAt: (NOW + 60_000) / 1000, point: { lat: 35.4, lon: 139.8 }, jurisdiction: 'jp', ...over,
  }) as never;
  const day = (id: string, section: string, over: Record<string, unknown> = {}) => ({
    id, section, title: `Day ${id}`, publishedAt: (NOW + 60_000) / 1000, jurisdiction: 'JP', kinds: ['protest'], ...over,
  }) as never;

  it('takes every report, the critical and actionable lines, and the days of unrest, never context or a surge', () => {
    expect(intelItems([report('r1')]).map((i) => [i.id, i.lat, i.jurisdictions])).toEqual([['r1', 35.4, ['jp']]]);
    expect(warItems({ items: [line('a', 'critical'), line('b', 'actionable'), line('c', 'context')] }).map((i) => i.id)).toEqual(['a', 'b']);
    expect(unrestItems([day('d', 'CivilUnrest'), day('s', 'ProtestSurges')]).map((i) => [i.id, i.lat])).toEqual([['d', NaN]]);
  });

  it('pings a note published after the watch was made and the watcher started; a country watch takes one naming it', () => {
    const known = newKnown(NOW);
    const both = [japan({ quakes: null, hazards: null, unrest: true }), tokyo({ quakes: null, hazards: null, unrest: true })];
    // A day of unrest about Japan as a whole: no point, so in the Japan watch only.
    const found = newWatchPings(unrestItems([day('d', 'CivilUnrest')]), known, both, outline, NOW + 120_000);
    expect(found.map((p) => [p.item.id, p.watches.map((w) => w.name)])).toEqual([['d', ['Japan']]]);
    // Published before the watcher started: in the reader's first answer, not new.
    expect(newWatchPings(unrestItems([day('old', 'CivilUnrest', { publishedAt: (NOW - 60_000) / 1000 })]), known, both, outline, NOW + 120_000)).toEqual([]);
    // A watch with the kind off takes nothing of it.
    expect(newWatchPings(intelItems([report('r')]), newKnown(NOW), [japan({ quakes: '4.5', hazards: null, intel: false })], outline, NOW + 120_000)).toEqual([]);
  });

  it('listens to a kind only while a watch counts it, and tells of what is new', async () => {
    const list: Watch[] = [japan({ quakes: null, hazards: null, war: true })];
    let tellWar: ((held: { items: never[] }) => void) | null = null;
    const started = vi.fn(); const stoppedReader = vi.fn();
    const onPing = vi.fn();
    let changed: (() => void) | null = null;
    const stop = watchWatchlist({
      list: () => list, subscribe: (l) => { changed = l; return () => { changed = null; }; },
      outline: async () => outline, onPing, now: () => NOW, fetcher: vi.fn(),
      record: {
        war: { start: () => { started(); return stoppedReader; }, subscribe: (told) => { tellWar = told as never; told({ items: [] }); return () => { tellWar = null; }; } },
      },
    });
    expect(started).toHaveBeenCalledTimes(1);
    tellWar!({ items: [line('a', 'critical'), line('c', 'context')] });
    await vi.waitFor(() => expect(onPing).toHaveBeenCalledTimes(1));
    expect(onPing.mock.calls[0][0].item.id).toBe('a');
    // Turned off on every watch: the reader is let go.
    list[0] = { ...list[0], kinds: { ...list[0].kinds, war: false } };
    changed!();
    expect(stoppedReader).toHaveBeenCalledTimes(1);
    stop();
  });
});
