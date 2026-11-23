/**
 * T96's drivers from what NOAA serves (space-weather-visualization.md, SW4): the solar wind's
 * dynamic pressure and the IMF's By and Bz from the propagated 1-hour wind, Dst estimated from the
 * real-time wind (dstEstimate.ts), each held within the range T96 was fitted to, and saying which were.
 */
import { describe, expect, it, vi } from 'vitest';
import { driversFrom, fetchT96Drivers, parsePropagatedWind, T96_RANGE } from '../t96Drivers';

const WIND = [
  ['time_tag', 'speed', 'density', 'temperature', 'bx', 'by', 'bz', 'bt', 'vx', 'vy', 'vz', 'propagated_time_tag'],
  ['2026-10-10T17:59:00Z', 820, 16, 670000, -20, -15, -7, 27, -820, 90, 12, '2026-10-10T18:26:00Z'],
  ['2026-10-10T18:01:00Z', 828.6, 16.72, 679704.0, -20.76, -16.01, -7.22, 27.27, -823.3, 92.6, 12.8, '2026-10-10T18:28:50Z'],
  ['2026-10-10T18:00:00Z', 825, null, 670000, -20, -15, -7, 27, -820, 90, 12, '2026-10-10T18:27:00Z'],
];

describe('reading the drivers', () => {
  it('takes the newest complete minute of the wind, by its column names, with the moment it reaches Earth', () => {
    expect(parsePropagatedWind(WIND)).toEqual({ observed: '2026-10-10T18:01:00Z', arrives: '2026-10-10T18:28:50Z', speed: 828.6, density: 16.72, bx: -20.76, by: -16.01, bz: -7.22 });
    expect(parsePropagatedWind([WIND[0]])).toBeNull();
  });

});

describe('the drivers T96 is given', () => {
  it('are the pressure from density and speed, as Tsyganenko reckons it with the wind\'s helium, and the IMF and Dst as measured', () => {
    const d = driversFrom({ observed: 'w', arrives: 'a', speed: 400, density: 5, bx: -1, by: 2, bz: -3 }, { at: 'h', dst: -20, hours: 24 });
    expect(d.drivers.pdyn).toBeCloseTo(1.94e-6 * 5 * 400 ** 2, 12);
    expect(d.drivers).toMatchObject({ dst: -20, byImf: 2, bzImf: -3 });
    expect(d.held).toEqual([]);
  });

  it('are held within T96\'s range, and say which were and what they measured', () => {
    const d = driversFrom({ observed: 'w', arrives: 'a', speed: 828.6, density: 16.72, bx: -20.76, by: -16.01, bz: -7.22 }, { at: 'h', dst: 29, hours: 24 });
    expect(d.drivers).toEqual({ pdyn: T96_RANGE.pdyn[1], dst: T96_RANGE.dst[1], byImf: T96_RANGE.imf[0], bzImf: -7.22 });
    expect(d.held.map((h) => h.driver)).toEqual(['pressure', 'Dst', 'By']);
    expect(d.held[0].measured).toBeCloseTo(1.94e-6 * 16.72 * 828.6 ** 2, 9);
    expect(T96_RANGE).toEqual({ pdyn: [0.5, 10], dst: [-100, 20], imf: [-10, 10] });
  });

  it('are quiet values, said so, where a feed cannot be read', async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.includes('propagated')
      ? { ok: true, json: async () => WIND }
      : { ok: false, status: 503 })) as unknown as typeof fetch;
    const got = await fetchT96Drivers(fetchImpl);
    expect(got.drivers).toMatchObject({ dst: 0, bzImf: -7.22 });
    expect(got.missing).toEqual(['Dst, estimated from the real-time wind (NOAA answered 503)']);
    expect(fetchImpl).not.toHaveBeenCalledWith(expect.stringContaining('kyoto'));
  });
});
