/**
 * The solar wind streaming past the magnetosphere, drawn (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW6, SW7, SW17): particles
 * replayed along streamlines worked out once (nearEarthFlow.ts), at the wind's measured speed sped up,
 * each a short streak back along its path, in the IMF's polarity's colour, brighter in the magnetosheath
 * behind the bow shock. Kept in GSM, the object's matrix carrying GSM into the scene for the moment shown.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Frame } from '../../../services/spaceWeather/geopack/geopack';
import { RE_UNITS } from './fieldLines';
import { flowStarts, insideHalfBody, streamline } from './nearEarthFlow';

/** Streamlines, and particles on each. */
const LINES = 600;
const PER_LINE = 5;
/** Earth radii of free-stream travel between a streamline's points (nearEarthFlow's step). */
const STEP_RE = 0.5;
/** The free stream drawn at 4 Re a second for a 400 km/s wind, in proportion to it: about 64 times its speed. */
export const flowReSecond = (windKmS: number): number => (4 * windKmS) / 400;
/** The bow shock, as the half-body this many times as large as the magnetopause. */
const BOW_SHOCK_SCALE = 1.3;

/** GSM, Re, into the scene: GSM to GEO (the transpose of geopack's A), GEO (x, y, z) to the scene's (y, z, x), 100 units an Earth radius. */
export function gsmToSceneMatrix(frame: Frame): THREE.Matrix4 {
  const a = frame.a;
  // Columns: where GSM's x, y and z land in the scene.
  const column = (k: number) => {
    const geo = [a[3 * k], a[3 * k + 1], a[3 * k + 2]];
    return new THREE.Vector3(geo[1], geo[2], geo[0]).multiplyScalar(RE_UNITS);
  };
  return new THREE.Matrix4().makeBasis(column(0), column(1), column(2));
}

interface Path { points: Float32Array; sheath: Float32Array; length: number }

/** The streamlines for a magnetopause nose, Re, and each point's being in the magnetosheath. */
export function flowPaths(standoffRe: number): Path[] {
  return flowStarts(LINES).map((start) => {
    const line = streamline(start, standoffRe, STEP_RE);
    const n = line.length / 3;
    const sheath = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const p = [line[3 * k], line[3 * k + 1], line[3 * k + 2]];
      sheath[k] = insideHalfBody(p, standoffRe, BOW_SHOCK_SCALE) && !insideHalfBody(p, standoffRe) ? 1 : 0;
    }
    return { points: Float32Array.from(line), sheath, length: n };
  });
}

export interface NearEarthFlowParticles {
  object: LineSegments2;
  /** Where the particles are, `seconds` into the flow, at the free stream's speed, Re a second. */
  place(seconds: number, reSecond: number): void;
  setFrame(frame: Frame): void;
  setColor(color: string): void;
  dispose(): void;
}

/** A streak's length behind its particle, in streamline steps (half an Earth radius each). */
const TAIL_STEPS = 3;

/**
 * The particles as short streaks back along their own streamlines, bright at the head and fading to the
 * tail, so a still shows which way the wind runs; brighter in the magnetosheath.
 */
export function createNearEarthFlowParticles(paths: Path[], color: string): NearEarthFlowParticles {
  const n = paths.length * PER_LINE;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(n * 6));
  geometry.setColors(new Float32Array(n * 6));
  const positions = (geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute).data;
  const colours = (geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute).data;
  const base = new THREE.Color(color);
  const material = new LineMaterial({ color: 0xffffff, vertexColors: true, linewidth: 2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const object = new LineSegments2(geometry, material);
  object.name = 'near-earth-flow';
  object.frustumCulled = false;
  object.matrixAutoUpdate = false;
  const at = (path: Path, s: number, out: number[]) => {
    const k = Math.min(Math.max(Math.floor(s), 0), path.length - 2), f = Math.min(Math.max(s - k, 0), 1);
    for (let c = 0; c < 3; c++) out[c] = path.points[k * 3 + c] * (1 - f) + path.points[(k + 1) * 3 + c] * f;
    return path.sheath[k] * (1 - f) + path.sheath[k + 1] * f;
  };
  const head = [0, 0, 0], tail = [0, 0, 0];
  return {
    object,
    place(seconds, reSecond) {
      const p = positions.array as Float32Array, c = colours.array as Float32Array;
      let i = 0;
      paths.forEach((path, line) => {
        const steps = path.length - 1;
        for (let q = 0; q < PER_LINE; q++, i++) {
          // Along the streamline, a point every STEP_RE of free-stream travel: equal times apart.
          const s = ((seconds * reSecond) / STEP_RE + (steps * (q + ((line * 0.618) % 1))) / PER_LINE) % steps;
          const sheath = at(path, s, head);
          at(path, s - TAIL_STEPS, tail);
          p.set(tail, i * 6);
          p.set(head, i * 6 + 3);
          // Faded in from upstream and out down the tail, so none appears or vanishes at once.
          const fade = Math.min(s / 6, (steps - s) / 6, 1) * (0.5 + 0.9 * sheath);
          c.set([0, 0, 0], i * 6);
          c.set([base.r * fade, base.g * fade, base.b * fade], i * 6 + 3);
        }
      });
      positions.needsUpdate = true;
      colours.needsUpdate = true;
    },
    setFrame(frame) {
      object.matrix.copy(gsmToSceneMatrix(frame));
      object.matrixWorldNeedsUpdate = true;
    },
    setColor(next) { base.set(next); },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
