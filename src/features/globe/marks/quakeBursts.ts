/**
 * A quake's burst as a replay reaches it (D-EQ, EQ7, EQ18): a flash at the epicentre and a ring bursting outward over
 * the ground, in its colour, out to half again the ring of how far it was likely felt (an indication from its
 * magnitude), fading as it goes. For the eye only, as the ripples are: it says when and how strong, never how the waves
 * ran.
 *
 * One mesh for them all, a square facing the screen at each quake, as the marks' pings are (glyphOverlays.ts): its
 * reach on the ground, or more where that would be too small to see, a size on screen by its magnitude, so a quake's
 * burst reads from the whole globe's view as close in. Each square stands collapsed outside its own burst, so a replay
 * of thousands draws only the few bursting.
 */
import * as THREE from 'three';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';
import { SURFACE_LINES } from '../../../components/Globe/globeAltitudes';
import { indicativeRingKm } from './quakeFlags';
import type { QuakeReplayMoment } from '../timebar/playClock';

/** A burst's time to spread, in seconds of play; never more than most of the decay. */
export const BURST_S = 1.2;
/** The least reach, km: a small quake's burst is still seen from the whole globe's view. */
export const BURST_MIN_KM = 60;
/** How far a burst reaches, km. */
export const burstReachKm = (m: number): number => Math.max(BURST_MIN_KM, 1.5 * indicativeRingKm(m));
/** The least a burst reaches on screen, CSS px, by magnitude: 13 px at M3, 28 at M6, never past 48. */
export const burstMinPx = (m: number): number => Math.min(48, Math.max(8, 8 + 5 * ((Number.isFinite(m) ? m : 2) - 2)));
/** A burst's length in the data's time, ms. */
export const burstLengthMs = (moment: QuakeReplayMoment): number => Math.min(BURST_S * moment.msPerSecond, 0.8 * moment.decayMs);

const GLOBE_RADIUS_UNITS = 100;
const EARTH_RADIUS_KM = 6371;

export interface BurstItem {
  lat: number;
  lng: number;
  magnitude: number;
  /** When it happened, ms since the epoch: a quake with none never bursts. */
  timeMs?: number | null;
}

const VERTEX = /* glsl */ `
  attribute vec2 burstUv;
  attribute float burstAt;
  attribute vec3 burstColour;
  attribute float burstReach;
  attribute float burstMinPx;
  uniform float uNow;
  uniform float uLength;
  uniform vec2 uViewport;
  uniform float uPixelRatio;
  varying vec2 vUv;
  varying float vAge;
  varying vec3 vColour;
  void main() {
    vAge = (uNow - burstAt) / max(uLength, 1.0e-6);
    vUv = burstUv;
    vColour = burstColour;
    // Outside its burst, the square collapses beyond the screen: nothing is drawn for it.
    if (vAge < 0.0 || vAge >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vec4 clip = projectionMatrix * view;
    // Its reach on the ground, on screen: the centre and a point that far across the view, in device px.
    float scale = length(modelViewMatrix[0].xyz);
    vec4 edge = projectionMatrix * (view + vec4(burstReach * scale, 0.0, 0.0, 0.0));
    float groundPx = abs(edge.x / edge.w - clip.x / clip.w) * 0.5 * uViewport.x;
    float radiusPx = max(burstMinPx * uPixelRatio, groundPx);
    clip.xy += burstUv * radiusPx * 2.0 / max(uViewport, vec2(1.0)) * clip.w;
    gl_Position = clip;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vAge;
  varying vec3 vColour;
  void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    // The front eases out as it spreads, a little wider as it goes, fading by the square of its age.
    float f = 1.0 - pow(1.0 - vAge, 3.0);
    float front = 1.0 - smoothstep(0.0, 0.04 + 0.06 * f, abs(r - f));
    // The flash at the epicentre, white at its heart, gone in the first third.
    float core = (1.0 - smoothstep(0.0, 0.22, r)) * (1.0 - smoothstep(0.0, 0.35, vAge));
    float a = front * (1.0 - vAge) * (1.0 - vAge) + 0.9 * core;
    gl_FragColor = vec4(mix(vColour, vec3(1.0), core), clamp(a, 0.0, 1.0) * uOpacity);
    #include <colorspace_fragment>
  }
`;

/** The bursts of the timed quakes among `items`, drawn as `replay` reaches each; null where none has a time. */
export function buildQuakeBursts(
  items: readonly BurstItem[],
  options: { type: string; colourOf: (item: BurstItem) => string; replay: () => QuakeReplayMoment | null; renderOrder?: number },
): THREE.Mesh | null {
  const timed = items.filter((it) => typeof it.timeMs === 'number' && Number.isFinite(it.timeMs));
  if (!timed.length) return null;
  // Times as seconds from the earliest, as the glyphs' are: a float32 would round epoch milliseconds to hours.
  const baseMs = Math.min(...timed.map((it) => it.timeMs as number));
  const positions = new Float32Array(timed.length * 4 * 3);
  const uvs = new Float32Array(timed.length * 4 * 2);
  const ats = new Float32Array(timed.length * 4);
  const colours = new Float32Array(timed.length * 4 * 3);
  const index: number[] = [];
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const reaches = new Float32Array(timed.length * 4);
  const minPx = new Float32Array(timed.length * 4);
  const radius = GLOBE_RADIUS_UNITS * SURFACE_LINES;
  const colour = new THREE.Color();
  timed.forEach((it, q) => {
    const centre = latLngToGlobeWorld(it.lat, it.lng, radius);
    const reach = (burstReachKm(it.magnitude) / EARTH_RADIUS_KM) * radius;
    colour.set(options.colourOf(it));
    const at = ((it.timeMs as number) - baseMs) / 1000;
    corners.forEach(([a, b], c) => {
      const k = q * 4 + c;
      positions.set([centre.x, centre.y, centre.z], k * 3);
      uvs.set([a, b], k * 2);
      ats[k] = at;
      reaches[k] = reach;
      minPx[k] = burstMinPx(it.magnitude);
      colours.set([colour.r, colour.g, colour.b], k * 3);
    });
    const o = q * 4;
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('burstUv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('burstAt', new THREE.BufferAttribute(ats, 1));
  geometry.setAttribute('burstColour', new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute('burstReach', new THREE.BufferAttribute(reaches, 1));
  geometry.setAttribute('burstMinPx', new THREE.BufferAttribute(minPx, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uNow: { value: -1e9 }, uLength: { value: 1 }, uOpacity: { value: 0 },
      uViewport: { value: new THREE.Vector2(1, 1) }, uPixelRatio: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = options.renderOrder ?? 114;
  mesh.frustumCulled = false;
  mesh.userData = { type: options.type, bursts: timed.length };
  // Never a pick target: the flag over it hovers and opens.
  mesh.raycast = () => {};
  const viewport = new THREE.Vector2();
  mesh.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize?.(viewport);
    if (viewport.x > 0) (material.uniforms.uViewport.value as THREE.Vector2).copy(viewport);
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio?.() ?? 1;
    const moment = options.replay();
    material.uniforms.uOpacity.value = moment ? 0.9 : 0;
    material.uniforms.uNow.value = moment ? (moment.atMs - baseMs) / 1000 : -1e9;
    material.uniforms.uLength.value = moment ? burstLengthMs(moment) / 1000 : 1;
  };
  return mesh;
}
