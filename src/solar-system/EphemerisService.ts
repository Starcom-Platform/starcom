// EphemerisService.ts - Real orbital-mechanics positions (Sun, Moon, planets) via astronomy-engine
//
// This answers a different question than SolarEphemerisService.ts, which computes the
// Sun's apparent position AS SEEN FROM Earth's rotating surface (for the day/night
// terminator and the globe's light). This one answers "where do bodies actually sit in
// space," in astronomy-engine's own frame: J2000 equatorial axes (EQJ), in AU.
//
// Where a body is DRAWN is bodyPlacement.ts: the same positions, measured from the
// Earth, turned into the globe's Earth-fixed frame, at true sizes, with distances
// compressed by one rule (decision K6). The real interactive Globe always renders at the
// Three.js scene origin, so everything is placed relative to the Earth.

import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';

export const AU_KM = 149597870.7;
export const EARTH_RADIUS_KM = 6371;

// Matches GLOBE_RADIUS_UNITS in src/globe-engine/SpaceWeatherGeometry.ts — the app's
// scene-unit convention for everything anchored to the real interactive globe (100 scene
// units = 1 Earth radius). One scale for every body (decision K6).
export const GLOBE_UNITS_PER_EARTH_RADIUS = 100;

// The literal extension of GLOBE_UNITS_PER_EARTH_RADIUS out to AU distances (~2.35M
// scene units/AU): a true distance in scene units, before bodyPlacement compresses it.
export const GLOBE_UNITS_PER_AU = (AU_KM / EARTH_RADIUS_KM) * GLOBE_UNITS_PER_EARTH_RADIUS;

const PLANET_BODIES: Record<string, Astronomy.Body> = {
  mercury: Astronomy.Body.Mercury,
  venus: Astronomy.Body.Venus,
  earth: Astronomy.Body.Earth,
  mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter,
  saturn: Astronomy.Body.Saturn,
  uranus: Astronomy.Body.Uranus,
  neptune: Astronomy.Body.Neptune,
};

export function bodyFromPlanetName(name: string): Astronomy.Body | null {
  return PLANET_BODIES[name.toLowerCase()] ?? null;
}

/** True heliocentric distance (from the Sun) in AU. */
export function getHeliocentricDistanceAU(body: Astronomy.Body, date: Date): number {
  return Astronomy.HelioVector(body, date).Length();
}

/** Converts a real-world km distance into scene units under the globe's own 100-units-per-Earth-radius convention. */
export function kmToGlobeUnits(km: number): number {
  return (km / EARTH_RADIUS_KM) * GLOBE_UNITS_PER_EARTH_RADIUS;
}

const toVector3 = (v: Astronomy.Vector) => new THREE.Vector3(v.x, v.y, v.z);
const sampleTimes = (periodDays: number, segments: number, epoch: Date) =>
  Array.from({ length: segments + 1 }, (_, i) => new Date(epoch.getTime() + (i / segments) * periodDays * 86_400_000));

/**
 * A planet's real path round the Sun across one orbital period from `epoch`:
 * heliocentric positions, J2000 axes, AU, `segments + 1` of them, the last closing
 * the loop. Measured from the Sun, so the path is the ellipse itself; sampled from the
 * Earth across a planet's period it would fold in the Earth's own year as loops.
 */
export function sampleHeliocentricOrbit(body: Astronomy.Body, periodDays: number, segments: number, epoch: Date): THREE.Vector3[] {
  return sampleTimes(periodDays, segments, epoch).map((t) => toVector3(Astronomy.HelioVector(body, t)));
}

/**
 * The path of a body whose primary is the Earth (the Moon) across `periodDays` from
 * `epoch`: geocentric positions, J2000 axes, AU, `segments + 1` of them.
 */
export function sampleGeocentricOrbit(body: Astronomy.Body, periodDays: number, segments: number, epoch: Date): THREE.Vector3[] {
  return sampleTimes(periodDays, segments, epoch).map((t) => toVector3(Astronomy.GeoVector(body, t, false)));
}

/** Where the Earth is at `at`, from the Sun: J2000 axes, AU. Subtracted from a heliocentric path, it measures the path from the Earth. */
export function earthFromSun(at: Date): THREE.Vector3 {
  return toVector3(Astronomy.HelioVector(Astronomy.Body.Earth, at));
}
