/**
 * The GRIB2 reader for NOAA GFS on AWS (decision D-W, WX5).
 *
 * The fixtures are real messages from NOAA's bucket, and every expected value
 * was computed by ECMWF's ecCodes, the reference decoder, never by this code:
 * a test that compared the reader with itself would share its blind spots.
 * Temperature exercises two-octet extra descriptors and product template 4.0;
 * the 0–3 hour mean rain rate exercises three-octet descriptors and 4.8.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeGrib2, parseIdx, findField } from '../grib2';

const DIR = 'src/services/weather/gfs/__fixtures__';
const EXPECTED = JSON.parse(readFileSync(`${DIR}/expected.ecCodes.json`, 'utf8'));
const bytes = (name: string) => new Uint8Array(readFileSync(`${DIR}/gfs.t18z.pgrb2.1p00.f003.${name}.grib2`));
const IDX = readFileSync(`${DIR}/gfs.t18z.pgrb2.1p00.f003.idx`, 'utf8');

type Sample = { index: number; lat: number; lon: number; value: number };

function agreesWithEcCodes(name: 'tmp2m' | 'prate-avg', tolerance: number) {
  const want = EXPECTED[name];
  const field = decodeGrib2(bytes(name));
  expect(field.values.length).toBe(want.count);
  expect(field.grid).toMatchObject({
    ni: want.Ni, nj: want.Nj,
    la1: want.latitudeOfFirstGridPointInDegrees, lo1: want.longitudeOfFirstGridPointInDegrees,
    la2: want.latitudeOfLastGridPointInDegrees, lo2: want.longitudeOfLastGridPointInDegrees,
    di: want.iDirectionIncrementInDegrees, dj: want.jDirectionIncrementInDegrees,
  });
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of field.values) { min = Math.min(min, v); max = Math.max(max, v); sum += v; }
  expect(Math.abs(min - want.min)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(max - want.max)).toBeLessThanOrEqual(tolerance);
  // float32 storage: the sum of 65,160 values agrees to a few parts in ten million.
  expect(Math.abs(sum - want.sum) / Math.max(Math.abs(want.sum), 1e-9)).toBeLessThan(1e-6);
  for (const s of want.samples as Sample[]) {
    expect(Math.abs(field.values[s.index] - s.value), `index ${s.index} (${s.lat}, ${s.lon})`).toBeLessThanOrEqual(tolerance);
  }
  return field;
}

describe('decodeGrib2', () => {
  it('reads the 2 m temperature exactly as ecCodes does', () => {
    const f = agreesWithEcCodes('tmp2m', 1e-4);
    expect(f.reference.toISOString()).toBe('2026-10-05T18:00:00.000Z');
    expect(f.valid.toISOString()).toBe('2026-10-05T21:00:00.000Z');
    expect(f.window).toBeUndefined();
    expect(f.parameter).toEqual({ discipline: 0, category: 0, number: 0 });
  });

  it('reads the 0–3 hour mean rain rate, with the window it is a mean over', () => {
    const f = agreesWithEcCodes('prate-avg', 1e-9);
    expect(f.reference.toISOString()).toBe('2026-10-05T18:00:00.000Z');
    expect(f.valid.toISOString()).toBe('2026-10-05T21:00:00.000Z');
    expect(f.window?.start.toISOString()).toBe('2026-10-05T18:00:00.000Z');
    expect(f.window?.end.toISOString()).toBe('2026-10-05T21:00:00.000Z');
    expect(f.parameter).toEqual({ discipline: 0, category: 1, number: 7 });
  });

  it('gives one value to every point of a pole, as the pole is one point', () => {
    const f = decodeGrib2(bytes('tmp2m'));
    const north = f.values.slice(0, f.grid.ni), south = f.values.slice(f.values.length - f.grid.ni);
    expect(new Set(north).size).toBe(1);
    expect(new Set(south).size).toBe(1);
  });

  it('reads a negative scale as negative: GRIB2 writes a sign bit and a magnitude', () => {
    // Neither fixture has one (ecCodes: binary scale 0 and 1), so one is written in:
    // a binary scale of -1 halves what each value adds to the reference.
    const good = bytes('tmp2m');
    const v = decodeGrib2(good).values;
    const s5 = sectionOffsets(good)[5];
    const dv = new DataView(good.buffer, good.byteOffset);
    const R = dv.getFloat32(s5 + 11), E = dv.getUint16(s5 + 15), D = dv.getUint16(s5 + 17);
    expect([E, D]).toEqual([0, 1]);
    const halved = good.slice();
    new DataView(halved.buffer).setUint16(s5 + 15, 0x8001);
    const w = decodeGrib2(halved).values;
    for (const i of [0, 16200, 33780, 65159]) expect(w[i]).toBeCloseTo((R + (v[i] * 10 ** D - R) / 2) / 10 ** D, 3);
  });

  it('refuses a message whose groups do not add up to its points', () => {
    const good = bytes('tmp2m');
    const s5 = sectionOffsets(good)[5];
    const short = good.slice();
    const dv = new DataView(short.buffer);
    dv.setUint32(s5 + 42, dv.getUint32(s5 + 42) - 1);
    expect(() => decodeGrib2(short)).toThrow(/groups hold 65159 values/);
  });

  it('refuses what it cannot read, rather than return wrong numbers', () => {
    const good = bytes('tmp2m');
    expect(() => decodeGrib2(good.slice(0, 1000))).toThrow(/only 1000 arrived/);
    const notGrib = good.slice(); notGrib[0] = 0x58;
    expect(() => decodeGrib2(notGrib)).toThrow(/not a GRIB2 message/i);

    const sections = sectionOffsets(good);
    const bitmap = good.slice(); bitmap[sections[6] + 5] = 0;
    expect(() => decodeGrib2(bitmap)).toThrow(/bitmap/i);
    const jpeg = good.slice(); new DataView(jpeg.buffer).setUint16(sections[5] + 9, 40);
    expect(() => decodeGrib2(jpeg)).toThrow(/5\.40/);
    const missing = good.slice(); missing[sections[5] + 22] = 1;
    expect(() => decodeGrib2(missing)).toThrow(/missing/i);
    const firstOrder = good.slice(); firstOrder[sections[5] + 47] = 1;
    expect(() => decodeGrib2(firstOrder)).toThrow(/order 1/);
    const gaussian = good.slice(); new DataView(gaussian.buffer).setUint16(sections[3] + 12, 40);
    expect(() => decodeGrib2(gaussian)).toThrow(/3\.40/);
    const southFirst = good.slice(); southFirst[sections[3] + 71] = 0x40;
    expect(() => decodeGrib2(southFirst)).toThrow(/scan/i);
  });
});

describe('the index beside each GFS file', () => {
  const records = parseIdx(IDX);

  it('lists every message with the byte range it occupies', () => {
    expect(records).toHaveLength(743);
    const tmp = findField(records, 'TMP', '2 m above ground');
    expect(tmp).toMatchObject({ start: 34114825, end: 34114825 + EXPECTED.tmp2m.bytes - 1, forecast: '3 hour fcst' });
    // The last message runs to the end of the file: its range is open.
    expect(records.at(-1)).toMatchObject({ name: 'VWSH', start: 43991639, end: null });
  });

  it('tells a moment from a mean when a field has both', () => {
    expect(findField(records, 'PRATE', 'surface')?.forecast).toBe('3 hour fcst');
    const mean = findField(records, 'PRATE', 'surface', /ave/);
    expect(mean).toMatchObject({ start: 34907910, forecast: '0-3 hour ave fcst' });
    expect(mean!.end! - mean!.start + 1).toBe(EXPECTED['prate-avg'].bytes);
    expect(findField(records, 'TMP', '1 m above ground')).toBeUndefined();
  });
});

function sectionOffsets(b: Uint8Array): Record<number, number> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Record<number, number> = {};
  for (let o = 16; o < b.length - 4;) { out[b[o + 4]] = o; o += dv.getUint32(o); }
  return out;
}
