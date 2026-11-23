/**
 * A strong quake's ripple (D-EQ, EQ10: "visual effects … animations"): two fronts spreading from the epicentre over
 * the ground, in the colour of its magnitude, fading as they go, out to twice the ring of how far it was likely felt.
 * For the eye only: it says which quakes were strong, never how the waves ran.
 *
 * One mesh for them all: a square on the ground at each quake, its fronts drawn by the shader. On screen they move with
 * the clock; a clip's frames move them by the frames' moments; a card holds them at rest, unseen (IM23, captureClock).
 */
import * as THREE from 'three';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { SURFACE_LINES } from '../../../components/Globe/globeAltitudes';
import { clipUnderWay, phaseSeconds, stilledAt } from '../../../globe-engine/captureClock';
import { indicativeRingKm, magnitudeColour } from './quakeFlags';

/** Quakes from this magnitude ripple. */
export const RIPPLE_FROM_MAGNITUDE = 5;
/** The most that ripple at once: the strongest. */
export const RIPPLE_LIMIT = 16;
/** A front's time to spread, s: 3,600 of them to the hour, so the phase never jumps (phaseSeconds). */
export const RIPPLE_PERIOD_S = 3.6;

const GLOBE_RADIUS_UNITS = 100;
const EARTH_RADIUS_KM = 6371;

export interface RippleItem {
  lat: number;
  lng: number;
  magnitude: number;
}

/** Which quakes ripple: those of RIPPLE_FROM_MAGNITUDE or more, the strongest RIPPLE_LIMIT. */
export function ripplingOf<T extends RippleItem>(items: readonly T[]): T[] {
  return items.filter((it) => it.magnitude >= RIPPLE_FROM_MAGNITUDE).sort((a, b) => b.magnitude - a.magnitude).slice(0, RIPPLE_LIMIT);
}

/** The phase a ripple's shader is drawn at: the clock's, a clip frame's moment's, or null for a card (unseen). */
export function ripplePhaseNow(nowMs = Date.now()): number | null {
  const still = stilledAt();
  if (still === null) return phaseSeconds(nowMs);
  return clipUnderWay() ? phaseSeconds(still) : null;
}

const VERTEX = /* glsl */ `
  attribute vec2 rippleUv;
  attribute float ripplePhase;
  attribute vec3 rippleColour;
  varying vec2 vUv;
  varying float vPhase;
  varying vec3 vColour;
  void main() {
    vUv = rippleUv;
    vPhase = ripplePhase;
    vColour = rippleColour;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uPeriod;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vPhase;
  varying vec3 vColour;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = 0.0;
    for (int k = 0; k < 2; k++) {
      float f = fract(uTime / uPeriod + vPhase + float(k) * 0.5);
      // A front a little wider as it spreads, fading by the square of how far it has gone.
      float front = 1.0 - smoothstep(0.0, 0.035 + 0.05 * f, abs(r - f));
      a += front * (1.0 - f) * (1.0 - f);
    }
    gl_FragColor = vec4(vColour, clamp(a, 0.0, 1.0) * uOpacity);
    #include <colorspace_fragment>
  }
`;

/** The ripples of the strong quakes among `items`, or null where none is strong. */
export function buildQuakeRipples(items: readonly RippleItem[], options: { type: string; renderOrder?: number }): THREE.Mesh | null {
  const rippling = ripplingOf(items);
  if (!rippling.length) return null;
  const positions = new Float32Array(rippling.length * 4 * 3);
  const uvs = new Float32Array(rippling.length * 4 * 2);
  const phases = new Float32Array(rippling.length * 4);
  const colours = new Float32Array(rippling.length * 4 * 3);
  const index: number[] = [];
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const radius = GLOBE_RADIUS_UNITS * SURFACE_LINES;
  const up = new THREE.Vector3();
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  const helper = new THREE.Vector3();
  const colour = new THREE.Color();
  rippling.forEach((it, q) => {
    const centre = latLngToGlobeWorld(it.lat, it.lng, radius);
    up.copy(centre).normalize();
    helper.set(0, 1, 0);
    if (Math.abs(up.y) > 0.9) helper.set(1, 0, 0);
    u.crossVectors(up, helper).normalize();
    v.crossVectors(up, u).normalize();
    const reach = ((2 * indicativeRingKm(it.magnitude)) / EARTH_RADIUS_KM) * radius;
    colour.set(magnitudeColour(it.magnitude));
    // Each quake its own phase, from its place, so the strong ones never pulse together.
    const phase = (Math.abs(Math.sin(it.lat * 12.9898 + it.lng * 78.233)) * 43758.5453) % 1;
    corners.forEach(([a, b], c) => {
      const k = q * 4 + c;
      positions.set([centre.x + (u.x * a + v.x * b) * reach, centre.y + (u.y * a + v.y * b) * reach, centre.z + (u.z * a + v.z * b) * reach], k * 3);
      uvs.set([a, b], k * 2);
      phases[k] = phase;
      colours.set([colour.r, colour.g, colour.b], k * 3);
    });
    const o = q * 4;
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('rippleUv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('ripplePhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('rippleColour', new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: { uTime: { value: 0 }, uPeriod: { value: RIPPLE_PERIOD_S }, uOpacity: { value: 0.85 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = options.renderOrder ?? 114;
  mesh.userData = { type: options.type, rippling: rippling.length };
  mesh.onBeforeRender = () => {
    const phase = ripplePhaseNow();
    material.uniforms.uOpacity.value = phase === null ? 0 : 0.85;
    material.uniforms.uTime.value = phase ?? 0;
  };
  return mesh;
}
