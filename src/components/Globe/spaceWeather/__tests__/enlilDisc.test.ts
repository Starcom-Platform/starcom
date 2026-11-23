/**
 * ENLIL's disc (space-weather-visualization.md, SW18): placed as the solar system is, its Earth on the
 * globe's; its values packed for the GPU; its palettes from the tokens, the quiet wind see-through;
 * each place looking up its own cell.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createEnlilDisc, discUv, drawnDiscPoint, enlilPalette, enlilTexels } from '../enlilDisc';
import { sunEarthBasis } from '../heliosphereParticles';
import { DATA_SCALES } from '../../../../styles/tokens';
import { DRAWN_UNITS_PER_AU } from '../../../../solar-system/bodyPlacement';

const basis = sunEarthBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0));

describe('where the disc is drawn', () => {
  it('puts its Earth on the globe and its Sun on the drawn Sun, at the solar system\'s scale', () => {
    expect(drawnDiscPoint(1, 0, basis).length()).toBeLessThan(1e-6);
    const sun = drawnDiscPoint(0, 0, basis);
    expect(sun.clone().normalize().x).toBeCloseTo(1, 9);
    expect(sun.length()).toBeCloseTo(DRAWN_UNITS_PER_AU, 3);
  });

  it('puts what is ahead of the Earth in its orbit ahead, and keeps it in the ecliptic', () => {
    const ahead = drawnDiscPoint(1, 0.5, basis);
    expect(ahead.dot(basis.y)).toBeGreaterThan(0);
    expect(Math.abs(ahead.dot(basis.z))).toBeLessThan(1e-6);
    // Half an AU from the Earth, drawn at the solar system's one scale (C32), as the planets are.
    expect(ahead.length()).toBeCloseTo(0.5 * DRAWN_UNITS_PER_AU, 3);
  });
});

describe('the values, packed', () => {
  it('scales density over its bar, 0 to 60, and leaves the disc\'s outside and holes empty', () => {
    const grid = Float32Array.from([0, 30, 60, 90, NaN, -5]);
    const t = enlilTexels(grid, 'density');
    expect([t[0], t[4], t[8], t[12], t[20]]).toEqual([0, 128, 255, 255, 0]);
    expect([t[3], t[7], t[11], t[15], t[19], t[23]]).toEqual([255, 255, 255, 255, 0, 255]);
  });

  it('scales speed over its bar, 200 to 1600 km/s', () => {
    const t = enlilTexels(Float32Array.from([200, 900, 1600]), 'velocity');
    expect([t[0], t[4], t[8]]).toEqual([0, 128, 255]);
  });
});

describe('the palettes', () => {
  const at = (lut: Uint8Array, k: number) => Array.from(lut.slice(k * 4, k * 4 + 4));
  // The bytes as authored (sRGB), as the heat map's ramp keeps them: THREE.Color would make them linear.
  const hex = (h: string) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));

  it('runs through the tokens\' stops, the densest the last', () => {
    const lut = enlilPalette('density');
    const stops = DATA_SCALES.enlilDensity;
    expect(at(lut, 255).slice(0, 3)).toEqual(hex(stops[stops.length - 1][1]));
    // 14 per cm³ sits at 14/60 of the bar.
    const k = Math.round((14 / 60) * 255);
    const mid = stops.find(([v]) => v === 14)!;
    for (const [c, want] of at(lut, k).slice(0, 3).map((c, i) => [c, hex(mid[1])[i]])) expect(Math.abs(c - want)).toBeLessThanOrEqual(6);
  });

  it('leaves the quiet wind see-through and lets dense or fast streams glow', () => {
    const density = enlilPalette('density');
    expect(at(density, Math.round((2 / 60) * 255))[3]).toBeLessThan(20);
    expect(at(density, Math.round((8 / 60) * 255))[3]).toBeGreaterThan(40);
    expect(at(density, Math.round((40 / 60) * 255))[3]).toBe(255);
    const velocity = enlilPalette('velocity');
    expect(at(velocity, Math.round(((330 - 200) / 1400) * 255))[3]).toBeLessThan(40);
    expect(at(velocity, Math.round(((750 - 200) / 1400) * 255))[3]).toBe(255);
  });
});

describe('each place looks up its own cell', () => {
  it('maps a cell\'s place on the disc to its texel\'s centre', () => {
    const size = 160;
    for (const [i, j] of [[0, 0], [80, 40], [159, 159]]) {
      const [x, y] = [((i / (size - 1)) * 2 - 1) * 1.7, ((j / (size - 1)) * 2 - 1) * 1.7];
      const [u, v] = discUv(x, y, size);
      expect(u).toBeCloseTo((i + 0.5) / size, 9);
      expect(v).toBeCloseTo((j + 0.5) / size, 9);
    }
  });
});

describe('the disc', () => {
  it('draws two frames blended by the moment\'s weight, in the quantity chosen, round the Sun as drawn', () => {
    const disc = createEnlilDisc(160);
    expect(disc.object.name).toBe('enlil-disc');
    const u = (disc.object.material as THREE.ShaderMaterial).uniforms;
    const a = new Uint8Array(160 * 160 * 4), b = new Uint8Array(160 * 160 * 4);
    disc.setFrames(a, b, 0.25);
    expect((u.before.value as THREE.DataTexture).image.data).toBe(a);
    expect((u.after.value as THREE.DataTexture).image.data).toBe(b);
    expect(u.mixWeight.value).toBe(0.25);
    disc.setQuantity('velocity');
    expect((u.palette.value as THREE.DataTexture).image.data).toEqual(enlilPalette('velocity'));
    // A tilted pole, so no axis is left as it started.
    const tilted = sunEarthBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.6, 0.8));
    disc.setBasis(tilted);
    expect((u.xAxis.value as THREE.Vector3).toArray()).toEqual(tilted.x.toArray());
    expect((u.yAxis.value as THREE.Vector3).toArray()).toEqual(tilted.y.toArray());
    expect((u.zAxis.value as THREE.Vector3).toArray()).toEqual(tilted.z.toArray());
    disc.dispose();
  });
});
