/**
 * The base map has to be at the bottom. It stood at 1.035 — above the clouds and above
 * every mark — and depth-tested, so three layers drew hundreds of objects that nobody
 * could see. Whether a given layer is legible is measured by the layer audit; this only
 * holds the order of the bands, and that the base map is below the lowest of them.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  ALTITUDE_BANDS, BASE_MAP, CAMERA_FAR, CAMERA_NEAR, CAMERA_REACH, CLOUDS, SOLAR_SYSTEM_EXTENT, SURFACE_LINES,
  WEATHER_FIELDS, WIND_FLOW, cameraNearAt, depthStepAt,
} from '../globeAltitudes';

describe('globe altitude bands', () => {
  it('rise in the order they are listed', () => {
    const heights = ALTITUDE_BANDS.map(([, h]) => h);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(new Set(heights).size).toBe(heights.length);
  });

  it('put the base map below everything that is drawn on it, including the clouds', () => {
    expect(BASE_MAP).toBeLessThan(CLOUDS);
    expect(BASE_MAP).toBeLessThan(SURFACE_LINES);
    // A weather field recolours the ground itself (D-W, WX1), so it alone sits under the fills.
    expect(ALTITUDE_BANDS.every(([name, h]) => name === 'BASE_MAP' || name === 'WEATHER_FIELDS' || h > BASE_MAP)).toBe(true);
  });

  it('put the wind over the fills and under the clouds, as a weather map draws it', () => {
    expect(WIND_FLOW).toBeGreaterThan(BASE_MAP);
    expect(WIND_FLOW).toBeLessThan(CLOUDS);
  });

  it('put a weather field on the ground, under the fills, in a gap the depth buffer resolves', () => {
    expect(WEATHER_FIELDS).toBeGreaterThan(1.0);
    expect(WEATHER_FIELDS).toBeLessThan(BASE_MAP);
    expect(ALTITUDE_BANDS[0][0]).toBe('WEATHER_FIELDS');
    const gap = (BASE_MAP - WEATHER_FIELDS) * 100;
    expect(gap / depthStepAt(100 * 2.5)).toBeGreaterThan(8);
  });

  it('keep the base map off the surface, close enough to read as painted on it', () => {
    // Far enough out to clear z-fighting with the globe (with polygon offset behind it),
    // near enough that a mark at the same place does not visibly float off its ground.
    expect(BASE_MAP).toBeGreaterThan(1.0);
    expect(BASE_MAP).toBeLessThan(1.005);
  });

  it("can resolve the base map's gap above the surface at the camera's near plane", () => {
    const gap = (BASE_MAP - 1) * 100;       // scene units between the surface and the fills
    const defaultView = 100 * 2.5;          // camera at altitude 2.5, above the surface below it
    const altitude6 = 100 * 6;
    expect(gap / depthStepAt(defaultView)).toBeGreaterThan(16);
    expect(gap / depthStepAt(altitude6)).toBeGreaterThan(4);
    // globe.gl's own 0.05 could not, which is why the fills went undepth-tested until it was raised.
    expect(gap / depthStepAt(defaultView, 0.05)).toBeLessThan(4);
  });

});

describe("the camera's near plane and reach (decision K6)", () => {
  it('holds the near plane at CAMERA_NEAR in every view a person works in and every card', () => {
    for (const distance of [101.1, 150, 350, 450, 1000]) expect(cameraNearAt(distance)).toBe(CAMERA_NEAR);
  });

  it('moves it out with the camera beyond that', () => {
    expect(cameraNearAt(10_000)).toBeCloseTo(10, 6);
    expect(cameraNearAt(CAMERA_REACH)).toBeGreaterThan(cameraNearAt(10_000));
  });

  it('keeps the depth buffer fine enough for any planet drawn a pixel or more across, seen from the farthest reach', () => {
    // A near plane of 1 would be some 60,000 units coarse a million units away.
    expect(depthStepAt(1e6, CAMERA_NEAR)).toBeGreaterThan(50_000);
    // Jupiter, the largest, 2,200 units across, is a pixel wide on an 800-pixel-high view this far from the camera;
    // past it every planet is under a pixel, found by its marker, and needs no depth of its own (C32's one scale put
    // the far side of the system 12.8 million units out, where a step is about 1,100).
    const jupiterOnePixel = (2200 * 800) / (2 * Math.tan(THREE.MathUtils.degToRad(25)));
    expect(depthStepAt(jupiterOnePixel, cameraNearAt(CAMERA_REACH))).toBeLessThan(2200 / 50);
    expect(depthStepAt(CAMERA_FAR, cameraNearAt(CAMERA_REACH))).toBeLessThan(1500);
  });

  it('frames the whole solar system in the default 50-degree view at the farthest reach, with a tenth to spare', () => {
    const halfView = Math.tan(THREE.MathUtils.degToRad(25));
    expect((SOLAR_SYSTEM_EXTENT / CAMERA_REACH) * 1.1).toBeLessThan(halfView);
  });

  it('draws as far as the far side of the system from there', () => {
    expect(CAMERA_FAR).toBeGreaterThanOrEqual(CAMERA_REACH + SOLAR_SYSTEM_EXTENT);
  });
});
