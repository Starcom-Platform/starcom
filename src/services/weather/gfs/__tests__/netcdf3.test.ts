/**
 * The netCDF reader for the fallback: GFS from PacIOOS's ERDDAP, read only
 * when NOAA's bucket on AWS has failed (decision D-W, WX5).
 *
 * The fixture is the fallback's own request, made once on 2026-10-05, and the
 * expected values were read by SciPy, not by this code.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { readNetcdf3, erddapField } from '../netcdf3';

const DIR = 'src/services/weather/gfs/__fixtures__';
const EXPECTED = JSON.parse(readFileSync(`${DIR}/expected.erddap.json`, 'utf8'));
const FILE = new Uint8Array(gunzipSync(readFileSync(`${DIR}/erddap.ncep_global.tmp2m.2026-10-05T21Z.nc.gz`)));

describe('readNetcdf3', () => {
  it('reads the header as SciPy does', () => {
    const nc = readNetcdf3(FILE);
    expect(nc.variables.tmp2m.dims).toEqual(EXPECTED.dims);
    expect(nc.variables.tmp2m.shape).toEqual(EXPECTED.shape);
    expect(nc.variables.tmp2m.attributes).toMatchObject({
      _FillValue: EXPECTED.attributes._FillValue,
      units: 'K',
      standard_name: 'air_temperature',
    });
    expect(nc.variables.time.attributes.units).toBe(EXPECTED.time.units);
    expect(Object.keys(nc.attributes).length).toBe(62);
  });

  it('reads every value as SciPy does', () => {
    const nc = readNetcdf3(FILE);
    const lat = nc.read('latitude'), lon = nc.read('longitude'), t = nc.read('time');
    expect([lat[0], lat.at(-1), lat.length]).toEqual([EXPECTED.latitude.first, EXPECTED.latitude.last, EXPECTED.latitude.count]);
    expect([lon[0], lon.at(-1), lon.length]).toEqual([EXPECTED.longitude.first, EXPECTED.longitude.last, EXPECTED.longitude.count]);
    expect(t[0]).toBe(EXPECTED.time.value);
    const v = nc.read('tmp2m');
    let sum = 0;
    for (const x of v) sum += x;
    expect(Math.abs(sum - EXPECTED.sum) / EXPECTED.sum).toBeLessThan(1e-6);
    for (const s of EXPECTED.samples) expect(v[s.row * 360 + s.col], `${s.lat}, ${s.lon}`).toBeCloseTo(s.value, 4);
  });

  it('refuses what it does not read', () => {
    expect(() => readNetcdf3(FILE.slice(0, 2000))).toThrow(/ends at byte 2000/);
    const hdf5 = FILE.slice(); hdf5[0] = 0x89;
    expect(() => readNetcdf3(hdf5)).toThrow(/not a classic netCDF/i);
    const offset64 = FILE.slice(); offset64[3] = 2;
    expect(() => readNetcdf3(offset64)).toThrow(/version 2/);
    const records = FILE.slice(); records[7] = 1;
    expect(() => readNetcdf3(records)).toThrow(/record/i);
  });
});

describe('erddapField', () => {
  it('gives the fallback the same grid as NOAA’s own files, from the north at 1°', () => {
    const f = erddapField(readNetcdf3(FILE), 'tmp2m');
    expect(f.grid).toEqual({ ni: 360, nj: 181, la1: 90, lo1: 0, la2: -90, lo2: 359, di: 1, dj: 1 });
    expect(f.valid.toISOString()).toBe('2026-10-05T21:00:00.000Z');
    expect(f.values[93 * 360 + 300]).toBeCloseTo(EXPECTED.samples.find((s: { row: number }) => s.row === 93).value, 4);
  });

  it('turns a fill value into no value, never into a temperature', () => {
    const nc = readNetcdf3(FILE);
    const values = nc.read('tmp2m');
    values[5] = EXPECTED.attributes._FillValue;
    const f = erddapField({ ...nc, read: (name: string) => (name === 'tmp2m' ? values : nc.read(name)) }, 'tmp2m');
    expect(f.values[5]).toBeNaN();
    expect(f.values[6]).not.toBeNaN();
  });
});
