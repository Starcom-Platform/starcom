/**
 * A ping on a new strong quake, in the app only (D-EQ, EQ9, EQ19, EQ20): which quakes ping (new since the page opened,
 * of the magnitude set or more, once each), the setting kept in this browser, and the notice's words. USGS's feed in
 * the shape it serves (as in quakeWindow.test.ts).
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agoWords, clearQuakePing, DEFAULT_PING_FROM, newPings, PING_FEED_URL, pingWords, placeOf, quakePingFrom, quakePings,
  resetQuakePingsForTests, setQuakePingFrom, watchQuakePings,
} from '../quakePings';
import type { NaturalEvent } from '../../GeoEventsService';
import { claimPing, resetPingClaimsForTests } from '../../pings/pingClaims';

const NOW = Date.parse('2026-11-04T06:00:00Z');
const quake = (id: string, mag: number, t = NOW - 3 * 60_000): NaturalEvent => ({
  id, lat: -11.2, lng: 165.4, type: 'earthquake', magnitude: mag, timestamp: new Date(t).toISOString(),
  description: `M ${mag.toFixed(1)} - 80 km SW of Lata, Solomon Islands`,
});
const feature = (id: string, mag: number, t = NOW - 3 * 60_000) => ({
  type: 'Feature', id,
  properties: { mag, place: '80 km SW of Lata, Solomon Islands', time: t, title: `M ${mag.toFixed(1)} - 80 km SW of Lata, Solomon Islands`, net: 'us', tsunami: 0 },
  geometry: { type: 'Point', coordinates: [165.4, -11.2, 10] },
});
const feed = (...features: ReturnType<typeof feature>[]) => ({ type: 'FeatureCollection', features });

beforeEach(() => { localStorage.clear(); resetQuakePingsForTests(); resetPingClaimsForTests(); });
afterEach(() => { vi.useRealTimers(); });

describe('which quakes ping (EQ19)', () => {
  const none = { seenFirst: new Set<string>(), pinged: new Set<string>() };
  it('those of the magnitude set or more, newest first', () => {
    const found = newPings([quake('a', 5.9), quake('b', 6.0, NOW - 60_000), quake('c', 6.8, NOW - 120_000)], none, '6');
    expect(found.map((p) => p.id)).toEqual(['b', 'c']);
    expect(newPings([quake('a', 5.9)], none, '5').map((p) => p.id)).toEqual(['a']);
    expect(newPings([quake('c', 6.8)], none, '7')).toEqual([]);
  });
  it('none while off, none already known when the page opened, none twice', () => {
    expect(newPings([quake('a', 7.5)], none, 'off')).toEqual([]);
    expect(newPings([quake('a', 7.5)], { seenFirst: new Set(['a']), pinged: new Set() }, '6')).toEqual([]);
    expect(newPings([quake('a', 7.5)], { seenFirst: new Set(), pinged: new Set(['a']) }, '6')).toEqual([]);
  });
  it('names the place as USGS titles it', () => {
    expect(placeOf(quake('a', 6.4))).toBe('80 km SW of Lata, Solomon Islands');
    expect(pingWords(newPings([quake('a', 6.4)], none, '6')[0], NOW)).toBe('M6.4, 80 km SW of Lata, Solomon Islands, 3 min ago');
    expect(agoWords(20_000)).toBe('just now');
    expect(agoWords(2 * 3_600_000)).toBe('2 h ago');
  });
});

describe('the setting (EQ19)', () => {
  it('is M6 until chosen, and kept in this browser', () => {
    expect(quakePingFrom()).toBe(DEFAULT_PING_FROM);
    expect(DEFAULT_PING_FROM).toBe('6');
    setQuakePingFrom('5');
    resetQuakePingsForTests();
    expect(quakePingFrom()).toBe('5');
    localStorage.setItem('starcom:quake-ping', '4');
    resetQuakePingsForTests();
    expect(quakePingFrom()).toBe('6');
  });
});

describe('the watcher (EQ19, EQ20)', () => {
  it('learns the quakes already there, then pings each new one of the magnitude set, once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const reads = [
      feed(feature('old', 7.1)),
      feed(feature('old', 7.1), feature('new', 6.3), feature('small', 4.8)),
      feed(feature('old', 7.1), feature('new', 6.3), feature('small', 6.1)),
    ];
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toBe(PING_FEED_URL);
      return new Response(JSON.stringify(reads.shift() ?? reads[reads.length - 1]), { status: 200 });
    });
    const onPing = vi.fn();
    const stop = watchQuakePings({ onPing, fetcher, everyMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(onPing).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPing.mock.calls.map(([p]) => p.id)).toEqual(['new']);
    // A quake first read under the magnitude pings once it is revised over it.
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPing.mock.calls.map(([p]) => p.id)).toEqual(['new', 'small']);
    expect(quakePings().map((p) => p.id)).toEqual(['small', 'new']);
    clearQuakePing('new');
    expect(quakePings().map((p) => p.id)).toEqual(['small']);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('pings nothing from a failed first read, learning from the next', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let n = 0;
    const fetcher = vi.fn(async () => {
      n += 1;
      if (n === 1) return new Response('', { status: 503 });
      return new Response(JSON.stringify(feed(feature('x', 6.5))), { status: 200 });
    });
    const onPing = vi.fn();
    const stop = watchQuakePings({ onPing, fetcher, everyMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPing).not.toHaveBeenCalled();
    stop();
  });
});

describe('one ping for one item (D-WL, WL2)', () => {
  it('passes over a quake a watch told of first', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const reads = [feed(feature('old', 7.1)), feed(feature('old', 7.1), feature('new', 6.3), feature('other', 6.5))];
    const fetcher = vi.fn(async () => new Response(JSON.stringify(reads.shift() ?? reads[reads.length - 1]), { status: 200 }));
    const onPing = vi.fn();
    const stop = watchQuakePings({ onPing, fetcher, everyMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(claimPing('new')).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPing.mock.calls.map(([p]) => p.id)).toEqual(['other']);
    expect(quakePings().map((p) => p.id)).toEqual(['other']);
    stop();
  });
});
