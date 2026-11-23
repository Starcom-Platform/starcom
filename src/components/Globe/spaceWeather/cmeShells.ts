/**
 * Coronal mass ejections from NASA DONKI, drawn (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW8, SW20–SW22, SW27): each a cloud
 * of plasma bursting from the Sun along DONKI's direction, out to its half-width, with the three parts a
 * coronagraph films, a bright ragged front, a darker cavity and a bright core, and a faint shock ahead of it;
 * coloured by the speed DONKI measured near the Sun, pale when slow and hot when fast; brighter, its front
 * whiter, when the Earth lies in its cone. Its shape is the cone model's, modelled, and the key says so. The
 * front's distance is the drag-based model's for the moment shown (services/spaceWeather/donki.ts).
 *
 * It was a translucent cap (SW23), which the owner found told nothing of what a CME is (critique C31).
 *
 * Placed as the solar system is, like ENLIL's disc and the solar wind's particles: the Sun-Earth frame
 * aligned to the drawn Sun, at the solar system's one scale about the Earth (bodyPlacement.ts, C32), so its Sun is
 * the drawn Sun. Worked out in the vertex shader, as a cap's points move. Faded within
 * about 120 Earth radii of the Earth, as the rest of the Sun-Earth stretch is.
 */
import * as THREE from 'three';
import { DATA_SCALES } from '../../../styles/tokens';
import { cmeAxis, earthDirected, type Cme } from '../../../services/spaceWeather/donki';
import { unitsPerAuNow } from '../../../solar-system/solarScale';
import type { SunEarthBasis } from './heliosphereParticles';
import { stilledAt } from '../../../globe-engine/captureClock';

type Direction = Pick<Cme, 'lat' | 'lon' | 'halfAngle'>;

/** The CME's own frame in the Sun-Earth frame: its axis, and two directions across it. */
export function capFrame({ lat, lon }: Direction): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const axis = new THREE.Vector3(...cmeAxis(lat, lon));
  const helper = Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(helper, axis).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u);
  return [axis, u, v];
}

/**
 * A point of the cap, AU in the Sun-Earth frame: `t` from its middle (0) to its rim (1), `phi` round it,
 * at `front` from the Sun.
 */
export function capPointAu(cme: Direction, t: number, phi: number, front: number): [number, number, number] {
  const [axis, u, v] = capFrame(cme);
  const theta = (t * cme.halfAngle * Math.PI) / 180;
  const d = axis.multiplyScalar(Math.cos(theta)).add(u.multiplyScalar(Math.sin(theta) * Math.cos(phi))).add(v.multiplyScalar(Math.sin(theta) * Math.sin(phi)));
  return [d.x * front, d.y * front, d.z * front];
}

/** Where a point in the Sun-Earth frame, AU, is drawn: the shader's sum, for tests and probes. */
export function drawnSunEarthPoint([x, y, z]: readonly number[], basis: SunEarthBasis): THREE.Vector3 {
  const g = basis.x.clone().multiplyScalar(x - 1).add(basis.y.clone().multiplyScalar(y)).add(basis.z.clone().multiplyScalar(z));
  return g.multiplyScalar(unitsPerAuNow());
}

/** The tokens' stops as sRGB bytes, as authored (heatMap.ts). */
const STOPS = DATA_SCALES.cmeSpeedKmS.map(([speed, hex]) => ({ speed, rgb: [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) }));

/** A speed's colour, sRGB bytes: held at the scale's ends. */
export function cmeColour(speed: number): [number, number, number] {
  const v = Math.min(Math.max(speed, STOPS[0].speed), STOPS[STOPS.length - 1].speed);
  let s = 0;
  while (s < STOPS.length - 2 && STOPS[s + 1].speed <= v) s++;
  const [a, b] = [STOPS[s], STOPS[s + 1]];
  const t = (v - a.speed) / (b.speed - a.speed);
  return [0, 1, 2].map((k) => Math.round(a.rgb[k] + (b.rgb[k] - a.rgb[k]) * t)) as [number, number, number];
}

/**
 * How far out a CME is drawn, AU: as far as it is in flight, in the key and on a card (SW22). It stopped short,
 * at 1.35, while distances were squeezed toward the Earth, which wrapped anything farther into a dome round it;
 * at the solar system's one scale (C32) nothing wraps.
 */
export const DRAWN_REACH_AU = 2;

/** How bright a CME is for its speed: a slow one dimmer, as most of the many in flight at once are. */
export const shellStrength = (speed: number): number => 0.45 + 0.55 * Math.min(Math.max((speed - 300) / 900, 0), 1);

/*
 * ─── THE PLASMA (SW27) ──────────────────────────────────────────────────────
 *
 * A CME's particles are laid out once, in its own cone and as fractions of its front's distance, so the cloud
 * grows as the cone model has it while its front moves out. Each part has its share, its place and its light.
 */
export type PlasmaPart = 'front' | 'cavity' | 'core' | 'shock';
const PARTS: ReadonlyArray<{ part: PlasmaPart; share: number; sizePx: number; light: number }> = [
  // Large and faint, so they blend into a glow, as a coronagraph sees one, rather than reading as dust.
  { part: 'front', share: 0.54, sizePx: 5.5, light: 0.2 },
  { part: 'cavity', share: 0.23, sizePx: 4, light: 0.04 },
  { part: 'core', share: 0.14, sizePx: 6.5, light: 0.3 },
  { part: 'shock', share: 0.09, sizePx: 4, light: 0.07 },
];
/** Particles a CME is drawn with. */
export const PLASMA_PARTICLES = 2600;
/** The shock reaches this much wider than the cloud. */
const SHOCK_WIDER = 1.15;

export interface PlasmaParticle {
  part: PlasmaPart;
  /** From its axis (0) to its edge (1), as a share of the half-angle, and the angle round it, radians. */
  t: number;
  phi: number;
  /** Its distance from the Sun as a share of the front's, and how far in or out of it the ragged edge moves it. */
  f: number;
  ragged: number;
  sizePx: number;
  light: number;
}

/** A seeded random sequence: the same CME is laid out alike every time, so a card draws it alike. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** A CME's particles, laid out by its id. */
export function plasmaParticles(id: string, count = PLASMA_PARTICLES): PlasmaParticle[] {
  const random = seeded(id);
  const out: PlasmaParticle[] = [];
  for (const { part, share, sizePx, light } of PARTS) {
    const n = Math.round(count * share);
    for (let k = 0; k < n; k += 1) {
      // Even over the cone's cap of sky: the share of the half-angle that gives equal areas.
      const t = Math.sqrt(random()) * (part === 'core' ? 0.35 : 1);
      const phi = random() * Math.PI * 2;
      const u = random();
      const f = part === 'front' ? 1 - 0.14 * u * u
        : part === 'cavity' ? 0.45 + 0.41 * u
          : part === 'core' ? 0.32 + 0.16 * u
            : 1.03 + 0.08 * u;
      const ragged = (random() - 0.5) * (part === 'front' ? 0.07 : 0.03);
      out.push({ part, t, phi, f, ragged, sizePx, light: light * (0.7 + 0.6 * random()) });
    }
  }
  return out;
}

/** Where a particle is, AU in the Sun-Earth frame, at `front` from the Sun: the shader's sum without its drift. */
export function plasmaPointAu(cme: Direction, particle: PlasmaParticle, front: number): [number, number, number] {
  const [axis, u, v] = capFrame(cme);
  const theta = (particle.t * cme.halfAngle * Math.PI) / 180 * (particle.part === 'shock' ? SHOCK_WIDER : 1);
  const r = front * (particle.f + particle.ragged * 0.6);
  const d = axis.multiplyScalar(Math.cos(theta)).add(u.multiplyScalar(Math.sin(theta) * Math.cos(particle.phi))).add(v.multiplyScalar(Math.sin(theta) * Math.sin(particle.phi)));
  return [d.x * r, d.y * r, d.z * r];
}

const PART_INDEX: Record<PlasmaPart, number> = { front: 0, cavity: 1, core: 2, shock: 3 };

const vertex = /* glsl */ `
  attribute vec4 spot;   // the share of the half-angle, the angle round, the share of the front, the ragged reach
  attribute vec3 look;   // the part, the size in px, its light
  uniform vec3 axis;
  uniform vec3 across1;
  uniform vec3 across2;
  uniform float halfAngle;
  uniform float front;
  uniform float drift;
  uniform float pixelRatio;
  uniform vec3 xAxis;
  uniform vec3 yAxis;
  uniform vec3 zAxis;
  varying float vPart;
  varying float vLight;
  varying float vFade;
  // The astronomical unit drawn now: the scale in force, gliding (OR9).
  uniform float DRAWN_AU;
  const float REACH = ${DRAWN_REACH_AU.toFixed(2)};
  void main() {
    float theta = spot.x * halfAngle * (look.x > 2.5 ? ${SHOCK_WIDER.toFixed(2)} : 1.0);
    vec3 d = cos(theta) * axis + sin(theta) * (cos(spot.y) * across1 + sin(spot.y) * across2);
    // The ragged edge: each parcel a little in or out of its place, drifting slowly.
    float r = front * (spot.z + spot.w * (0.6 + 0.4 * sin(drift + spot.y * 7.0 + spot.x * 13.0)));
    vec3 p = r * d;
    vec3 g = (p.x - 1.0) * xAxis + p.y * yAxis + p.z * zAxis;
    float drawn = length(g) * DRAWN_AU;
    // Faded within about 120 Earth radii of the Earth, as the rest of the Sun-Earth stretch is, and out at its reach.
    vFade = smoothstep(9000.0, 15000.0, drawn) * (1.0 - smoothstep(REACH - 0.25, REACH, front));
    vPart = look.x;
    vLight = look.z;
    gl_Position = projectionMatrix * viewMatrix * vec4(g * DRAWN_AU, 1.0);
    gl_PointSize = look.y * pixelRatio;
  }
`;
const fragment = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  uniform float earthward;
  varying float vPart;
  varying float vLight;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c) * 4.0;
    if (r2 > 1.0 || vFade <= 0.0) discard;
    float glow = exp(-3.5 * r2);
    // The front white-hot in its speed's colour, whiter when Earth-directed; the cavity dim; the core warmer, the
    // prominence's material; the shock pale.
    vec3 tint = vPart < 0.5 ? mix(color, vec3(1.0), 0.35 + 0.25 * earthward)
      : vPart < 1.5 ? color
      : vPart < 2.5 ? mix(color, vec3(1.0, 0.55, 0.35), 0.55)
      : mix(color, vec3(0.85, 0.9, 1.0), 0.5);
    gl_FragColor = vec4(tint * glow * vLight * vFade * strength, 1.0);
  }
`;

export interface CmePlasma {
  object: THREE.Points;
  /** Its front's distance from the Sun, AU. */
  setFront(au: number): void;
  setBasis(basis: SunEarthBasis): void;
  dispose(): void;
}

/** The plasma's slow drift, from the moment drawn: a capture's still moment, so the same shot makes the same picture. */
export const plasmaDriftAt = (ms: number) => ((ms % 86_400_000) / 1000) * 0.35;

export function createCmePlasma(cme: Cme): CmePlasma {
  const [axis, u, v] = capFrame(cme);
  const particles = plasmaParticles(cme.id);
  const spot = new Float32Array(particles.length * 4);
  const look = new Float32Array(particles.length * 3);
  particles.forEach((p, i) => {
    spot.set([p.t, p.phi, p.f, p.ragged], i * 4);
    look.set([PART_INDEX[p.part], p.sizePx, p.light], i * 3);
  });
  const geometry = new THREE.BufferGeometry();
  // Positions are worked out in the shader; three still wants a position to count the points by.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(particles.length * 3), 3));
  geometry.setAttribute('spot', new THREE.BufferAttribute(spot, 4));
  geometry.setAttribute('look', new THREE.BufferAttribute(look, 3));
  const earthward = earthDirected(cme);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      DRAWN_AU: { value: unitsPerAuNow() },
      axis: { value: axis },
      across1: { value: u },
      across2: { value: v },
      halfAngle: { value: (cme.halfAngle * Math.PI) / 180 },
      front: { value: 0 },
      drift: { value: 0 },
      pixelRatio: { value: 1 },
      xAxis: { value: new THREE.Vector3(1, 0, 0) },
      yAxis: { value: new THREE.Vector3(0, 0, -1) },
      zAxis: { value: new THREE.Vector3(0, 1, 0) },
      // Bytes as authored, written straight out (heatMap.ts): a THREE.Color would be linear light.
      color: { value: new THREE.Vector3(...cmeColour(cme.speed).map((c) => c / 255)) },
      earthward: { value: earthward ? 1 : 0 },
      strength: { value: shellStrength(cme.speed) * (earthward ? 1.3 : 1) },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const object = new THREE.Points(geometry, material);
  object.name = `cme-${cme.id}`;
  object.frustumCulled = false;
  object.onBeforeRender = (renderer) => {
    material.uniforms.DRAWN_AU.value = unitsPerAuNow();
    material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    material.uniforms.drift.value = plasmaDriftAt(stilledAt() ?? Date.now());
  };
  return {
    object,
    setFront(au) { material.uniforms.front.value = au; },
    setBasis(basis) {
      (material.uniforms.xAxis.value as THREE.Vector3).copy(basis.x);
      (material.uniforms.yAxis.value as THREE.Vector3).copy(basis.y);
      (material.uniforms.zAxis.value as THREE.Vector3).copy(basis.z);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
