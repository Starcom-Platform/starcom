/**
 * The aurora as NOAA's OVATION forecasts it (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW3).
 *
 * Two things drawn from the one grid (services/spaceWeather/ovation.ts):
 *
 * - **The band**: the chance of aurora overhead, on the ground of both polar
 *   regions, glowing: each pixel looks its own place up in a texture of the
 *   grid that already holds the key's colour for each chance, sharp, and again
 *   in a coarser mip for a soft halo, and the two are added.
 * - **The curtain**: on the night side only, a ribbon of light rising from the
 *   oval's middle, higher where the chance is greater, in the chance's colour,
 *   its top turning toward the key's strongest where the chance is better than
 *   even, as a strong aurora's red top does; flickering in rays. Drawn to show
 *   the aurora where it can be seen; its height stands for the chance, not a
 *   measure.
 *
 * Its colours are a reading scale in the tokens (DATA_SCALES.auroraPercent),
 * worked out here rather than in the shaders, so what is drawn is the key's.
 */
import * as THREE from 'three';
import type { OvalPoint, OvationGrid } from '../../../services/spaceWeather/ovation';
import { DATA_SCALES } from '../../../styles/tokens';

const GLOBE_RADIUS_UNITS = 100;
const STOPS = DATA_SCALES.auroraPercent.map(([percent, color]) => ({ percent, rgb: [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16)) }));
/** The chance from which the band glows, and at which it is at full glow, percent. */
const GLOW_FROM = 1;
const GLOW_FULL = 12;
/** The chance from which a curtain's top turns toward the key's strongest, and at which it is there. */
const RED_TOP_FROM = 50;
const RED_TOP_FULL = 90;
/** Where the band lies: a hair over the ground, as the e-field does. */
const BAND_RADIUS = 1.002;
/** The curtain's foot, a share of the radius above the centre: about 100 km up, where an aurora's light begins. */
export const CURTAIN_FOOT = 1.016;
/** Its height over its foot, a share of the radius: a faint chance's, and the strongest's (about 75 and 290 km). */
export const CURTAIN_BASE = 0.012;
export const CURTAIN_MAX = 0.045;
/** The chance at which the curtain is at its tallest. */
const CURTAIN_FULL_AT = 40;

/** The colour for a chance, percent, as sRGB bytes, blended between the token's stops. */
export function auroraRgb(percent: number): [number, number, number] {
  const p = Math.min(Math.max(percent, STOPS[0].percent), STOPS[STOPS.length - 1].percent);
  let i = 0;
  while (i < STOPS.length - 2 && p > STOPS[i + 1].percent) i++;
  const a = STOPS[i], b = STOPS[i + 1];
  const t = (p - a.percent) / (b.percent - a.percent);
  return [0, 1, 2].map((k) => Math.round(a.rgb[k] + (b.rgb[k] - a.rgb[k]) * t)) as [number, number, number];
}

const smoothstep = (from: number, to: number, x: number): number => {
  const t = Math.min(Math.max((x - from) / (to - from), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * The band's texel for a chance, percent, as RGBA bytes: the key's colour for it, and how much it
 * glows, the colour premultiplied by the glow so a halo blurred from it keeps its hue.
 */
export function bandTexel(percent: number): [number, number, number, number] {
  const alpha = Math.round(smoothstep(GLOW_FROM, GLOW_FULL, percent) * 255);
  const [r, g, b] = auroraRgb(percent).map((v) => Math.round((v * alpha) / 255));
  return [r, g, b, alpha];
}

/** A curtain's colours where the chance is `peak`, percent, as sRGB bytes: at its foot, and at its top. */
export function curtainColours(peak: number): { foot: [number, number, number]; top: [number, number, number] } {
  const foot = auroraRgb(peak);
  const strongest = auroraRgb(RED_TOP_FULL);
  const t = Math.min(Math.max((peak - RED_TOP_FROM) / (RED_TOP_FULL - RED_TOP_FROM), 0), 1);
  return { foot, top: [0, 1, 2].map((k) => Math.round(foot[k] + (strongest[k] - foot[k]) * t)) as [number, number, number] };
}

/** The grid as the band's texture (bandTexel for each cell), with mips for the halo; wrapping east-west. */
function bandTexture(grid: OvationGrid): THREE.DataTexture {
  const data = new Uint8Array(grid.values.length * 4);
  for (let k = 0; k < grid.values.length; k++) data.set(bandTexel(grid.values[k]), k * 4);
  const tex = new THREE.DataTexture(data, 360, 181, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const toScene = (lat: number, lng: number, radius: number): [number, number, number] => {
  const phi = (lat * Math.PI) / 180, lambda = (lng * Math.PI) / 180;
  return [radius * Math.cos(phi) * Math.sin(lambda), radius * Math.sin(phi), radius * Math.cos(phi) * Math.cos(lambda)];
};

/** A cap over one polar region, from 30° of latitude to the pole: where an aurora can be. */
function capGeometry(hemisphere: 'north' | 'south'): THREE.BufferGeometry {
  const rows = 60, cols = 180;
  const positions: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const lat = hemisphere === 'north' ? 30 + j : -30 - j;
    for (let i = 0; i <= cols; i++) positions.push(...toScene(lat, -180 + i * 2, GLOBE_RADIUS_UNITS * BAND_RADIUS));
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
    index.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

const bandVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const bandFragment = /* glsl */ `
  uniform sampler2D band;
  uniform float opacity;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float lat = degrees(asin(clamp(d.y, -1.0, 1.0)));
    float lng = degrees(atan(d.x, d.z));
    // Column i is longitude i° east, row j latitude j - 90°.
    vec2 uv = vec2((mod(lng, 360.0) + 0.5) / 360.0, (lat + 90.0 + 0.5) / 181.0);
    vec4 core = texture2D(band, uv);
    // The halo: the same field at a coarser mip, soft round the band.
    vec4 halo = texture2D(band, uv, 2.5);
    if (core.a + 0.5 * halo.a < 0.01) discard;
    gl_FragColor = vec4((core.rgb + 0.5 * halo.rgb) * opacity, 1.0);
  }
`;

/** One curtain's points, round its oval: where it stands, how strong it is there, and how tall. */
export interface CurtainPoint { lng: number; lat: number; peak: number; height: number }

/**
 * The curtain's path round one hemisphere's oval, closed (the first point again at 360°): at each
 * longitude the oval's middle, and where a longitude has no aurora, the line carried on between
 * the latitudes either side, unlit. None where the hemisphere has no aurora at all.
 */
export function curtainPath(oval: readonly OvalPoint[]): CurtainPoint[] {
  const known = oval.filter((p) => p.lat !== null) as Array<OvalPoint & { lat: number }>;
  if (!known.length) return [];
  const latAt = (lng: number): number => {
    const before = [...known].reverse().find((p) => p.lng <= lng) ?? { ...known[known.length - 1], lng: known[known.length - 1].lng - 360 };
    const after = known.find((p) => p.lng >= lng) ?? { ...known[0], lng: known[0].lng + 360 };
    if (after.lng === before.lng) return before.lat;
    return before.lat + ((after.lat - before.lat) * (lng - before.lng)) / (after.lng - before.lng);
  };
  const points = oval.map((p) => {
    const height = CURTAIN_BASE + (CURTAIN_MAX - CURTAIN_BASE) * Math.min(p.peak / CURTAIN_FULL_AT, 1);
    return { lng: p.lng, lat: p.lat ?? latAt(p.lng), peak: p.peak, height };
  });
  return [...points, { ...points[0], lng: 360 }];
}

const curtainVertex = /* glsl */ `
  attribute float rise;    // 0 at the foot, 1 at the top
  attribute float peak;    // the chance there, percent
  attribute float along;   // degrees round the oval, for the rays
  attribute vec3 footColor;
  attribute vec3 topColor;
  varying float vRise;
  varying vec3 vFoot;
  varying vec3 vTop;
  varying float vPeak;
  varying float vAlong;
  varying vec3 vWorld;
  void main() {
    vRise = rise;
    vPeak = peak;
    vAlong = along;
    vFoot = footColor;
    vTop = topColor;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const curtainFragment = /* glsl */ `
  uniform vec3 sunDirection;  // toward the Sun, in the scene's frame
  uniform float time;
  uniform float opacity;
  varying float vRise;
  varying float vPeak;
  varying float vAlong;
  varying vec3 vWorld;
  varying vec3 vFoot;
  varying vec3 vTop;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  float noise(float x) { float i = floor(x); float f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
  void main() {
    // On the night side only, fading in across the terminator.
    float night = smoothstep(0.1, -0.15, dot(normalize(vWorld), normalize(sunDirection)));
    float strength = smoothstep(2.0, 15.0, vPeak);
    if (night * strength < 0.01) discard;
    // Rays: bright folds drifting along the curtain, flickering.
    float rays = 0.55 + 0.45 * noise(vAlong * 1.7 + time * 0.6) * (0.7 + 0.3 * noise(vAlong * 9.0 - time * 2.3));
    // Bright at the foot, fading up; its top in the top's colour.
    float fade = pow(1.0 - vRise, 1.6) * smoothstep(0.0, 0.08, vRise);
    vec3 color = mix(vFoot, vTop, smoothstep(0.45, 1.0, vRise));
    float a = night * strength * rays * fade * opacity;
    gl_FragColor = vec4(color * a, 1.0);
  }
`;

function curtainGeometry(path: readonly CurtainPoint[]): THREE.BufferGeometry {
  const positions: number[] = [], rise: number[] = [], peak: number[] = [], along: number[] = [], foot: number[] = [], top: number[] = [];
  for (const p of path) {
    positions.push(...toScene(p.lat, p.lng, GLOBE_RADIUS_UNITS * CURTAIN_FOOT), ...toScene(p.lat, p.lng, GLOBE_RADIUS_UNITS * (CURTAIN_FOOT + p.height)));
    rise.push(0, 1);
    peak.push(p.peak, p.peak);
    along.push(p.lng, p.lng);
    const colours = curtainColours(p.peak);
    const f = colours.foot.map((b) => b / 255), t = colours.top.map((b) => b / 255);
    foot.push(...f, ...f);
    top.push(...t, ...t);
  }
  const index: number[] = [];
  for (let k = 0; k < path.length - 1; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    index.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('rise', new THREE.Float32BufferAttribute(rise, 1));
  geometry.setAttribute('peak', new THREE.Float32BufferAttribute(peak, 1));
  geometry.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute('footColor', new THREE.Float32BufferAttribute(foot, 3));
  geometry.setAttribute('topColor', new THREE.Float32BufferAttribute(top, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

export interface AuroraDrawing {
  /** The band and the curtains, to add to the scene. */
  object: THREE.Group;
  /** A newer forecast. */
  setGrid(grid: OvationGrid, paths: { north: CurtainPoint[]; south: CurtainPoint[] }): void;
  /** Toward the Sun, in the scene's frame: where the curtains are lit. */
  setSun(direction: THREE.Vector3): void;
  /** Seconds, for the rays: the clock live, a still's own moment on a card. */
  setTime(seconds: number): void;
  /** The curtain drawn, or the band alone (SW2). */
  setCurtain(shown: boolean): void;
  dispose(): void;
}

export function createAurora(grid: OvationGrid, paths: { north: CurtainPoint[]; south: CurtainPoint[] }, options: { opacity?: number } = {}): AuroraDrawing {
  let band = bandTexture(grid);
  const group = new THREE.Group();
  group.name = 'aurora';
  // Added light: a glow, never a shade over what is under it.
  const bandMaterial = new THREE.ShaderMaterial({
    uniforms: { band: { value: band }, opacity: { value: options.opacity ?? 0.9 } },
    vertexShader: bandVertex,
    fragmentShader: bandFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const bands = (['north', 'south'] as const).map((h) => {
    const mesh = new THREE.Mesh(capGeometry(h), bandMaterial);
    mesh.name = `aurora-band-${h}`;
    group.add(mesh);
    return mesh;
  });
  const curtainMaterial = new THREE.ShaderMaterial({
    uniforms: { sunDirection: { value: new THREE.Vector3(1, 0, 0) }, time: { value: 0 }, opacity: { value: options.opacity ?? 0.9 } },
    vertexShader: curtainVertex,
    fragmentShader: curtainFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const curtains = new Map<'north' | 'south', THREE.Mesh>();
  let curtainShown = true;
  const drawCurtains = (next: { north: CurtainPoint[]; south: CurtainPoint[] }) => {
    for (const h of ['north', 'south'] as const) {
      const old = curtains.get(h);
      if (old) { group.remove(old); old.geometry.dispose(); curtains.delete(h); }
      if (next[h].length < 2) continue;
      const mesh = new THREE.Mesh(curtainGeometry(next[h]), curtainMaterial);
      mesh.name = `aurora-curtain-${h}`;
      // After the band, so the curtain's light is added over it.
      mesh.renderOrder = 1;
      mesh.visible = curtainShown;
      group.add(mesh);
      curtains.set(h, mesh);
    }
  };
  drawCurtains(paths);

  return {
    object: group,
    setGrid(next, nextPaths) {
      band.dispose();
      band = bandTexture(next);
      bandMaterial.uniforms.band.value = band;
      drawCurtains(nextPaths);
    },
    setSun(direction) { curtainMaterial.uniforms.sunDirection.value.copy(direction); },
    setTime(seconds) { curtainMaterial.uniforms.time.value = seconds; },
    setCurtain(shown) {
      curtainShown = shown;
      for (const mesh of curtains.values()) mesh.visible = shown;
    },
    dispose() {
      for (const mesh of bands) mesh.geometry.dispose();
      for (const mesh of curtains.values()) mesh.geometry.dispose();
      band.dispose();
      bandMaterial.dispose();
      curtainMaterial.dispose();
    },
  };
}
