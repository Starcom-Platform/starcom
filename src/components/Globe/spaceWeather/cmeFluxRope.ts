/**
 * A CME's magnetic structure, drawn (record docs/missions/01-architecture-decisions/space-weather-visualization.md,
 * SW28; the owner's C31 pick, 2026-10-24): its flux rope as the graduated cylindrical shell (GCS) model has it, the
 * shape forecasters fit to coronagraph images, a twisted "croissant" whose two legs stay anchored at the Sun while
 * its front moves out; drawn as glowing field lines wound round the rope's axis.
 *
 * - The axis runs across the CME's cone, from one leg at the Sun through an apex just behind the front to the other
 *   leg; the rope thickens with its height above the Sun, as GCS's does (its aspect ratio).
 * - The field lines wind round it, a few turns from leg to leg.
 * - Its tilt, the angle the rope makes round the CME's direction, is not in DONKI's analysis: the rope is laid in
 *   the ecliptic, and the key says its tilt is modelled.
 * - Each line a thread of light (lightThreads.ts): brightest at the apex and fading down its legs, so the many legs
 *   meeting at the Sun do not pile into one glare.
 *
 * The shape is worked out once for a front at 1 AU, in AU in the Sun-Earth frame, and scaled with the front in the
 * vertex shader, as the plasma is: a GCS rope is self-similar.
 */
import * as THREE from 'three';
import { earthDirected, type Cme } from '../../../services/spaceWeather/donki';
import { capFrame, cmeColour, DRAWN_REACH_AU, shellStrength } from './cmeShells';
import { createLightThreads } from './lightThreads';
import type { SunEarthBasis } from './heliosphereParticles';

/** Field lines round the rope, points along each, and the turns each makes from leg to leg. */
export const ROPE_LINES = 6;
export const ROPE_POINTS = 960;
const ROPE_TURNS = 2;
/** The rope's radius as a share of its axis's height above the Sun: GCS's aspect ratio. */
const ASPECT = 0.32;
/** Its outer edge at the apex, as a share of the front's distance: just inside the plasma's bright front. */
const OUTER_SHARE = 0.95;
const APEX_SHARE = OUTER_SHARE / (1 + ASPECT);
/** The light at a leg, as a share of the apex's; a point's size; and the rope's light beside the plasma's. */
const LEG_LIGHT = 0.12;
const POINT_PX = 2.4;
const ROPE_LIGHT = 0.6;
export const FLUX_ROPE_TYPE = 'cmeFluxRope';

type Direction = Pick<Cme, 'lat' | 'lon' | 'halfAngle'>;

/**
 * The rope's field lines for a front at 1 AU: AU in the Sun-Earth frame (the Sun at the origin, the Earth at x = 1),
 * x, y, z each, line by line.
 */
export function fluxRopeLines(cme: Direction, lines = ROPE_LINES, points = ROPE_POINTS - 1): number[][] {
  const [axis, u, v] = capFrame(cme);
  // Across the cone in the ecliptic: of the two directions across the CME, the one nearer the ecliptic plane.
  const inPlane = Math.abs(u.z) < Math.abs(v.z) ? u : v;
  const half = (cme.halfAngle * Math.PI) / 180;
  // The axis lies in one plane, through the Sun: across the rope, its normal and the direction in the plane.
  const normal = new THREE.Vector3().crossVectors(axis, inPlane).normalize();
  const axisAt = (s: number): THREE.Vector3 => {
    // From one leg (s = -1) through the apex (0) to the other (1): anchored at the Sun at the cone's edges.
    const psi = s * half;
    const height = APEX_SHARE * Math.pow(Math.max(0, Math.cos((s * Math.PI) / 2)), 0.6);
    return axis.clone().multiplyScalar(Math.cos(psi)).addScaledVector(inPlane, Math.sin(psi)).multiplyScalar(height);
  };
  const out: number[][] = [];
  for (let line = 0; line < lines; line += 1) {
    const phase = (line / lines) * Math.PI * 2;
    const positions: number[] = [];
    for (let k = 0; k <= points; k += 1) {
      const s = -1 + (2 * k) / points;
      const at = axisAt(s);
      const along = axisAt(Math.min(1, s + 0.01)).sub(axisAt(Math.max(-1, s - 0.01))).normalize();
      const inward = new THREE.Vector3().crossVectors(normal, along);
      const radius = ASPECT * at.length();
      const turn = phase + ROPE_TURNS * 2 * Math.PI * ((s + 1) / 2);
      positions.push(...at.addScaledVector(inward, radius * Math.cos(turn)).addScaledVector(normal, radius * Math.sin(turn)).toArray());
    }
    out.push(positions);
  }
  return out;
}

/** A point's light along its line, `s` from one leg (-1) through the apex (0) to the other (1). */
export const ropeLightAt = (s: number): number => LEG_LIGHT + (1 - LEG_LIGHT) * Math.cos((s * Math.PI) / 2);

export interface CmeFluxRope {
  object: THREE.Points;
  /** Its front's distance from the Sun, AU. */
  setFront(au: number): void;
  setBasis(basis: SunEarthBasis): void;
  dispose(): void;
}

export function createCmeFluxRope(cme: Cme): CmeFluxRope {
  const threads = createLightThreads(`rope-${cme.id}`, fluxRopeLines(cme), {
    rgb: cmeColour(cme.speed),
    strength: ROPE_LIGHT * shellStrength(cme.speed) * (earthDirected(cme) ? 1.3 : 1),
    pointPx: POINT_PX,
    lightAt: (t) => ropeLightAt(2 * t - 1),
  });
  threads.object.userData = { type: FLUX_ROPE_TYPE };
  return {
    object: threads.object,
    setFront(au) {
      threads.setScale(au);
      // Faded out at its reach, as the plasma is.
      threads.setGain(au > 0 && au <= DRAWN_REACH_AU ? 1 - THREE.MathUtils.smoothstep(au, DRAWN_REACH_AU - 0.25, DRAWN_REACH_AU) : 0);
    },
    setBasis: threads.setBasis,
    dispose: threads.dispose,
  };
}
