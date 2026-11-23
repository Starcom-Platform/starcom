// globeLighting.ts — where the light on the globe comes from.
//
// ─── WHAT THIS REPLACES ────────────────────────────────────────────────────
//
// Measured in the running app on 2026-09-11, at the default view, in every mode:
//
//   · the globe was lit by three-globe's default lights — an ambient, and a
//     directional light fixed at (0, 1, 0), straight above the north pole;
//   · SolarSunManager's own directional light sat where it was created,
//     (0, 0, 1000), because the tier a person actually looks at the globe from
//     (EARTH_LOCAL) declares the Sun "not visible", so updateForScale never
//     reached the branch that positions it;
//   · the day/night shader's sunDirection uniform still held its initial
//     (1, 0, 0) after the globe had been up for eighteen seconds, because the
//     only thing feeding it was that same unmoved sun position;
//   · and that shader compared the direction against a VIEW-space normal, so
//     any direction it had been given would have swung with the camera.
//
// The ephemeris underneath was never the problem: SolarEphemerisService agrees
// with the almanac (2026-09-11T21:00Z: declination +4.30°, subsolar longitude
// -135.87°; solstices at ±23.44°). Only the plumbing was broken. So the light
// is derived here, from that ephemeris, in the scene's own frame, and aimed at
// the globe directly — independent of the solar system, which draws the Sun as
// a body along this same direction (bodyPlacement.ts's sunInSky), not as the
// Earth's light.
import * as THREE from 'three';
import { computeSolarEphemeris } from '../solar-system/SolarEphemerisService';
import { latLngToGlobeWorld } from '../utils/globeCoordinates';
import type { StillHook } from './captureClock';

/**
 * The unit vector from Earth's centre toward the Sun, in the scene's frame —
 * the frame react-globe.gl draws in (see globeCoordinates.ts). Point the light
 * along this and the terminator falls where the real one is.
 */
export function subsolarDirectionWorld(at: Date): THREE.Vector3 {
  const { subsolarLatitudeDeg, subsolarLongitudeDeg } = computeSolarEphemeris(at);
  return latLngToGlobeWorld(subsolarLatitudeDeg, subsolarLongitudeDeg, 1).normalize();
}

/**
 * How much of the day texture still shows on the night side. A terminator with
 * nothing behind it makes half the marks on the globe unreadable; the city
 * lights carry most of that, and this lifts the rest.
 */
export const DEFAULT_NIGHT_FILL = 0.15;

/** Far enough away to read as a direction, near enough to stay in any camera range. */
const LIGHT_DISTANCE = 1000;
const DIRECTIONAL_INTENSITY = 2.4;

export interface GlobeLightRig {
  directional: THREE.DirectionalLight;
  ambient: THREE.AmbientLight;
  /** What react-globe.gl's `lights()` takes, replacing its own defaults. */
  lights: THREE.Light[];
}

/**
 * The globe's lights, replacing three-globe's fixed pair. The ambient is what
 * keeps the night side from being a black hole; the directional is the Sun.
 */
export function createGlobeLightRig(nightFill = DEFAULT_NIGHT_FILL): GlobeLightRig {
  const directional = new THREE.DirectionalLight(0xffffff, DIRECTIONAL_INTENSITY);
  directional.name = 'globeSunLight';
  const ambient = new THREE.AmbientLight(0xbfd4ff, ambientForNightFill(nightFill));
  ambient.name = 'globeNightFill';
  return { directional, ambient, lights: [ambient, directional] };
}

/** Ambient intensity for a night-side fill of `nightFill` (0 = unlit night). */
export function ambientForNightFill(nightFill: number): number {
  return Math.max(0, Math.min(1, nightFill)) * Math.PI;
}

/**
 * Aim the rig along `direction` (a unit vector toward the light source).
 *
 * `flat` is the light mode with no terminator at all: the directional light goes dark
 * and the ambient carries the whole scene, so every mark reads the same wherever it is.
 */
export function aimGlobeLightRig(
  rig: GlobeLightRig,
  direction: THREE.Vector3,
  nightFill = DEFAULT_NIGHT_FILL,
  flat = false,
): void {
  rig.directional.position.copy(direction).multiplyScalar(LIGHT_DISTANCE);
  // A directional light points at its target, the origin by default — which is
  // the globe's centre, so the lit hemisphere is the one facing `direction`.
  rig.directional.target.position.set(0, 0, 0);
  rig.directional.target.updateMatrixWorld();
  rig.directional.intensity = flat ? 0 : DIRECTIONAL_INTENSITY;
  rig.ambient.intensity = flat ? Math.PI : ambientForNightFill(nightFill);
}

/**
 * The moment the Sun is placed for: now while the timeline is live, and the
 * paused moment otherwise (IM20), as a shot's time.at pauses it. One cursor
 * (decision D-E): a globe paused at night is lit as it was that night.
 */
export function sunMomentFor(temporal: { isLive: boolean; currentTime: number } | null, nowMs: number): Date {
  return new Date(temporal && !temporal.isLive ? temporal.currentTime : nowMs);
}

/**
 * A capture lit for its still moment (IM20, IM23): the Sun placed for it at
 * once, for the capture's render only, and the live light put back after. The
 * live light follows the paused moment too, but a frame or more later, through
 * React: a capture made just after a pause would be lit for the moment before.
 * Only the Sun's light is placed; a headlamp or flat light has no moment.
 */
export function sunStillHook(
  current: () => { lightMode: string; direction: THREE.Vector3 },
  apply: (direction: THREE.Vector3) => void,
): StillHook {
  return {
    still: (atMs) => {
      if (current().lightMode === 'sun') apply(subsolarDirectionWorld(new Date(atMs)));
    },
    release: () => {
      if (current().lightMode === 'sun') apply(current().direction);
    },
  };
}
