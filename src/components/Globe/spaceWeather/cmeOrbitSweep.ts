/**
 * A CME's front sweeping across the Earth's orbit (record docs/missions/01-architecture-decisions/space-weather-visualization.md,
 * SW30; the owner's C31 pick, 2026-10-24): the arc of the orbit inside its cone, lit as its front nears 1 AU,
 * brightest as it crosses and fading as the CME passes on; a thread of light in its speed's colour, as its flux
 * rope is (lightThreads.ts). Through the Earth when the Earth lies in its cone.
 *
 * The orbit as the Sun-Earth frame has it, a circle of 1 AU round the Sun in the ecliptic through the Earth; the
 * front as the cone model has it, at one distance across the cone, so the whole arc is crossed at once.
 */
import * as THREE from 'three';
import { earthDirected, type Cme } from '../../../services/spaceWeather/donki';
import { capFrame, cmeColour, shellStrength } from './cmeShells';
import { createLightThreads } from './lightThreads';
import type { SunEarthBasis } from './heliosphereParticles';

/** Points along the arc, a point's size, and its light beside the plasma's. */
const ARC_POINTS = 720;
const POINT_PX = 3;
const ARC_LIGHT = 0.9;
/** The front's distances, AU, over which the arc lights, is brightest, and has faded as the CME passes on. */
const LIGHTS_FROM_AU = 0.8;
const CROSSES_AU = 1;
const FADED_BY_AU = 1.3;
export const ORBIT_SWEEP_TYPE = 'cmeOrbitSweep';

type Direction = Pick<Cme, 'lat' | 'lon' | 'halfAngle'>;

/**
 * The arc of the Earth's orbit inside the CME's cone: AU in the Sun-Earth frame, x, y, z each, from one edge of
 * the cone to the other; null when the cone does not reach the ecliptic.
 */
export function orbitArcInCone(cme: Direction, points = ARC_POINTS): number[] | null {
  const [axis] = capFrame(cme);
  // An orbit point at angle phi from the Earth, seen from the Sun, is (cos phi, sin phi, 0): inside the cone where
  // its angle from the axis is within the half-width, |phi - middle| <= the arc's half-width.
  const inPlane = Math.hypot(axis.x, axis.y);
  const reach = Math.cos((cme.halfAngle * Math.PI) / 180) / inPlane;
  if (inPlane < 1e-9 || reach >= 1) return null;
  const middle = Math.atan2(axis.y, axis.x);
  const half = Math.acos(reach);
  const positions: number[] = [];
  for (let k = 0; k < points; k += 1) {
    const phi = middle - half + (2 * half * k) / (points - 1);
    positions.push(Math.cos(phi), Math.sin(phi), 0);
  }
  return positions;
}

/** How lit the arc is with the front at a distance, AU: rising as it nears, gone once it has passed. */
export function sweepLight(frontAu: number): number {
  return THREE.MathUtils.smoothstep(frontAu, LIGHTS_FROM_AU, CROSSES_AU) * (1 - THREE.MathUtils.smoothstep(frontAu, CROSSES_AU, FADED_BY_AU));
}

export interface CmeOrbitSweep {
  object: THREE.Points;
  setFront(au: number): void;
  setBasis(basis: SunEarthBasis): void;
  dispose(): void;
}

/** Null for a CME whose cone does not reach the Earth's orbit. */
export function createCmeOrbitSweep(cme: Cme): CmeOrbitSweep | null {
  const arc = orbitArcInCone(cme);
  if (!arc) return null;
  const threads = createLightThreads(`sweep-${cme.id}`, [arc], {
    rgb: cmeColour(cme.speed),
    strength: ARC_LIGHT * shellStrength(cme.speed) * (earthDirected(cme) ? 1.3 : 1),
    pointPx: POINT_PX,
    // Fading toward the cone's edges.
    lightAt: (t) => Math.sqrt(Math.sin(Math.PI * t)),
  });
  threads.object.userData = { type: ORBIT_SWEEP_TYPE };
  return {
    object: threads.object,
    setFront(au) { threads.setGain(sweepLight(au)); },
    setBasis: threads.setBasis,
    dispose: threads.dispose,
  };
}
