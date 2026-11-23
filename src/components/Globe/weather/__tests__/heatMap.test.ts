/**
 * The temperature heat map's parts that can be checked without a GPU
 * (decision D-W, WX1): the colour ramp, the texture the shader samples, and
 * the reading a hover gives. Where the shader puts each value on the planet
 * is checked by rendering the globe (npm run smoke), since a test of GLSL in
 * JavaScript would only test a copy of it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { decodeGrib2 } from '../../../../services/weather/gfs/grib2';
import { valueAt } from '../../../../services/weather/gfs/gfsGrid';
import { latLngToGlobeWorld } from '../../../../utils/globeCoordinates';
import { weatherReadingAt } from '../weatherReadout';
import { TEMPERATURE_STOPS, rampTextureData, fieldTexture, createHeatMapShell, temperaturePart, gfsSourceLine, temperatureColor, temperatureRgb } from '../heatMap';
import type { GfsBlend } from '../../../../services/weather/gfs/gfsClient';

const TMP = decodeGrib2(new Uint8Array(readFileSync('src/services/weather/gfs/__fixtures__/gfs.t18z.pgrb2.1p00.f003.tmp2m.grib2')));
const FIELD = { field: 'tmp2m' as const, source: 'aws' as const, run: TMP.reference, step: 3, valid: TMP.valid, units: 'K', grid: TMP.grid, values: TMP.values };
// The same run's next step, 00Z: a moment between the two is drawn as a blend of both (WX10).
const TMP6 = decodeGrib2(new Uint8Array(readFileSync('src/services/weather/gfs/__fixtures__/gfs.t18z.pgrb2.1p00.f006.tmp2m.grib2')));
const FIELD6 = { ...FIELD, step: 6, valid: TMP6.valid, values: TMP6.values };
const T_22 = Date.parse('2026-10-05T22:00:00Z');
const ONE: GfsBlend = { at: TMP.valid, before: FIELD, after: FIELD, weight: 0 };
const BLEND: GfsBlend = { at: new Date(T_22), before: FIELD, after: FIELD6, weight: 1 / 3 };
const blended = (lat: number, lng: number, w: number) => valueAt(FIELD, lat, lng)! + (valueAt(FIELD6, lat, lng)! - valueAt(FIELD, lat, lng)!) * w;

describe('the temperature ramp', () => {
  it('runs from cold to hot in the colours a weather report uses, with freezing pale', () => {
    const c = TEMPERATURE_STOPS.map((s) => s.celsius);
    expect(c).toEqual([...c].sort((a, b) => a - b));
    expect(c[0]).toBeLessThanOrEqual(-40);
    expect(c.at(-1)).toBeGreaterThanOrEqual(45);
    const freezing = new THREE.Color(TEMPERATURE_STOPS.find((s) => s.celsius === 0)!.color);
    expect(freezing.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(0.75);
    // Cyan is the app's own colour (ours, selected), never a reading's.
    for (const s of TEMPERATURE_STOPS) {
      const hsl = new THREE.Color(s.color).getHSL({ h: 0, s: 0, l: 0 });
      expect(Math.abs(hsl.h * 360 - 180) > 15 || hsl.s < 0.5, `${s.celsius} °C is ${s.color}`).toBe(true);
    }
  });

  it('becomes a 256-texel strip of the colours as authored, the bytes the screen shows', () => {
    // Read straight off the hex, never through THREE.Color, which turns hex into linear
    // light: a strip built that way drew every colour darker, and a test built the same
    // way agreed with it (the rendered globe found it).
    const bytes = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
    const data = rampTextureData();
    expect(data.length).toBe(256 * 4);
    const texel = (i: number) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
    expect([...texel(0), data[3]]).toEqual([...bytes('#2B0B4F'), 255]);
    expect(texel(255)).toEqual(bytes('#55092D'));
    // 2.55 texels a degree: texels 51, 102, 153 and 204 fall exactly on -30, -10, 10 and 30 °C.
    expect(texel(51)).toEqual(bytes('#3D3FBD'));
    expect(texel(102)).toEqual(bytes('#5B9BE0'));
    expect(texel(153)).toEqual(bytes('#63BD67'));
    expect(texel(204)).toEqual(bytes('#E8612B'));
    // The key's colour reads back as the same bytes.
    expect(temperatureColor(20).getHexString()).toBe('f1d33d');
    expect(temperatureRgb(22.5)).toEqual([243, 188, 49]);
  });
});

describe('the field texture', () => {
  it('holds every value in degrees Celsius, row by row from the north, wrapping east–west', () => {
    const tex = fieldTexture(FIELD);
    expect([tex.image.width, tex.image.height]).toEqual([360, 181]);
    expect(tex.type).toBe(THREE.HalfFloatType);
    expect(tex.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
    const data = tex.image.data as Uint16Array;
    // Manaus's cell, (−3°, 300°): 308.70 K.
    expect(THREE.DataUtils.fromHalfFloat(data[93 * 360 + 300])).toBeCloseTo(35.55, 1);
    expect(THREE.DataUtils.fromHalfFloat(data[0])).toBeCloseTo(TMP.values[0] - 273.15, 1);
  });
});

describe('the heat map shell', () => {
  it('sits on the ground, below the country fills and the clouds', () => {
    const shell = createHeatMapShell(ONE, { unit: 'celsius', at: TMP.valid.getTime() });
    const r = (shell.mesh.geometry as THREE.SphereGeometry).parameters.radius;
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(100.2);
    expect((shell.mesh.material as THREE.ShaderMaterial).depthWrite).toBe(false);
    shell.dispose();
  });

  it('reads, under the pointer, the value the grid holds there, with the hour it holds for', () => {
    const shell = createHeatMapShell(ONE, { unit: 'celsius', at: TMP.valid.getTime() });
    const manaus = latLngToGlobeWorld(-3, -60, 100.1);
    const text = shell.readAt(manaus)!;
    expect(text).toMatch(/^35\.6 °C/);
    expect(text).toContain('valid 5 Oct 21:00Z');
    const between = latLngToGlobeWorld(48.3, 2.6, 100.1);
    expect(shell.readAt(between)).toMatch(new RegExp(`^${(valueAt(FIELD, 48.3, 2.6)! - 273.15).toFixed(1)} °C`));
    shell.dispose();
  });

  it('blends the two steps around the moment by how far between them it lies, and reads the same blend', () => {
    const shell = createHeatMapShell(BLEND, { unit: 'celsius', at: T_22 });
    const uniforms = (shell.mesh.material as THREE.ShaderMaterial).uniforms;
    expect(uniforms.weight.value).toBe(1 / 3);
    expect(uniforms.field.value).not.toBe(uniforms.fieldNext.value);
    const paris = latLngToGlobeWorld(48.9, 2.3, 100.1);
    expect(shell.readAt(paris)).toMatch(new RegExp(`^${(blended(48.9, 2.3, 1 / 3) - 273.15).toFixed(1)} °C`));
    expect(shell.readAt(paris)).toContain('5 Oct 22:00Z, blended from 21:00Z and 00:00Z');
    // The moment moves on between the same steps: only the weight changes.
    shell.setMoment(Date.parse('2026-10-05T22:30:00Z'));
    expect(uniforms.weight.value).toBe(0.5);
    expect(shell.readAt(paris)).toMatch(new RegExp(`^${(blended(48.9, 2.3, 0.5) - 273.15).toFixed(1)} °C`));
    expect(shell.readAt(paris)).toContain('5 Oct 22:30Z, blended from 21:00Z and 00:00Z');
    shell.dispose();
  });

  it('takes new steps in place, each texture holding its own step, the weight set for the moment', () => {
    const shell = createHeatMapShell(ONE, { unit: 'celsius', at: TMP.valid.getTime() });
    const uniforms = (shell.mesh.material as THREE.ShaderMaterial).uniforms;
    expect(uniforms.weight.value).toBe(0);
    shell.setBlend(BLEND, Date.parse('2026-10-05T22:30:00Z'));
    expect(uniforms.weight.value).toBe(0.5);
    // Manaus's cell in each texture: the 3-hour step's temperature, then the 6-hour step's.
    const cell = (tex: THREE.DataTexture) => THREE.DataUtils.fromHalfFloat((tex.image.data as Uint16Array)[93 * 360 + 300]);
    expect(cell(uniforms.field.value)).toBeCloseTo(FIELD.values[93 * 360 + 300] - 273.15, 1);
    expect(cell(uniforms.fieldNext.value)).toBeCloseTo(FIELD6.values[93 * 360 + 300] - 273.15, 1);
    expect(FIELD6.values[93 * 360 + 300]).not.toBeCloseTo(FIELD.values[93 * 360 + 300], 1);
    shell.dispose();
  });

  it('meets a ray where it crosses the shell, the near side first, without testing triangles', () => {
    const shell = createHeatMapShell(ONE, { unit: 'fahrenheit', at: TMP.valid.getTime() });
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 400), new THREE.Vector3(0, 0, -1));
    const hits: THREE.Intersection[] = [];
    shell.mesh.raycast(ray, hits);
    expect(hits).toHaveLength(1);
    expect(hits[0].point.z).toBeGreaterThan(99);
    // (0°, 0°) faces +z in the scene: the Gulf of Guinea.
    expect(shell.readAt(hits[0].point)).toMatch(/^\d+\.\d °F/);
    const miss: THREE.Intersection[] = [];
    shell.mesh.raycast(new THREE.Raycaster(new THREE.Vector3(0, 200, 400), new THREE.Vector3(0, 0, -1)), miss);
    expect(miss).toHaveLength(0);
    shell.dispose();
  });

  it('stops reading out its temperature while hidden, so another layer\'s hover does not quote it', () => {
    const shell = createHeatMapShell(ONE, { unit: 'celsius', at: TMP.valid.getTime() });
    expect(weatherReadingAt(-3, -60)).toMatch(/^35\.6 °C/);
    shell.setShown(false);
    expect(weatherReadingAt(-3, -60)).toBeNull();
    shell.setShown(true);
    expect(weatherReadingAt(-3, -60)).toMatch(/^35\.6 °C/);
    shell.dispose();
    expect(weatherReadingAt(-3, -60)).toBeNull();
  });

  it('says what it is in the tooltip: a model’s value, not a station’s, and for which hour', () => {
    const one = gfsSourceLine(ONE, TMP.valid.getTime());
    expect(temperaturePart(300, one, 'celsius')).toEqual({ value: '26.9 °C', source: 'NOAA GFS model, 1° grid, valid 5 Oct 21:00Z' });
    expect(gfsSourceLine({ before: { ...FIELD, source: 'pacioos' }, after: { ...FIELD, source: 'pacioos' } }, T_22)).toBe('NOAA GFS model via PacIOOS, 1° grid, valid 5 Oct 21:00Z');
    expect(temperaturePart(300, one, 'kelvin').value).toBe('300.0 K');
    // 26.85 °C is 80.33 °F.
    expect(temperaturePart(300, one, 'fahrenheit').value).toBe('80.3 °F');
    expect(gfsSourceLine(BLEND, T_22)).toBe('NOAA GFS model, 1° grid, 5 Oct 22:00Z, blended from 21:00Z and 00:00Z');
  });
});
