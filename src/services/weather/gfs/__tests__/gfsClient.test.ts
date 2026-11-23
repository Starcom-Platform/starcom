/**
 * The GFS client: how Starcom reads NOAA's model without overusing anyone's
 * service (decision D-W, WX1 and WX5; the protocol section of
 * docs/missions/01-architecture-decisions/weather-visualization.md).
 *
 * The network is a fake that serves the real fixtures at their real byte
 * offsets, and records every request, so each rule of the protocol is a test:
 * the newest published run, only the bytes of the fields on show, one request
 * at a time, nothing fetched twice, a reload within the hour costing nothing,
 * backing off on failure, and PacIOOS only after AWS has failed three times.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { GfsClient, runCandidates, stepsAround, memoryGfsCache, type GfsCache } from '../gfsClient';

const DIR = 'src/services/weather/gfs/__fixtures__';
const IDX = readFileSync(`${DIR}/gfs.t18z.pgrb2.1p00.f003.idx`, 'utf8');
const TMP = new Uint8Array(readFileSync(`${DIR}/gfs.t18z.pgrb2.1p00.f003.tmp2m.grib2`));
const PRATE = new Uint8Array(readFileSync(`${DIR}/gfs.t18z.pgrb2.1p00.f003.prate-avg.grib2`));
const NC = new Uint8Array(gunzipSync(readFileSync(`${DIR}/erddap.ncep_global.tmp2m.2026-10-05T21Z.nc.gz`)));
// The same run's 6-hour step, fetched by byte range from its file on 2026-10-06: its index, its
// temperature and its mean rain, which covers 0-6 hours (GFS's means reset every 6 hours).
const IDX6 = readFileSync(`${DIR}/gfs.t18z.pgrb2.1p00.f006.idx`, 'utf8');
const TMP6 = new Uint8Array(readFileSync(`${DIR}/gfs.t18z.pgrb2.1p00.f006.tmp2m.grib2`));
const PRATE6 = new Uint8Array(readFileSync(`${DIR}/gfs.t18z.pgrb2.1p00.f006.prate-avg.grib2`));
const AWS = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com';
const T_21_40 = Date.parse('2026-10-05T21:40:00Z');

const LISTING = (day: string, cycles: string[]) => `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>noaa-gfs-bdp-pds</Name><Prefix>gfs.${day}/</Prefix>
${cycles.map((c) => `<CommonPrefixes><Prefix>gfs.${day}/${c}/</Prefix></CommonPrefixes>`).join('')}</ListBucketResult>`;

type Rule = (url: string, init?: RequestInit) => Response | undefined;

/** The Range header a request carries, however its headers were written. */
const rangeOf = (init?: RequestInit): string | null => {
  const h = init?.headers;
  if (!h) return null;
  if (h instanceof Headers) return h.get('Range');
  const entries = Array.isArray(h) ? h : Object.entries(h);
  return entries.find(([k]) => k.toLowerCase() === 'range')?.[1] ?? null;
};

/** A network that answers by rules, logs every request, and counts how many are open at once. */
function network(...rules: Rule[]) {
  const log: string[] = [];
  let open = 0, mostOpen = 0;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const range = rangeOf(init);
    log.push(range ? `${url} ${range}` : url);
    open++; mostOpen = Math.max(mostOpen, open);
    await Promise.resolve();
    try {
      for (const rule of rules) { const r = rule(url, init); if (r) return r; }
      return new Response('NoSuchKey', { status: 404 });
    } finally { open--; }
  };
  return { fetch: fetch as typeof globalThis.fetch, log, mostOpen: () => mostOpen };
}

const listing = (day: string, cycles: string[]): Rule => (url) =>
  url.startsWith(`${AWS}/?list-type=2&prefix=gfs.${day}/`) ? new Response(LISTING(day, cycles)) : undefined;
const idx = (run: string): Rule => (url) =>
  url === `${AWS}/gfs.${run.slice(0, 8)}/${run.slice(8)}/atmos/gfs.t${run.slice(8)}z.pgrb2.1p00.f003.idx` ? new Response(IDX) : undefined;
const ranges: Rule = (url, init) => {
  if (!url.endsWith('.pgrb2.1p00.f003')) return undefined;
  const range = rangeOf(init);
  if (range === 'bytes=34114825-34162665') return new Response(TMP, { status: 206 });
  if (range === `bytes=34907910-${34907910 + PRATE.length - 1}`) return new Response(PRATE, { status: 206 });
  return new Response('bad range', { status: 416 });
};
/** One step of one run as the bucket holds it: its index, and its fields' bytes at their ranges. */
const stepFile = (run: string, fff: string, index: string, bytes: Record<string, Uint8Array>): Rule => (url, init) => {
  const base = `${AWS}/gfs.${run.slice(0, 8)}/${run.slice(8)}/atmos/gfs.t${run.slice(8)}z.pgrb2.1p00.${fff}`;
  if (url === `${base}.idx`) return new Response(index);
  if (url !== base) return undefined;
  const body = bytes[rangeOf(init) ?? ''];
  return body ? new Response(body, { status: 206 }) : new Response('bad range', { status: 416 });
};
const F003 = { 'bytes=34114825-34162665': TMP, [`bytes=34907910-${34907910 + PRATE.length - 1}`]: PRATE };
const F006 = { [`bytes=34361384-${34361384 + TMP6.length - 1}`]: TMP6, [`bytes=35157056-${35157056 + PRATE6.length - 1}`]: PRATE6 };
const failing = (status: number, headers?: Record<string, string>): Rule => (url) =>
  url.startsWith(AWS) && !url.includes('list-type') && !url.endsWith('.idx') ? new Response('Slow Down', { status, headers }) : undefined;
const erddap: Rule = (url) => (url.startsWith('https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ncep_global.nc?') ? new Response(NC) : undefined);

function client(net: ReturnType<typeof network>, options: { cache?: GfsCache; now?: number; random?: number } = {}) {
  const slept: number[] = [];
  const c = new GfsClient({
    fetch: net.fetch,
    now: () => options.now ?? T_21_40,
    sleep: async (ms) => { slept.push(ms); },
    random: () => options.random ?? 0.5,
    cache: options.cache ?? memoryGfsCache(),
  });
  return { c, slept };
}

describe('which run and step answer a moment', () => {
  it('takes the newest run whose nearest step is at least 3 hours in', () => {
    const runs = ['2026-10-05T00:00Z', '2026-10-05T06:00Z', '2026-10-05T12:00Z', '2026-10-05T18:00Z'].map(Date.parse);
    expect(runCandidates(T_21_40, runs).slice(0, 2)).toEqual([
      { run: Date.parse('2026-10-05T18:00Z'), step: 3 },
      { run: Date.parse('2026-10-05T12:00Z'), step: 9 },
    ]);
    // At 19:00 the 18Z run's nearest step is its analysis (0), which has no
    // mean rain; the 12Z run's 6-hour step answers instead.
    expect(runCandidates(Date.parse('2026-10-05T19:00Z'), runs)[0]).toEqual({ run: Date.parse('2026-10-05T12:00Z'), step: 6 });
    // Nothing past the model's 16 days.
    expect(runCandidates(Date.parse('2026-10-25T00:00Z'), runs)).toEqual([]);
  });
});

describe('GfsClient', () => {
  let net: ReturnType<typeof network>;
  beforeEach(() => { net = network(listing('20261005', ['00', '06', '12', '18']), idx('2026100518'), ranges, erddap); });

  it('reads the newest published run, and only the bytes of the field asked for', async () => {
    const { c } = client(net);
    const t = await c.load('tmp2m');
    expect(t).toMatchObject({ field: 'tmp2m', source: 'aws', units: 'K', step: 3 });
    expect(t.run?.toISOString()).toBe('2026-10-05T18:00:00.000Z');
    expect(t.valid.toISOString()).toBe('2026-10-05T21:00:00.000Z');
    expect(t.values[33780]).toBeCloseTo(308.70212, 4);
    expect(net.log).toEqual([
      `${AWS}/?list-type=2&prefix=gfs.20261005/&delimiter=/`,
      `${AWS}/gfs.20261005/18/atmos/gfs.t18z.pgrb2.1p00.f003.idx`,
      `${AWS}/gfs.20261005/18/atmos/gfs.t18z.pgrb2.1p00.f003 bytes=34114825-34162665`,
    ]);
  });

  it('reads the mean rain rate, not the moment, and keeps the window it covers', async () => {
    const { c } = client(net);
    const r = await c.load('prate');
    expect(r.window?.start.toISOString()).toBe('2026-10-05T18:00:00.000Z');
    expect(net.log.at(-1)).toBe(`${AWS}/gfs.20261005/18/atmos/gfs.t18z.pgrb2.1p00.f003 bytes=34907910-${34907910 + PRATE.length - 1}`);
  });

  it('moves to an older run when the newest has not published the step, and to PacIOOS after three, without waiting', async () => {
    net = network(listing('20261005', ['00', '06', '12', '18']), ranges, erddap);
    const { c, slept } = client(net);
    expect((await c.load('tmp2m')).source).toBe('pacioos');
    expect(net.log.filter((u) => u.endsWith('.idx'))).toEqual([
      `${AWS}/gfs.20261005/18/atmos/gfs.t18z.pgrb2.1p00.f003.idx`,
      `${AWS}/gfs.20261005/12/atmos/gfs.t12z.pgrb2.1p00.f009.idx`,
      `${AWS}/gfs.20261005/06/atmos/gfs.t06z.pgrb2.1p00.f015.idx`,
    ]);
    // Not yet published is not an outage: nothing waited.
    expect(slept).toEqual([]);
  });

  it('never takes a whole file when a server ignores the byte range', async () => {
    net = network(listing('20261005', ['18']), idx('2026100518'), (url) => (url.endsWith('.f003') ? new Response(TMP, { status: 200 }) : undefined), erddap);
    const { c } = client(net);
    expect((await c.load('tmp2m')).source).toBe('pacioos');
  });

  it('refuses a range that holds another field or another hour than the one asked for', async () => {
    // Another field: the bytes at temperature's range are rain's.
    const swapped: Rule = (url, init) => (url.endsWith('.f003') && rangeOf(init) === 'bytes=34114825-34162665' ? new Response(PRATE, { status: 206 }) : undefined);
    net = network(listing('20261005', ['18']), idx('2026100518'), swapped, erddap);
    const fieldCheck = client(net);
    const said: string[] = [];
    fieldCheck.c.onStatus((st) => said.push(st.message));
    expect((await fieldCheck.c.load('tmp2m')).source).toBe('pacioos');
    expect(said).toContain('the range held another field than TMP');

    // Another hour: asked for the 6-hour step at 00:30, served the 3-hour step's bytes.
    const f006: Rule = (url) => (url === `${AWS}/gfs.20261005/18/atmos/gfs.t18z.pgrb2.1p00.f006.idx` ? new Response(IDX) : undefined);
    const anyStep: Rule = (url, init) => (url.endsWith('.f006') && rangeOf(init) === 'bytes=34114825-34162665' ? new Response(TMP, { status: 206 }) : undefined);
    net = network(listing('20261005', ['18']), f006, anyStep);
    const stepCheck = client(net, { now: Date.parse('2026-10-06T00:30:00Z') });
    await expect(stepCheck.c.load('tmp2m')).rejects.toThrow(/another step than f006/);
  });

  it('makes one request at a time, however many fields are asked for at once', async () => {
    const { c } = client(net);
    await Promise.all([c.load('tmp2m'), c.load('prate'), c.load('tmp2m')]);
    expect(net.mostOpen()).toBe(1);
  });

  it('never fetches a field twice, and a reload within the hour costs no request at all', async () => {
    // From 19:30 to 22:30 the 18Z run's 3-hour step (21Z) is the nearest.
    const T_20 = Date.parse('2026-10-05T20:00:00Z');
    const cache = memoryGfsCache();
    const first = client(net, { cache, now: T_20 });
    await first.c.load('tmp2m');
    await first.c.load('tmp2m');
    expect(net.log).toHaveLength(3);

    const reload = client(net, { cache, now: T_20 + 50 * 60e3 });
    expect((await reload.c.load('tmp2m')).values[33780]).toBeCloseTo(308.70212, 4);
    expect(net.log).toHaveLength(3);

    // After the hour the listing is read again, to see whether a newer run is out.
    const later = client(net, { cache, now: T_20 + 61 * 60e3 });
    await later.c.load('tmp2m');
    expect(net.log.slice(3)).toEqual([`${AWS}/?list-type=2&prefix=gfs.20261005/&delimiter=/`]);
  });

  it('backs off on failure, from 30 s doubling, honouring Retry-After, then reads PacIOOS', async () => {
    net = network(listing('20261005', ['18']), idx('2026100518'), failing(503), erddap);
    const { c, slept } = client(net);
    const statuses: string[] = [];
    c.onStatus((s) => statuses.push(s.state));
    const t = await c.load('tmp2m');
    expect(slept).toEqual([30_000, 60_000]);
    expect(net.log.filter((u) => u.includes('bytes='))).toHaveLength(3);
    expect(t).toMatchObject({ source: 'pacioos', run: null });
    expect(t.valid.toISOString()).toBe('2026-10-05T21:00:00.000Z');
    expect(net.log.at(-1)).toBe('https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ncep_global.nc?tmp2m%5B(2026-10-05T21:00:00Z)%5D%5B(90):2:(-90)%5D%5B(0):2:(359.5)%5D');
    expect(statuses).toEqual(['loading', 'waiting', 'loading', 'waiting', 'loading', 'fallback', 'ready']);

    const patient = network(listing('20261005', ['18']), idx('2026100518'), failing(429, { 'Retry-After': '120' }), erddap);
    const second = client(patient, { random: 0 });
    await second.c.load('tmp2m');
    // Jitter can halve a wait, never below what the server asked for.
    expect(second.slept).toEqual([120_000, 120_000]);
  });

  it('says so and stops when both sources fail, and asks nobody again for 15 minutes', async () => {
    net = network(listing('20261005', ['18']), idx('2026100518'), failing(503));
    const { c, slept } = client(net);
    let last = '';
    c.onStatus((s) => { last = `${s.state}: ${s.message}`; });
    await expect(c.load('tmp2m')).rejects.toThrow(/NOAA.*PacIOOS/s);
    expect(last).toMatch(/^failed: /);
    expect(slept).toEqual([30_000, 60_000, 30_000, 60_000]);
    const asked = net.log.length;
    await expect(c.load('tmp2m')).rejects.toThrow(/again after/);
    expect(net.log).toHaveLength(asked);
  });
});

describe('which two steps a moment falls between', () => {
  const runs = ['2026-10-05T00:00Z', '2026-10-05T06:00Z', '2026-10-05T12:00Z', '2026-10-05T18:00Z'].map(Date.parse);
  const R18 = Date.parse('2026-10-05T18:00Z'), R12 = Date.parse('2026-10-05T12:00Z');

  it('takes the step before the moment and the one after it from one run, and how far between them it lies', () => {
    expect(stepsAround(Date.parse('2026-10-05T22:30Z'), runs).slice(0, 2)).toEqual([
      { run: R18, steps: [3, 6], weight: 0.5 },
      { run: R12, steps: [9, 12], weight: 0.5 },
    ]);
    // On a step's own hour, that step alone answers.
    expect(stepsAround(Date.parse('2026-10-05T21:00Z'), runs)[0]).toEqual({ run: R18, steps: [3, 3], weight: 0 });
  });

  it('passes over a run whose step before the moment is its analysis, and stops at the model\'s 16 days', () => {
    // At 19:30 the 18Z run's step before is its analysis (0), which has no mean rain.
    expect(stepsAround(Date.parse('2026-10-05T19:30Z'), runs)[0]).toEqual({ run: R12, steps: [6, 9], weight: 0.5 });
    // 383 hours into the 18Z run: between its last two steps; on its last hour, that step; past it, nothing.
    expect(stepsAround(R18 + 383 * 3600e3, [R18])).toEqual([{ run: R18, steps: [381, 384], weight: 2 / 3 }]);
    expect(stepsAround(R18 + 384 * 3600e3, [R18])).toEqual([{ run: R18, steps: [384, 384], weight: 0 }]);
    expect(stepsAround(R18 + 385 * 3600e3, [R18])).toEqual([]);
  });
});

describe('GfsClient.loadAround', () => {
  const T_22 = Date.parse('2026-10-05T22:00:00Z');
  let net: ReturnType<typeof network>;
  beforeEach(() => {
    net = network(listing('20261005', ['00', '06', '12', '18']), stepFile('2026100518', 'f003', IDX, F003), stepFile('2026100518', 'f006', IDX6, F006), erddap);
  });

  it('reads the steps before and after a moment from one run, and how far between them it lies', async () => {
    const { c } = client(net, { now: T_22 });
    const b = await c.loadAround('tmp2m', T_22);
    expect(b.before).toMatchObject({ step: 3, source: 'aws' });
    expect(b.before.valid.toISOString()).toBe('2026-10-05T21:00:00.000Z');
    expect(b.after).toMatchObject({ step: 6, source: 'aws' });
    expect(b.after.valid.toISOString()).toBe('2026-10-06T00:00:00.000Z');
    expect([b.before.run, b.after.run].map((d) => d?.toISOString())).toEqual(['2026-10-05T18:00:00.000Z', '2026-10-05T18:00:00.000Z']);
    expect(b.weight).toBe(1 / 3);
    expect(b.at.toISOString()).toBe('2026-10-05T22:00:00.000Z');
    // Both indexes before any field's bytes, so a run that has not published the later step costs no range.
    expect(net.log).toEqual([
      `${AWS}/?list-type=2&prefix=gfs.20261005/&delimiter=/`,
      `${AWS}/gfs.20261005/18/atmos/gfs.t18z.pgrb2.1p00.f003.idx`,
      `${AWS}/gfs.20261005/18/atmos/gfs.t18z.pgrb2.1p00.f006.idx`,
      `${AWS}/gfs.20261005/18/atmos/gfs.t18z.pgrb2.1p00.f003 bytes=34114825-34162665`,
      `${AWS}/gfs.20261005/18/atmos/gfs.t18z.pgrb2.1p00.f006 bytes=34361384-34408828`,
    ]);
  });

  it('asks for one step when the moment is that step\'s own hour', async () => {
    const { c } = client(net);
    const b = await c.loadAround('tmp2m', Date.parse('2026-10-05T21:00:00Z'));
    expect(b.weight).toBe(0);
    expect(b.after).toBe(b.before);
    expect(net.log.some((u) => u.includes('f006'))).toBe(false);
  });

  it('keeps each step\'s mean rain with the window it covers: GFS\'s means reset every 6 hours', async () => {
    const { c } = client(net);
    const b = await c.loadAround('prate', T_22);
    const span = (w?: { start: Date; end: Date }) => [w?.start.toISOString(), w?.end.toISOString()];
    expect(span(b.before.window)).toEqual(['2026-10-05T18:00:00.000Z', '2026-10-05T21:00:00.000Z']);
    expect(span(b.after.window)).toEqual(['2026-10-05T18:00:00.000Z', '2026-10-06T00:00:00.000Z']);
  });

  it('takes both steps from an older run when the newest has not published the later one', async () => {
    // The 12Z run's 9- and 12-hour steps hold for the same hours as the 18Z run's 3 and 6.
    net = network(listing('20261005', ['00', '06', '12', '18']), stepFile('2026100518', 'f003', IDX, F003),
      stepFile('2026100512', 'f009', IDX, F003), stepFile('2026100512', 'f012', IDX6, F006));
    const { c, slept } = client(net, { now: T_22 });
    const b = await c.loadAround('tmp2m', T_22);
    expect([b.before.run, b.after.run].map((d) => d?.toISOString())).toEqual(['2026-10-05T12:00:00.000Z', '2026-10-05T12:00:00.000Z']);
    expect([b.before.step, b.after.step]).toEqual([9, 12]);
    // The 18Z run's 3-hour step was never fetched, since its later step was missing; nothing waited.
    expect(net.log.filter((u) => u.includes('bytes='))).toEqual([
      `${AWS}/gfs.20261005/12/atmos/gfs.t12z.pgrb2.1p00.f009 bytes=34114825-34162665`,
      `${AWS}/gfs.20261005/12/atmos/gfs.t12z.pgrb2.1p00.f012 bytes=34361384-34408828`,
    ]);
    expect(slept).toEqual([]);
  });

  it('costs nothing for another moment between the same two steps', async () => {
    const { c } = client(net, { now: T_22 });
    await c.loadAround('tmp2m', T_22);
    const asked = net.log.length;
    const later = await c.loadAround('tmp2m', Date.parse('2026-10-05T22:30:00Z'));
    expect(later.weight).toBe(0.5);
    expect(net.log).toHaveLength(asked);
  });

  it('draws the nearest hour, unblended, when it must read PacIOOS, so the fallback is asked half as often', async () => {
    net = network(listing('20261005', ['00', '06', '12', '18']), erddap);
    const { c } = client(net);
    const b = await c.loadAround('tmp2m', T_21_40);
    expect(b.before.source).toBe('pacioos');
    expect(b.after).toBe(b.before);
    expect(b.weight).toBe(0);
    expect(b.before.valid.toISOString()).toBe('2026-10-05T21:00:00.000Z');
    expect(b.at.toISOString()).toBe('2026-10-05T21:40:00.000Z');
    expect(net.log.filter((u) => u.startsWith('https://pae-paha'))).toHaveLength(1);
  });

  it('reads a forecast hour days ahead as a step of today\'s runs', async () => {
    // The listing of the moment's own day, three days on, would name no run yet.
    net = network(listing('20261005', ['00', '06', '12', '18']), erddap);
    const { c } = client(net);
    await c.loadAround('tmp2m', Date.parse('2026-10-08T01:30:00Z')).catch(() => undefined);
    expect(net.log[0]).toBe(`${AWS}/?list-type=2&prefix=gfs.20261005/&delimiter=/`);
    expect(net.log.filter((u) => u.endsWith('.idx'))[0]).toBe(`${AWS}/gfs.20261005/18/atmos/gfs.t18z.pgrb2.1p00.f054.idx`);
  });

  it('makes one request at a time, with load, however many are asked for at once', async () => {
    const { c } = client(net, { now: T_22 });
    await Promise.all([c.loadAround('tmp2m', T_22), c.load('tmp2m', T_22), c.loadAround('prate', T_22)]);
    expect(net.mostOpen()).toBe(1);
  });
});
