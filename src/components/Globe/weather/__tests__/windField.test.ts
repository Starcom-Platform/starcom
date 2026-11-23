/**
 * Wind from GFS's two components (decision D-W, WX3): what a hover says, and
 * the texture the particles move by. Directions are meteorological: where the
 * wind comes FROM, as a forecast says it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { windAt, windAtBlend, compassPoint, windReading, windTexture } from '../windField';
import { setWeatherReader, weatherReadingAt } from '../weatherReadout';
import type { LatLonGrid } from '../../../../services/weather/gfs/grib2';

const GRID: LatLonGrid = { ni: 360, nj: 181, la1: 90, lo1: 0, la2: -90, lo2: 359, di: 1, dj: 1 };
const uniform = (value: number) => ({ grid: GRID, values: new Float32Array(360 * 181).fill(value) });

describe('windAt', () => {
  it('gives speed and the direction the wind comes from', () => {
    // u east, v north. A wind blowing toward the east comes from the west.
    expect(windAt(uniform(10), uniform(0), 10, 20)).toEqual({ speedMs: 10, fromDeg: 270 });
    // Blowing toward the north: from the south.
    expect(windAt(uniform(0), uniform(5), 10, 20)).toEqual({ speedMs: 5, fromDeg: 180 });
    // Toward the south-west: from the north-east.
    const ne = windAt(uniform(-3), uniform(-3), 10, 20)!;
    expect(ne.speedMs).toBeCloseTo(Math.hypot(3, 3), 6);
    expect(ne.fromDeg).toBeCloseTo(45, 6);
    expect(windAt(uniform(0), uniform(0), 10, 20)).toEqual({ speedMs: 0, fromDeg: 0 });
  });
});

describe('windAtBlend', () => {
  /** One component at one step: a value everywhere, valid at an hour of 5 October. */
  const step = (value: number, hour: number) => ({ ...uniform(value), valid: new Date(Date.UTC(2026, 9, 5, hour)), source: 'aws' as const });
  const blend = <T,>(before: T, after: T) => ({ before, after });

  it('blends each component between the two steps, as the particles do, then reads speed and direction', () => {
    // From a 10 m/s westerly at 21Z to a 10 m/s southerly at 00Z: half way, both components are 5.
    const u = blend(step(10, 21), step(0, 24)), v = blend(step(0, 21), step(10, 24));
    expect(windAtBlend(u, v, 0, 10, 20)).toEqual({ speedMs: 10, fromDeg: 270 });
    expect(windAtBlend(u, v, 1, 10, 20)).toEqual({ speedMs: 10, fromDeg: 180 });
    const half = windAtBlend(u, v, 0.5, 10, 20)!;
    expect(half.speedMs).toBeCloseTo(Math.hypot(5, 5), 6);
    // Blowing toward the north-east: from the south-west.
    expect(half.fromDeg).toBe(225);
  });

  it('says nothing where a step has no value', () => {
    const u = blend(step(10, 21), step(Number.NaN, 24)), v = blend(step(0, 21), step(0, 24));
    expect(windAtBlend(u, v, 0.5, 10, 20)).toBeNull();
  });
});

describe('compassPoint and windReading', () => {
  it('names the sixteen points as a forecast does', () => {
    expect([0, 22.5, 45, 90, 180, 247.5, 270, 337.5, 359].map(compassPoint)).toEqual(['N', 'NNE', 'NE', 'E', 'S', 'WSW', 'W', 'NNW', 'N']);
  });

  it('reads speed in the chosen unit, from where it comes, and calls still air calm', () => {
    expect(windReading({ speedMs: 10, fromDeg: 270 }, 'kmh')).toBe('wind 36.0 km/h from the W');
    expect(windReading({ speedMs: 10, fromDeg: 247 }, 'knots')).toBe('wind 19.4 kn from the WSW');
    expect(windReading({ speedMs: 0.2, fromDeg: 90 }, 'ms')).toBe('wind calm');
  });
});

describe('windTexture', () => {
  it('holds east and north components as half floats, row by row from the north, wrapping east–west', () => {
    const u = uniform(0), v = uniform(0);
    u.values[93 * 360 + 300] = 7.5;
    v.values[93 * 360 + 300] = -2.25;
    const tex = windTexture(u, v);
    expect([tex.image.width, tex.image.height]).toEqual([360, 181]);
    expect(tex.format).toBe(THREE.RGFormat);
    expect(tex.type).toBe(THREE.HalfFloatType);
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    const data = tex.image.data as Uint16Array;
    const at = (93 * 360 + 300) * 2;
    expect(THREE.DataUtils.fromHalfFloat(data[at])).toBe(7.5);
    expect(THREE.DataUtils.fromHalfFloat(data[at + 1])).toBe(-2.25);
  });
});

describe('the weather readout', () => {
  afterEach(() => { setWeatherReader('temperature', null); setWeatherReader('wind', null); });

  it('joins what each field on show reads at a place, temperature first, naming a shared source once', () => {
    setWeatherReader('wind', () => ({ value: 'wind 36.0 km/h from the W', source: 'NOAA GFS model, 1° grid, valid 2026-10-06 00:00Z' }));
    setWeatherReader('temperature', () => ({ value: '21.0 °C', source: 'NOAA GFS model, 1° grid, valid 2026-10-06 00:00Z' }));
    expect(weatherReadingAt(10, 20)).toBe('21.0 °C · wind 36.0 km/h from the W · NOAA GFS model, 1° grid, valid 2026-10-06 00:00Z');
  });

  it('names each source when they differ, and says nothing when no field is on', () => {
    expect(weatherReadingAt(10, 20)).toBeNull();
    setWeatherReader('temperature', () => ({ value: '21.0 °C', source: 'NOAA GFS model via PacIOOS, 1° grid, valid 2026-10-06 00:00Z' }));
    setWeatherReader('wind', () => ({ value: 'wind calm', source: 'NOAA GFS model, 1° grid, valid 2026-10-06 03:00Z' }));
    expect(weatherReadingAt(10, 20)).toBe('21.0 °C · wind calm · NOAA GFS model via PacIOOS, 1° grid, valid 2026-10-06 00:00Z; NOAA GFS model, 1° grid, valid 2026-10-06 03:00Z');
  });
});
