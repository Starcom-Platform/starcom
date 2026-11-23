/**
 * Rain on the ground (decision D-W, WX4 and WX8): one field from the GFS
 * model's mean rain everywhere and RainViewer's radar where radar reaches,
 * drawn in a weather report's scale. The model fixture is a real GFS message
 * (its values checked against ecCodes); the radar fixtures are real tiles.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import * as THREE from 'three';
import { decodeGrib2 } from '../../../../services/weather/gfs/grib2';
import { valueAt } from '../../../../services/weather/gfs/gfsGrid';
import { emptyMosaic, addRadarTile, addCoverageTile, radarAt } from '../../../../services/weather/rainviewer/radar';
import { RAIN_STOPS, rainRgb, rainRampData, composeRain, rainPart, rainAt, createRainShell, RAIN_FIELD_SIZE } from '../rainField';
import { setWeatherReader, weatherReadingAt } from '../weatherReadout';

const PRATE = decodeGrib2(new Uint8Array(readFileSync('src/services/weather/gfs/__fixtures__/gfs.t18z.pgrb2.1p00.f003.prate-avg.grib2')));
const MODEL = { field: 'prate' as const, source: 'aws' as const, run: PRATE.reference, step: 3, valid: PRATE.valid, window: PRATE.window, units: 'kg m-2 s-1', grid: PRATE.grid, values: PRATE.values };
// The same run's next step (its mean over 0-6 hours), to blend with (WX10).
const PRATE6 = decodeGrib2(new Uint8Array(readFileSync('src/services/weather/gfs/__fixtures__/gfs.t18z.pgrb2.1p00.f006.prate-avg.grib2')));
const MODEL6 = { ...MODEL, step: 6, valid: PRATE6.valid, window: PRATE6.window, values: PRATE6.values };
const tile = (f: string) => { const p = PNG.sync.read(readFileSync(`src/services/weather/__fixtures__/rainviewer/${f}`)); return { width: p.width, height: p.height, data: new Uint8Array(p.data) }; };
const RADAR_TIME = new Date('2026-10-06T05:40:00Z');
function radarFrame() {
  const m = emptyMosaic(2);
  addRadarTile(m, 1, 1, tile('radar-z2-1-1.png'));
  addCoverageTile(m, 1, 1, tile('coverage-z2-1-1.png'));
  return { time: RADAR_TIME, mosaic: m };
}
const bytes = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));

describe('the rain scale', () => {
  it('runs from a light shower to a downpour in a weather report\'s colours, with no cyan', () => {
    const mm = RAIN_STOPS.map((s) => s.mmPerHour);
    expect(mm).toEqual([...mm].sort((a, b) => a - b));
    expect(mm[0]).toBe(0.1);
    expect(mm.at(-1)).toBeGreaterThanOrEqual(100);
    for (const s of RAIN_STOPS) {
      const hsl = new THREE.Color(s.color).getHSL({ h: 0, s: 0, l: 0 });
      expect(Math.abs(hsl.h * 360 - 180) > 15 || hsl.s < 0.5, `${s.mmPerHour} mm/h is ${s.color}`).toBe(true);
    }
  });

  it('gives each stop its authored colour and blends between them on a log scale', () => {
    for (const s of RAIN_STOPS) expect(rainRgb(s.mmPerHour)).toEqual(bytes(s.color));
    // Halfway between two stops on a log scale is their geometric mean.
    const [a, b] = [RAIN_STOPS[2], RAIN_STOPS[3]];
    const mid = rainRgb(Math.sqrt(a.mmPerHour * b.mmPerHour));
    bytes(a.color).forEach((v, k) => expect(mid[k]).toBeCloseTo((v + bytes(b.color)[k]) / 2, -0.5));
  });

  it('becomes a 256-texel strip from 0.1 to 100 mm/h, the authored bytes at its ends', () => {
    const d = rainRampData();
    expect(d.length).toBe(1024);
    expect([d[0], d[1], d[2]]).toEqual(rainRgb(0.1));
    expect([d[1020], d[1021], d[1022]]).toEqual(rainRgb(100));
  });
});

describe('composeRain', () => {
  const field = composeRain(MODEL, radarFrame());
  const at = (lat: number, lng: number) => {
    const lng360 = ((lng % 360) + 360) % 360;
    const x = Math.floor((lng360 / 360) * RAIN_FIELD_SIZE.width), y = Math.floor(((90 - lat) / 180) * RAIN_FIELD_SIZE.height);
    const k = y * RAIN_FIELD_SIZE.width + x;
    return { rate: field.rate[k], source: field.source[k] };
  };

  it('lays the field out row by row from the north, from 0° east', () => {
    expect(field.rate.length).toBe(RAIN_FIELD_SIZE.width * RAIN_FIELD_SIZE.height);
  });

  it('takes the radar where radar reaches: its rate, rain or none', () => {
    const r = radarAt(radarFrame().mosaic, 40, -75)!;
    expect(r.covered).toBe(true);
    expect(at(40, -75)).toEqual({ rate: r.rate, source: 1 });
  });

  it('takes the model\'s mean rain, in mm/h, where radar does not reach', () => {
    const got = at(30, -40);
    expect(got.source).toBe(0);
    // The field's pixel centre, read from the model as the hover would.
    const lat = 90 - (Math.floor(((90 - 30) / 180) * RAIN_FIELD_SIZE.height) + 0.5) * (180 / RAIN_FIELD_SIZE.height);
    const lng = (Math.floor((320 / 360) * RAIN_FIELD_SIZE.width) + 0.5) * (360 / RAIN_FIELD_SIZE.width);
    expect(got.rate).toBeCloseTo(valueAt(MODEL, lat, lng)! * 3600, 4);
  });

  it('is the model alone when there is no radar', () => {
    const modelOnly = composeRain(MODEL, null);
    expect(modelOnly.source.every((s) => s === 0)).toBe(true);
  });
});

describe('rainPart: what the hover says', () => {
  const MODEL_SRC = 'NOAA GFS model, 1° grid, valid 5 Oct 21:00Z';
  it('names the rate, the kind and where it came from', () => {
    expect(rainPart(3.24, 1, RADAR_TIME, MODEL_SRC)).toEqual({ value: 'rain 3.2 mm/h (radar)', source: 'RainViewer radar, 6 Oct 05:40Z' });
    expect(rainPart(0.84, 2, RADAR_TIME, MODEL_SRC)).toEqual({ value: 'snow 0.8 mm/h as water (radar)', source: 'RainViewer radar, 6 Oct 05:40Z' });
    expect(rainPart(0.43, 0, RADAR_TIME, MODEL_SRC)).toEqual({ value: 'rain 0.4 mm/h (model)', source: MODEL_SRC });
    expect(rainPart(0.02, 0, RADAR_TIME, MODEL_SRC)).toEqual({ value: 'no rain', source: MODEL_SRC });
    expect(rainPart(0, 1, RADAR_TIME, MODEL_SRC)).toEqual({ value: 'no rain', source: 'RainViewer radar, 6 Oct 05:40Z' });
  });
});

describe('rainAt: the rain at a place for a moment', () => {
  const first = composeRain(MODEL, radarFrame()), second = composeRain(MODEL6, radarFrame());

  it('blends the two steps\' rates by the weight where the model decides', () => {
    const a = rainAt({ first, second }, 0, 30, -40), b = rainAt({ first, second }, 1, 30, -40);
    expect(a.source).toBe(0);
    expect(a.rate).not.toBe(b.rate);
    expect(rainAt({ first, second }, 0.25, 30, -40).rate).toBeCloseTo(a.rate + (b.rate - a.rate) * 0.25, 6);
  });

  it('reads the radar where radar decides, whatever the weight: both steps hold its rate there', () => {
    const r = radarAt(radarFrame().mosaic, 40, -75)!;
    expect(rainAt({ first, second }, 0.6, 40, -75)).toEqual({ rate: r.rate, source: 1 });
  });
});

describe('the rain shell', () => {
  afterEach(() => setWeatherReader('rain', null));

  it('sits on the ground band and reads out through the weather readout, withdrawn while hidden', () => {
    const field = composeRain(MODEL, null);
    const shell = createRainShell({ first: field, second: field, weight: 0 }, () => ({ value: 'rain 1.0 mm/h (model)', source: 'NOAA GFS model' }));
    expect((shell.mesh.geometry as THREE.SphereGeometry).parameters.radius).toBeCloseTo(100.1, 6);
    expect(weatherReadingAt(10, 20)).toBe('rain 1.0 mm/h (model) · NOAA GFS model');
    shell.setShown(false);
    expect(weatherReadingAt(10, 20)).toBeNull();
    shell.dispose();
  });

  it('draws the two steps\' fields blended by a weight, which moves without new textures', () => {
    const first = composeRain(MODEL, null), second = composeRain(MODEL6, null);
    const shell = createRainShell({ first, second, weight: 0.25 }, () => null);
    const uniforms = (shell.mesh.material as THREE.ShaderMaterial).uniforms;
    expect(uniforms.weight.value).toBe(0.25);
    const textures = [uniforms.field.value, uniforms.fieldNext.value];
    expect(textures[0]).not.toBe(textures[1]);
    shell.setWeight(0.75);
    expect(uniforms.weight.value).toBe(0.75);
    expect([uniforms.field.value, uniforms.fieldNext.value]).toEqual(textures);
    shell.setFields(second, first);
    expect(uniforms.field.value).not.toBe(textures[0]);
    expect(uniforms.fieldNext.value).not.toBe(textures[1]);
    shell.dispose();
  });
});
