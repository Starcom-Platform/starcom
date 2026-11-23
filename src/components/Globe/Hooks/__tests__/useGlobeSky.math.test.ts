/**
 * Where a person in Sky from a place looks (plan D5): their own up, north and east, square to each other; straight up
 * at an altitude of 90°, due east at an azimuth of 90° on the horizon; the Sun overhead where it is noon.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { subsolarDirectionWorld } from '../../../../globe-engine/globeLighting';
import { globeWorldToLatLng } from '../../../../utils/globeCoordinates';
import * as THREE from 'three';
import { BOUNDARY_CONTOURS_TYPE } from '../../../../globe-engine/SpaceWeatherGeometry';
import { hiddenInSky, localAxes, lookDirection, sunAltitude } from '../useGlobeSky';

describe('a person on the ground', () => {
  it('has an up, a north and an east square to each other, north toward the pole', () => {
    for (const [lat, lng] of [[51.5, -0.1], [-33.9, 151.2], [0, 0], [70, 100]]) {
      const { up, north, east } = localAxes(lat, lng);
      expect(up.length()).toBeCloseTo(1, 9);
      expect(north.length()).toBeCloseTo(1, 9);
      expect(east.length()).toBeCloseTo(1, 9);
      expect(up.dot(north)).toBeCloseTo(0, 9);
      expect(up.dot(east)).toBeCloseTo(0, 9);
      expect(north.dot(east)).toBeCloseTo(0, 9);
      expect(north.y).toBeGreaterThan(-1e-9);
      // North × east is down, as a right-handed frame on a sphere has it seen from outside.
      expect(north.clone().cross(east).dot(up)).toBeCloseTo(-1, 9);
    }
  });

  it('looks straight up at 90°, and due east on the horizon at an azimuth of 90°', () => {
    const { up, east } = localAxes(40, -74);
    expect(lookDirection(40, -74, 123, 90).dot(up)).toBeCloseTo(1, 9);
    expect(lookDirection(40, -74, 90, 0).dot(east)).toBeCloseTo(1, 9);
  });

  it("hides what no eye on the ground sees, and keeps the aurora (the owner, 3 Nov)", () => {
    const named = (name: string) => Object.assign(new THREE.Group(), { name });
    expect(hiddenInSky(named('heliosphere'))).toBe(true);
    expect(hiddenInSky(named('field-lines'))).toBe(true);
    expect(hiddenInSky(Object.assign(new THREE.Group(), { userData: { type: BOUNDARY_CONTOURS_TYPE } }))).toBe(true);
    expect(hiddenInSky(named('aurora'))).toBe(false);
    expect(hiddenInSky(named('e-field'))).toBe(false);
  });

  it('sees the Sun overhead where it is overhead, and under the horizon on the other side', () => {
    const at = new Date('2026-11-02T08:00:00Z');
    const { lat, lng } = globeWorldToLatLng(subsolarDirectionWorld(at));
    expect(sunAltitude(lat, lng, at)).toBeCloseTo(90, 3);
    expect(sunAltitude(-lat, lng + 180, at)).toBeCloseTo(-90, 3);
  });
});
