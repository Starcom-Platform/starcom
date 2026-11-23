/**
 * RainViewer's radar, fetched by its terms (decision D-W, WX4; record D-L,
 * L2): the newest frame of its public map list, read at most every ten
 * minutes; sixteen tiles a frame at zoom 2; the coverage tiles kept a day;
 * never more than 60 requests in a minute (RainViewer allows 100); one at a
 * time; quiet after a failure.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { RainViewerClient } from '../rainviewer/rainViewerClient';
import { radarAt } from '../rainviewer/radar';
import { memoryGfsCache } from '../gfs/gfsClient';

const DIR = 'src/services/weather/__fixtures__/rainviewer';
const MAPS = readFileSync(`${DIR}/weather-maps.json`, 'utf8');
const maps = JSON.parse(MAPS);
const HOST = maps.host as string;
const FRAME = maps.radar.past.at(-1) as { time: number; path: string };
const RADAR_11 = new Uint8Array(readFileSync(`${DIR}/radar-z2-1-1.png`));
const COVER_11 = new Uint8Array(readFileSync(`${DIR}/coverage-z2-1-1.png`));
const CLEAR = (() => { const p = new PNG({ width: 256, height: 256 }); p.data.fill(0); return new Uint8Array(PNG.sync.write(p)); })();
const NOW = (FRAME.time + 300) * 1000;

function network(options: { mapsStatus?: number; nextFrame?: () => string; clock?: () => number } = {}) {
  const asked: string[] = [];
  const at: number[] = [];
  let open = 0, mostOpen = 0;
  const fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    at.push(options.clock?.() ?? 0);
    open++; mostOpen = Math.max(mostOpen, open);
    await Promise.resolve();
    open--;
    if (url === 'https://api.rainviewer.com/public/weather-maps.json') {
      if (options.mapsStatus) return new Response('busy', { status: options.mapsStatus });
      const body = options.nextFrame ? MAPS.replaceAll(FRAME.path, options.nextFrame()) : MAPS;
      return new Response(body, { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/256/2/1/1/2/0_1.png')) return new Response(RADAR_11, { headers: { 'Content-Type': 'image/png' } });
    if (url === `${HOST}/v2/coverage/0/256/2/1/1/0/0_0.png`) return new Response(COVER_11, { headers: { 'Content-Type': 'image/png' } });
    if (url.endsWith('.png')) return new Response(CLEAR, { headers: { 'Content-Type': 'image/png' } });
    return new Response('not found', { status: 404 });
  };
  return { fetch: fetch as typeof globalThis.fetch, asked, at, mostOpen: () => mostOpen };
}

function client(net: ReturnType<typeof network>, now = NOW, cache = memoryGfsCache(), slept: number[] = []) {
  return new RainViewerClient({ fetch: net.fetch, now: () => now, cache, sleep: async (ms) => { slept.push(ms); } });
}

describe('RainViewerClient', () => {
  it('reads the newest frame: the map list, sixteen radar tiles and sixteen coverage tiles, by RainViewer\'s own addresses', async () => {
    const net = network();
    const radar = await client(net).load();
    expect(radar.time.toISOString()).toBe(new Date(FRAME.time * 1000).toISOString());
    expect(net.asked[0]).toBe('https://api.rainviewer.com/public/weather-maps.json');
    expect(net.asked.filter((u) => u.startsWith(`${HOST}${FRAME.path}/256/2/`))).toHaveLength(16);
    expect(net.asked.filter((u) => u.startsWith(`${HOST}/v2/coverage/0/256/2/`))).toHaveLength(16);
    expect(net.asked).toHaveLength(33);
    // What the tiles said, put together: radar reaches Philadelphia, not the open Atlantic.
    expect(radarAt(radar.mosaic, 40, -75)?.covered).toBe(true);
    expect(radarAt(radar.mosaic, 30, -40)?.covered).toBe(false);
  });

  it('asks nothing within ten minutes on the same page, and keeps the coverage a day across pages', async () => {
    const net = network();
    const cache = memoryGfsCache();
    const c = client(net, NOW, cache);
    await c.load();
    await c.load();
    expect(net.asked).toHaveLength(33);
    // A new page an hour later: the map list and the radar again, the coverage from the cache.
    await client(net, NOW + 3600e3, cache).load();
    expect(net.asked.slice(33).filter((u) => u.includes('/coverage/'))).toHaveLength(0);
    expect(net.asked.slice(33)).toHaveLength(17);
    // A day on, the coverage is read again.
    await client(net, NOW + 25 * 3600e3, cache).load();
    expect(net.asked.slice(50).filter((u) => u.includes('/coverage/'))).toHaveLength(16);
  });

  it('makes one request at a time, and never more than 60 in any minute', async () => {
    // Three new frames back to back are 67 requests: the client must wait rather than send them in one minute.
    let clock = NOW, frame = 0;
    const net = network({ nextFrame: () => `/v2/radar/frame${frame++}`, clock: () => clock });
    const c = new RainViewerClient({
      fetch: net.fetch, now: () => clock, cache: memoryGfsCache(), mapsEveryMs: 0,
      sleep: async (ms) => { clock += ms; },
    });
    await Promise.all([c.load(), c.load(), c.load()]);
    expect(net.asked).toHaveLength(67);
    expect(net.mostOpen()).toBe(1);
    for (let i = 0; i < net.at.length; i++) {
      const inWindow = net.at.filter((t) => t >= net.at[i] && t < net.at[i] + 60e3).length;
      expect(inWindow, `from request ${i}`).toBeLessThanOrEqual(60);
    }
    expect(clock).toBeGreaterThan(NOW);
  });

  it('says so when RainViewer does not answer, and asks nobody again for ten minutes', async () => {
    const net = network({ mapsStatus: 503 });
    const c = client(net);
    await expect(c.load()).rejects.toThrow(/RainViewer/);
    const asked = net.asked.length;
    await expect(c.load()).rejects.toThrow(/again after/);
    expect(net.asked).toHaveLength(asked);
  });
});
