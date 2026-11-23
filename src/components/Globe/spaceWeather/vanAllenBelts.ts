/**
 * The Van Allen belts (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW5).
 *
 * Two rings of trapped particles round the magnetic equator, drawn as glowing light: the outer belt,
 * of electrons, about 4.5 Earth radii out, and the inner, of protons, about 1.6. Their shape is the
 * dipole's: a particle drifts round the Earth on a shell of field lines, r = L cos²λ, so a point's
 * shell L and magnetic latitude λ say how full the belt is there. Placed round the dipole's axis for
 * the moment shown (geopack's recalc).
 *
 * The outer belt is brightened by the flux of ≥2 MeV electrons GOES measures at geostationary orbit,
 * at its outer edge (NOAA SWPC, five-minute readings), on a log scale; the inner belt has no live
 * measure here and is drawn at a typical brightness, which a card says.
 *
 * Drawn by marching each pixel's ray through a sphere round the Earth (stopping at the ground) and
 * adding the light it passes. From inside the outer belt, where the default view's camera is, it would
 * fog the globe, so it fades in only as the camera draws back past 4 Earth radii, full from 12.
 */
import * as THREE from 'three';
import { RE_UNITS } from './fieldLines';
import { DATA_SCALES } from '../../../styles/tokens';

export const GOES_ELECTRONS_URL = 'https://services.swpc.noaa.gov/json/goes/primary/integral-electrons-1-day.json';
/** The sphere the belts are marched through, Re. */
export const BELT_RADIUS_RE = 7.5;
/** The flux at which the outer belt is a glimmer, and at which it is full, pfu. */
const DIM_PFU = 10;
const FULL_PFU = 10_000;
const DIM_GAIN = 0.15;

export interface GoesElectrons { at: string; flux: number; satellite: number }

/** The newest reading of ≥2 MeV electrons; none if there is none. */
export function parseGoesElectrons(data: unknown): GoesElectrons | null {
  if (!Array.isArray(data)) return null;
  let newest: GoesElectrons | null = null;
  let newestAt = -Infinity;
  for (const row of data as Array<Record<string, unknown>>) {
    const at = typeof row?.time_tag === 'string' ? Date.parse(row.time_tag) : NaN;
    if (row?.energy !== '>=2 MeV' || typeof row.flux !== 'number' || !Number.isFinite(row.flux) || !Number.isFinite(at) || at <= newestAt) continue;
    newestAt = at;
    newest = { at: row.time_tag as string, flux: row.flux, satellite: Number(row.satellite) };
  }
  return newest;
}

/** The outer belt's brightness for a flux, pfu: a glimmer at 10, full at 10,000, on a log scale between. */
export function outerBeltGain(flux: number): number {
  const t = (Math.log10(Math.max(flux, 1e-9)) - Math.log10(DIM_PFU)) / (Math.log10(FULL_PFU) - Math.log10(DIM_PFU));
  return DIM_GAIN + (1 - DIM_GAIN) * Math.min(Math.max(t, 0), 1);
}

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 axis;           // the dipole's northern axis, scene frame
  uniform float outerGain;
  uniform float innerGain;
  uniform vec3 outerColor;
  uniform vec3 innerColor;
  uniform float steps;
  varying vec3 vWorld;
  const float RE = ${RE_UNITS.toFixed(1)};
  const float RB = ${(BELT_RADIUS_RE * RE_UNITS).toFixed(1)};
  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - ro);
    // Through the belts' sphere, from the camera (or where the ray enters) to where it leaves or meets the ground.
    float b = dot(ro, rd);
    float c = dot(ro, ro) - RB * RB;
    float disc = b * b - c;
    if (disc <= 0.0) discard;
    float t0 = max(-b - sqrt(disc), 0.0);
    float t1 = -b + sqrt(disc);
    float ce = dot(ro, ro) - RE * RE;
    float de = b * b - ce;
    if (de > 0.0) {
      float te = -b - sqrt(de);
      if (te > 0.0) t1 = min(t1, te);
    }
    if (t1 <= t0) discard;
    float dt = (t1 - t0) / steps;
    vec3 light = vec3(0.0);
    for (int i = 0; i < 64; i++) {
      if (float(i) >= steps) break;
      vec3 p = ro + rd * (t0 + (float(i) + 0.5) * dt);
      float r = length(p) / RE;
      float s = dot(p / max(length(p), 1e-3), axis);   // sin of the magnetic latitude
      float c2 = max(1.0 - s * s, 1e-3);
      float L = r / c2;                                   // the shell the point is on, r = L cos^2(lat)
      float outer = exp(-pow((L - 4.5) / 1.1, 2.0)) * exp(-s * s / 0.18);
      float inner = exp(-pow((L - 1.6) / 0.3, 2.0)) * exp(-s * s / 0.12);
      light += (outerColor * outer * outerGain + innerColor * inner * innerGain) * (dt / RE);
    }
    // Faded in as the camera draws back, so it does not fog the globe from inside the outer belt.
    float fade = smoothstep(4.0, 12.0, length(ro) / RE);
    gl_FragColor = vec4(light * 0.16 * fade, 1.0);
  }
`;

export interface VanAllenBelts {
  object: THREE.Object3D;
  /** The dipole's northern axis, a unit vector in GEO. */
  setAxis(geo: readonly number[]): void;
  setOuterGain(gain: number): void;
  dispose(): void;
}

/** The belts, marched in `steps` steps a pixel (fewer on a weaker device). */
export function createVanAllenBelts({ steps }: { steps: number }): VanAllenBelts {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      axis: { value: new THREE.Vector3(0, 1, 0) },
      outerGain: { value: DIM_GAIN },
      innerGain: { value: 0.5 },
      outerColor: { value: new THREE.Color(DATA_SCALES.vanAllen.outer) },
      innerColor: { value: new THREE.Color(DATA_SCALES.vanAllen.inner) },
      steps: { value: Math.min(Math.max(Math.round(steps), 8), 64) },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(BELT_RADIUS_RE * RE_UNITS, 48, 24), material);
  mesh.name = 'van-allen-belts';
  mesh.frustumCulled = false;
  return {
    object: mesh,
    // GEO (x, y, z) is the scene's (z, x, y).
    setAxis([x, y, z]) { (material.uniforms.axis.value as THREE.Vector3).set(y, z, x).normalize(); },
    setOuterGain(gain) { material.uniforms.outerGain.value = gain; },
    dispose() { mesh.geometry.dispose(); material.dispose(); },
  };
}
