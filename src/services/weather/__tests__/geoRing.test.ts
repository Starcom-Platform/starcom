/**
 * EUMETSAT's Geostationary Ring infrared image, for real clouds (decision
 * D-W, WX2 as revised on 2026-10-06): one global mosaic every 3 hours. The
 * rules are the protocol's: a slot at least two hours old (EUMETSAT's open
 * "Core" data, and what it has published), one request at a time, a slot
 * fetched once, a failed slot stepped back from without waiting, and quiet
 * after everything fails.
 */
import { describe, it, expect } from 'vitest';
import { GeoRingClient, geoRingSlots, geoRingUrl } from '../geoRing';
import { memoryGfsCache } from '../gfs/gfsClient';

const H = 3600e3;
const NOW = Date.parse('2026-10-06T04:03:00Z');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function network(answer: (time: string) => number) {
  const asked: string[] = [];
  let open = 0, mostOpen = 0;
  const fetch = async (input: RequestInfo | URL) => {
    const time = new URL(String(input)).searchParams.get('TIME')!;
    asked.push(time);
    open++; mostOpen = Math.max(mostOpen, open);
    await Promise.resolve();
    open--;
    const status = answer(time);
    return status === 200
      ? new Response(PNG, { status, headers: { 'Content-Type': 'image/png' } })
      : new Response('<ServiceExceptionReport/>', { status, headers: { 'Content-Type': 'text/xml' } });
  };
  return { fetch: fetch as typeof globalThis.fetch, asked, mostOpen: () => mostOpen };
}

describe('geoRingSlots', () => {
  it('names the 3-hourly slots at least two hours old, newest first', () => {
    expect(geoRingSlots(NOW).map((t) => new Date(t).toISOString())).toEqual([
      '2026-10-06T00:00:00.000Z', '2026-10-05T21:00:00.000Z', '2026-10-05T18:00:00.000Z', '2026-10-05T15:00:00.000Z',
    ]);
    expect(new Date(geoRingSlots(Date.parse('2026-10-06T05:00:00Z'))[0]).toISOString()).toBe('2026-10-06T03:00:00.000Z');
  });

  it('answers a past moment with the slot nearest it, not one two hours before it (step 5a)', () => {
    // A moment a day ago: the satellites saw it long since, so its own nearest slot is published.
    const now = Date.parse('2026-10-06T18:00:00Z');
    expect(new Date(geoRingSlots(Date.parse('2026-10-05T10:40:00Z'), now)[0]).toISOString()).toBe('2026-10-05T12:00:00.000Z');
    expect(new Date(geoRingSlots(Date.parse('2026-10-05T10:20:00Z'), now)[0]).toISOString()).toBe('2026-10-05T09:00:00.000Z');
    // A moment an hour ago: its nearest slot is not out yet, so the newest that is.
    expect(new Date(geoRingSlots(Date.parse('2026-10-06T17:00:00Z'), now)[0]).toISOString()).toBe('2026-10-06T15:00:00.000Z');
    // Stepping back from there, three hours at a time.
    expect(geoRingSlots(Date.parse('2026-10-05T10:40:00Z'), now).map((t) => new Date(t).toISOString().slice(11, 16))).toEqual(['12:00', '09:00', '06:00', '03:00']);
  });
});

describe('geoRingUrl', () => {
  it('asks EUMETView for the whole ring as one image, at a slot', () => {
    const url = new URL(geoRingUrl(Date.parse('2026-10-05T21:00:00Z')));
    expect(url.origin + url.pathname).toBe('https://view.eumetsat.int/geoserver/wms');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      SERVICE: 'WMS', REQUEST: 'GetMap', LAYERS: 'mumi:worldcloudmap_ir108', CRS: 'EPSG:4326',
      BBOX: '-90,-180,90,180', WIDTH: '2048', HEIGHT: '1024', FORMAT: 'image/png', TIME: '2026-10-05T21:00:00Z',
    });
  });
});

describe('GeoRingClient', () => {
  const client = (net: ReturnType<typeof network>, now = NOW, cache = memoryGfsCache()) =>
    new GeoRingClient({ fetch: net.fetch, now: () => now, cache });

  it('takes the newest slot published, stepping back past a failed one without waiting', async () => {
    const net = network((t) => (t === '2026-10-06T00:00:00Z' ? 502 : 200));
    const img = await client(net).load();
    expect(img.slot.toISOString()).toBe('2026-10-05T21:00:00.000Z');
    expect(img.blob.size).toBe(PNG.length);
    expect(net.asked).toEqual(['2026-10-06T00:00:00Z', '2026-10-05T21:00:00Z']);
  });

  it('asks for the slot nearest a past moment, counting the two hours from now (step 5a)', async () => {
    const net = network(() => 200);
    const got = await client(net).load(Date.parse('2026-10-05T10:40:00Z'));
    expect(net.asked).toEqual(['2026-10-05T12:00:00Z']);
    expect(got.slot.toISOString()).toBe('2026-10-05T12:00:00.000Z');
  });

  it('refuses an answer that is not a picture, as EUMETView answers some failures with a 200', async () => {
    let first = true;
    const net = network(() => 200);
    const odd: typeof globalThis.fetch = async (input) => {
      if (first) { first = false; net.asked.push('xml'); return new Response('<ServiceExceptionReport/>', { status: 200, headers: { 'Content-Type': 'application/vnd.ogc.se_xml' } }); }
      return net.fetch(input);
    };
    const img = await new GeoRingClient({ fetch: odd, now: () => NOW, cache: memoryGfsCache() }).load();
    expect(img.slot.toISOString()).toBe('2026-10-05T21:00:00.000Z');
  });

  it('fetches a slot once: again on the same page, and after a reload', async () => {
    const net = network(() => 200);
    const cache = memoryGfsCache();
    await client(net, NOW, cache).load();
    await client(net, NOW, cache).load();
    expect(net.asked).toEqual(['2026-10-06T00:00:00Z']);
  });

  it('makes one request at a time', async () => {
    const net = network((t) => (t === '2026-10-06T00:00:00Z' ? 502 : 200));
    const c = client(net);
    await Promise.all([c.load(), c.load(), c.load(Date.parse('2026-10-05T23:00:00Z'))]);
    expect(net.mostOpen()).toBe(1);
  });

  it('says so when no slot of the last twelve hours answers, and asks nobody again for 15 minutes', async () => {
    const net = network(() => 502);
    const c = client(net);
    await expect(c.load()).rejects.toThrow(/EUMETSAT.*12 hours/s);
    expect(net.asked).toHaveLength(4);
    await expect(c.load()).rejects.toThrow(/again after 04:18Z/);
    expect(net.asked).toHaveLength(4);
  });
});
