/**
 * Real clouds from the infrared mosaic (decision D-W, WX2): what decides
 * cloud from clear sky, and what the hover says. The calibration is the one
 * measured on 2026-10-06 against GFS 2 m temperature: in the Geostationary
 * Ring's greys, clear sky lies on grey ≈ 102 − 1.39 × T(°C).
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { clearSkyGrey, cloudOpacity, cloudTopCelsius, cloudPart, modelCloudPart, createCloudShell, scalarTexture } from '../cloudShell';
import { setWeatherReader, weatherReadingAt } from '../weatherReadout';
import type { LatLonGrid } from '../../../../services/weather/gfs/grib2';

const GRID: LatLonGrid = { ni: 360, nj: 181, la1: 90, lo1: 0, la2: -90, lo2: 359, di: 1, dj: 1 };
const SLOT = new Date('2026-10-06T00:00:00Z');

describe('cloud from the infrared greys', () => {
  it('finds clear sky where the grey is the ground\'s own, by the measured line', () => {
    expect(clearSkyGrey(0)).toBeCloseTo(102, 6);
    expect(clearSkyGrey(20)).toBeCloseTo(74.2, 6);
    expect(cloudOpacity(clearSkyGrey(20), 20)).toBe(0);
    expect(cloudOpacity(clearSkyGrey(20) + 8, 20)).toBe(0);
  });

  it('thickens as the tops read colder than the ground, opaque well above it', () => {
    const c = 25;
    expect(cloudOpacity(clearSkyGrey(c) + 20, c)).toBeGreaterThan(0.2);
    expect(cloudOpacity(clearSkyGrey(c) + 20, c)).toBeLessThan(0.6);
    expect(cloudOpacity(clearSkyGrey(c) + 45, c)).toBe(1);
    expect(cloudOpacity(250, c)).toBe(1);
  });

  it('reads a cloud top\'s temperature from its grey', () => {
    expect(cloudTopCelsius(102)).toBeCloseTo(0, 6);
    expect(cloudTopCelsius(199.3)).toBeCloseTo(-70, 1);
  });
});

describe('cloudPart: what the hover says', () => {
  it('names the tops of a cloud the satellites see, and clear sky where they see none', () => {
    expect(cloudPart({ grey: 199.3, covered: true }, 25, SLOT)).toEqual({
      value: 'cloud tops -70 °C', source: 'EUMETSAT Geostationary Ring, 6 Oct 00:00Z',
    });
    expect(cloudPart({ grey: clearSkyGrey(25) + 2, covered: true }, 25, SLOT)?.value).toBe('no cloud seen');
  });

  it('says nothing beyond the satellites\' reach, where the poles\' cloud is the model\'s', () => {
    expect(cloudPart({ grey: 0, covered: false }, 25, SLOT)).toBeNull();
  });
});

describe('the cloud shell', () => {
  afterEach(() => setWeatherReader('clouds', null));

  it('sits on the cloud band, draws first among the clouds\' kind, and reads out through the weather readout', () => {
    const tex = () => scalarTexture({ grid: GRID, values: new Float32Array(360 * 181) }, (v) => v);
    const shell = createCloudShell({
      ir: new THREE.Texture(), irSize: { width: 2048, height: 1024 }, surface: tex(), cover: { first: tex(), second: tex(), weight: 0 },
      read: () => ({ value: 'cloud tops -40 °C', source: 'EUMETSAT Geostationary Ring, 2026-10-06 00:00Z' }),
    });
    expect((shell.mesh.material as THREE.ShaderMaterial).uniforms.modelEverywhere.value).toBe(0);
    const r = (shell.mesh.geometry as THREE.SphereGeometry).parameters.radius;
    expect(r).toBeCloseTo(100.4, 6);
    expect((shell.mesh.material as THREE.ShaderMaterial).depthWrite).toBe(false);
    expect(weatherReadingAt(10, 20)).toBe('cloud tops -40 °C · EUMETSAT Geostationary Ring, 2026-10-06 00:00Z');
    shell.setShown(false);
    expect(weatherReadingAt(10, 20)).toBeNull();
    shell.dispose();
  });
});

describe('the cloud shell at a forecast hour (WX11)', () => {
  afterEach(() => setWeatherReader('clouds', null));
  const tex = () => scalarTexture({ grid: GRID, values: new Float32Array(360 * 181) }, (v) => v);

  it('draws the model\'s cover everywhere, blended between its two steps by a weight that moves alone', () => {
    const cover = { first: tex(), second: tex(), weight: 0.25 };
    const shell = createCloudShell({ ir: new THREE.Texture(), irSize: { width: 1, height: 1 }, surface: tex(), cover, modelEverywhere: true, read: () => null });
    const uniforms = (shell.mesh.material as THREE.ShaderMaterial).uniforms;
    expect(uniforms.modelEverywhere.value).toBe(1);
    expect(uniforms.coverWeight.value).toBe(0.25);
    expect(uniforms.modelCover.value).toBe(cover.first);
    expect(uniforms.modelCoverNext.value).toBe(cover.second);
    shell.setCoverWeight(0.75);
    expect(uniforms.coverWeight.value).toBe(0.75);
    shell.dispose();
  });

  it('reads the model\'s cover under the pointer, called the model\'s', () => {
    const source = 'NOAA GFS model, 1° grid, 7 Oct 01:30Z, blended from 00:00Z and 03:00Z';
    expect(modelCloudPart(72.4, source)).toEqual({ value: 'cloud cover 72% (model)', source });
    expect(modelCloudPart(0.3, source)).toEqual({ value: 'cloud cover 0% (model)', source });
  });
});

describe('scalarTexture', () => {
  it('holds any gridded field as half floats, transformed, wrapping east–west', () => {
    const values = new Float32Array(360 * 181);
    values[5] = 87.5;
    const t = scalarTexture({ grid: GRID, values }, (v) => v / 100);
    expect(t.type).toBe(THREE.HalfFloatType);
    expect(t.wrapS).toBe(THREE.RepeatWrapping);
    expect(THREE.DataUtils.fromHalfFloat((t.image.data as Uint16Array)[5])).toBeCloseTo(0.875, 3);
  });
});
