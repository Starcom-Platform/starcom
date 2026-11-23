/**
 * The Sun's direction, in the frame the scene is drawn in.
 *
 * The ephemeris under this was always right — it agrees with the almanac — and every
 * one of the four defects this replaces was plumbing: a light never repositioned, a
 * uniform never written, a view-space normal, and a mesh-frame vector used as a scene
 * one. So these tests check the frame and the aiming, and scripts/probe-terminator.mjs
 * checks the terminator the app actually renders.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  subsolarDirectionWorld, createGlobeLightRig, aimGlobeLightRig, ambientForNightFill, DEFAULT_NIGHT_FILL,
  sunMomentFor, sunStillHook,
} from '../globeLighting';
import { latLngToGlobeWorld, latLngToGlobeLocal, globeWorldToLatLng, normalizeLongitude } from '../../utils/globeCoordinates';

const at = (iso: string) => new Date(iso);

describe('subsolarDirectionWorld', () => {
  it('points at the subsolar point the almanac gives', () => {
    // June solstice noon UTC: overhead at the Tropic of Cancer, near Greenwich.
    const june = globeWorldToLatLng(subsolarDirectionWorld(at('2026-06-21T12:00:00Z')));
    expect(june.lat).toBeCloseTo(23.44, 1);
    expect(june.lng).toBeCloseTo(0.46, 1);
    // December solstice: the Tropic of Capricorn.
    expect(globeWorldToLatLng(subsolarDirectionWorld(at('2026-12-21T12:00:00Z'))).lat).toBeCloseTo(-23.44, 1);
    // The moment this work was done: 21:00Z on 11 September.
    const sept = globeWorldToLatLng(subsolarDirectionWorld(at('2026-09-11T21:00:00Z')));
    expect(sept.lat).toBeCloseTo(4.30, 1);
    expect(sept.lng).toBeCloseTo(-135.87, 1);
  });

  it('is a unit vector in the scene\'s frame, not the globe mesh\'s', () => {
    const d = subsolarDirectionWorld(at('2026-09-11T21:00:00Z'));
    expect(d.length()).toBeCloseTo(1, 9);
    expect(d.distanceTo(latLngToGlobeWorld(4.2989, -135.8733, 1).normalize())).toBeLessThan(1e-3);
    // Reading the globe mesh's frame as the scene's — the defect this replaces — puts
    // the Sun 90° of longitude away from where it is.
    const wrong = globeWorldToLatLng(latLngToGlobeLocal(4.2989, -135.8733, 1).normalize());
    expect(normalizeLongitude(wrong.lng - -135.8733)).toBeCloseTo(90, 3);
  });

  it('travels west about fifteen degrees an hour, as the Earth turns', () => {
    const a = globeWorldToLatLng(subsolarDirectionWorld(at('2026-09-11T12:00:00Z')));
    const b = globeWorldToLatLng(subsolarDirectionWorld(at('2026-09-11T13:00:00Z')));
    expect(normalizeLongitude(b.lng - a.lng)).toBeCloseTo(-15, 0);
  });
});

describe('the globe\'s light rig', () => {
  it('is an ambient and a directional, in the order react-globe.gl takes them', () => {
    const rig = createGlobeLightRig();
    expect(rig.lights).toEqual([rig.ambient, rig.directional]);
    expect(rig.directional).toBeInstanceOf(THREE.DirectionalLight);
    expect(rig.ambient).toBeInstanceOf(THREE.AmbientLight);
  });

  it('aims the directional along the direction given, lighting the hemisphere facing it', () => {
    const rig = createGlobeLightRig();
    const direction = subsolarDirectionWorld(at('2026-09-11T21:00:00Z'));
    aimGlobeLightRig(rig, direction);
    expect(rig.directional.position.clone().normalize().distanceTo(direction)).toBeLessThan(1e-6);
    expect(rig.directional.position.length()).toBeGreaterThan(100); // clear of any camera range
    expect(rig.directional.target.position.toArray()).toEqual([0, 0, 0]);
  });

  it('keeps the night side readable, and can be turned off entirely', () => {
    expect(ambientForNightFill(0)).toBe(0);
    expect(ambientForNightFill(DEFAULT_NIGHT_FILL)).toBeGreaterThan(0);
    expect(ambientForNightFill(1)).toBeCloseTo(Math.PI, 6);
    // Out-of-range asks are clamped, never negative or blinding.
    expect(ambientForNightFill(-1)).toBe(0);
    expect(ambientForNightFill(5)).toBeCloseTo(Math.PI, 6);
    const rig = createGlobeLightRig();
    aimGlobeLightRig(rig, new THREE.Vector3(0, 0, 1), 0.5);
    expect(rig.ambient.intensity).toBeCloseTo(0.5 * Math.PI, 6);
  });
});

// IM20: a paused timeline is lit for its moment, as a shot's time.at pauses it.
describe('the moment the sun stands at', () => {
  it('is now while live, and the paused moment otherwise', () => {
    const now = Date.UTC(2026, 9, 3, 12);
    const paused = Date.UTC(2026, 9, 2, 0);
    expect(sunMomentFor({ isLive: true, currentTime: paused }, now).getTime()).toBe(now);
    expect(sunMomentFor({ isLive: false, currentTime: paused }, now).getTime()).toBe(paused);
    expect(sunMomentFor(null, now).getTime()).toBe(now);
  });
});

// IM20, IM23: a capture is lit for its still moment at once, for its render only.
describe('the sun in a capture', () => {
  it('lights a capture for its still moment, and puts the live light back after', () => {
    const live = new THREE.Vector3(1, 0, 0);
    const applied: THREE.Vector3[] = [];
    const hook = sunStillHook(() => ({ lightMode: 'sun', direction: live }), (direction) => applied.push(direction));
    const at = Date.parse('2026-10-01T12:00:00.000Z');
    hook.still(at);
    hook.release();
    expect(applied).toHaveLength(2);
    expect(applied[0].angleTo(subsolarDirectionWorld(new Date(at)))).toBeLessThan(1e-9);
    expect(applied[1]).toBe(live);
  });

  it('leaves the light alone when it is not the sun\'s', () => {
    const applied: unknown[] = [];
    for (const lightMode of ['headlamp', 'flat']) {
      const hook = sunStillHook(() => ({ lightMode, direction: new THREE.Vector3(0, 1, 0) }), (d) => applied.push(d));
      hook.still(0);
      hook.release();
    }
    expect(applied).toEqual([]);
  });
});
