/**
 * NOAA's ENLIL model of the solar wind, drawn (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW6, SW9, SW18): a glowing
 * disc in the ecliptic round the drawn Sun, out to the model's edge at 1.7 AU, coloured from the values
 * read off NOAA's frames (services/spaceWeather/enlil.ts) in Starcom's palettes, the quiet wind dim
 * and see-through. Two frames are drawn blended by the moment's weight between them, so the disc moves
 * smoothly as the timeline does.
 *
 * Placed as the solar system is, like the solar wind's particles (heliosphereParticles.ts): the
 * Sun-Earth frame aligned to the drawn Sun, at the solar system's one scale about the Earth
 * (bodyPlacement.ts, C32), so ENLIL's Sun falls on the drawn Sun, its Earth on the globe, and its spiral
 * keeps the shape the model gives it beside the planets' true orbits. Faded inside the model's inner edge, at its
 * outer edge, within about 120 Earth radii of the Earth (where the near-Earth flow is drawn at its true
 * scale), and where it is seen edge-on: from the globe's usual views it would be a band across the
 * sky. It shows as the camera draws back above the ecliptic.
 */
import * as THREE from 'three';
import { DATA_SCALES } from '../../../styles/tokens';
import { ENLIL_DISC_AU, ENLIL_PANELS } from '../../../services/spaceWeather/enlil';
import { unitsPerAuNow } from '../../../solar-system/solarScale';
import type { SunEarthBasis } from './heliosphereParticles';

export type EnlilQuantity = 'density' | 'velocity';

/** Each quantity's range: its own bar's. */
export const ENLIL_RANGE: Record<EnlilQuantity, { low: number; high: number }> = {
  density: { low: ENLIL_PANELS.density.bar.low, high: ENLIL_PANELS.density.bar.high },
  velocity: { low: ENLIL_PANELS.velocity.bar.low, high: ENLIL_PANELS.velocity.bar.high },
};

/** How strongly each value glows: not at all at `from`, fully from `full`, rising as a power `gamma` between. */
const GLOW: Record<EnlilQuantity, { from: number; full: number; gamma: number }> = {
  density: { from: 2.5, full: 22, gamma: 1 },
  velocity: { from: 300, full: 700, gamma: 0.8 },
};

/** The tokens' stops as sRGB bytes, as authored: THREE.Color would turn them into linear light (heatMap.ts). */
const STOPS: Record<EnlilQuantity, Array<{ value: number; rgb: number[] }>> = {
  density: DATA_SCALES.enlilDensity.map(([value, hex]) => ({ value, rgb: [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) })),
  velocity: DATA_SCALES.enlilVelocity.map(([value, hex]) => ({ value, rgb: [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)) })),
};

/** A grid's values for the GPU: each over its bar's range in red; alpha, whether the cell holds one. */
export function enlilTexels(grid: Float32Array, quantity: EnlilQuantity): Uint8Array {
  const { low, high } = ENLIL_RANGE[quantity];
  const out = new Uint8Array(grid.length * 4);
  for (let k = 0; k < grid.length; k++) {
    const v = grid[k];
    if (!Number.isFinite(v)) continue;
    out[k * 4] = Math.round(Math.min(Math.max((v - low) / (high - low), 0), 1) * 255);
    out[k * 4 + 3] = 255;
  }
  return out;
}

/** A value's colour, sRGB bytes, and how strongly it glows, 0 to 1. */
export function enlilColour(value: number, quantity: EnlilQuantity): { rgb: [number, number, number]; glow: number } {
  const stops = STOPS[quantity];
  let s = 0;
  while (s < stops.length - 2 && stops[s + 1].value <= value) s++;
  const [a, b] = [stops[s], stops[s + 1]];
  const t = Math.min(Math.max((value - a.value) / (b.value - a.value), 0), 1);
  const { from, full, gamma } = GLOW[quantity];
  return {
    rgb: [0, 1, 2].map((k) => Math.round(a.rgb[k] + (b.rgb[k] - a.rgb[k]) * t)) as [number, number, number],
    glow: Math.min(Math.max((value - from) / (full - from), 0), 1) ** gamma,
  };
}

/** A quantity's palette, 256 steps over its range: the tokens' colours, and in alpha how strongly each glows. */
export function enlilPalette(quantity: EnlilQuantity): Uint8Array {
  const { low, high } = ENLIL_RANGE[quantity];
  const out = new Uint8Array(256 * 4);
  for (let k = 0; k < 256; k++) {
    const { rgb, glow } = enlilColour(low + ((high - low) * k) / 255, quantity);
    out.set([...rgb, Math.round(glow * 255)], k * 4);
  }
  return out;
}

/** Where a place on the disc, AU in the Sun-Earth frame, is drawn: the shader's sum, for tests and probes. */
export function drawnDiscPoint(xAu: number, yAu: number, basis: SunEarthBasis): THREE.Vector3 {
  const g = basis.x.clone().multiplyScalar(xAu - 1).add(basis.y.clone().multiplyScalar(yAu));
  return g.multiplyScalar(unitsPerAuNow());
}

/** The texture coordinate of a place on the disc: grid cell (i, j) at -1.7 AU + i steps, sampled at its texel's centre. */
export function discUv(xAu: number, yAu: number, size: number): [number, number] {
  const cell = (au: number) => ((au / ENLIL_DISC_AU + 1) / 2) * (size - 1);
  return [(cell(xAu) + 0.5) / size, (cell(yAu) + 0.5) / size];
}

/** Rings from the model's inner edge out, and segments round. */
const INNER_AU = 0.1;
const RINGS = 128;
const SEGMENTS = 256;

const vertex = /* glsl */ `
  attribute vec2 au;
  uniform vec3 xAxis;
  uniform vec3 yAxis;
  uniform float gridSize;
  varying vec2 vUv;
  varying float vFade;
  varying vec3 vWorld;
  // The astronomical unit drawn now: the scale in force, gliding (OR9).
  uniform float DRAWN_AU;
  const float EDGE = ${ENLIL_DISC_AU.toFixed(2)};
  void main() {
    vec3 g = (au.x - 1.0) * xAxis + au.y * yAxis;
    float drawn = length(g) * DRAWN_AU;
    vec3 world = g * DRAWN_AU;
    vec2 cell = (au / EDGE + 1.0) * 0.5 * (gridSize - 1.0);
    vUv = (cell + 0.5) / gridSize;
    float r = length(au);
    vFade = smoothstep(${INNER_AU.toFixed(2)}, 0.18, r) * (1.0 - smoothstep(EDGE - 0.15, EDGE, r)) * smoothstep(9000.0, 15000.0, drawn);
    vWorld = world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;
const fragment = /* glsl */ `
  uniform sampler2D before;
  uniform sampler2D after;
  uniform float mixWeight;
  uniform sampler2D palette;
  uniform vec3 zAxis;
  uniform float strength;
  varying vec2 vUv;
  varying float vFade;
  varying vec3 vWorld;
  void main() {
    vec4 a = texture2D(before, vUv);
    vec4 b = texture2D(after, vUv);
    float held = mix(a.a, b.a, mixWeight);
    if (held <= 0.0 || vFade <= 0.0) discard;
    // Each frame's value, its holes left out of the blend.
    float value = mix(a.r / max(a.a, 1e-3), b.r / max(b.a, 1e-3), mixWeight);
    vec4 c = texture2D(palette, vec2(value, 0.5));
    // Seen edge-on, nothing: from near the globe the disc would otherwise be a band across the sky.
    float facing = abs(dot(normalize(cameraPosition - vWorld), zAxis));
    float glow = c.a * held * vFade * smoothstep(0.08, 0.35, facing) * strength;
    gl_FragColor = vec4(c.rgb * glow, 1.0);
  }
`;

const texture = (data: Uint8Array, width: number, height: number) => {
  // Bytes as authored, sampled raw and written straight out, as the heat map's ramp is.
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
};

export interface EnlilDisc {
  object: THREE.Mesh;
  /** Two frames' texels (enlilTexels) and the moment's weight on the second. */
  setFrames(before: Uint8Array, after: Uint8Array, mix: number): void;
  /** The moment moved between the same two frames: only its weight. */
  setMix(mix: number): void;
  setQuantity(quantity: EnlilQuantity): void;
  setBasis(basis: SunEarthBasis): void;
  dispose(): void;
}

export function createEnlilDisc(gridSize: number, quantity: EnlilQuantity = 'density'): EnlilDisc {
  const au = new Float32Array((RINGS + 1) * (SEGMENTS + 1) * 2);
  const index: number[] = [];
  for (let ring = 0; ring <= RINGS; ring++) {
    const r = INNER_AU + ((ENLIL_DISC_AU - INNER_AU) * ring) / RINGS;
    for (let seg = 0; seg <= SEGMENTS; seg++) {
      const a = (2 * Math.PI * seg) / SEGMENTS;
      au.set([r * Math.cos(a), r * Math.sin(a)], (ring * (SEGMENTS + 1) + seg) * 2);
      if (ring < RINGS && seg < SEGMENTS) {
        const k = ring * (SEGMENTS + 1) + seg;
        index.push(k, k + 1, k + SEGMENTS + 1, k + 1, k + SEGMENTS + 2, k + SEGMENTS + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  // Positions are worked out in the shader; three still wants a position to count the vertices by.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(au.length * 1.5), 3));
  geometry.setAttribute('au', new THREE.BufferAttribute(au, 2));
  geometry.setIndex(index);
  const empty = () => texture(new Uint8Array(gridSize * gridSize * 4), gridSize, gridSize);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      DRAWN_AU: { value: unitsPerAuNow() },
      xAxis: { value: new THREE.Vector3(1, 0, 0) },
      yAxis: { value: new THREE.Vector3(0, 0, -1) },
      zAxis: { value: new THREE.Vector3(0, 1, 0) },
      gridSize: { value: gridSize },
      before: { value: empty() },
      after: { value: empty() },
      mixWeight: { value: 0 },
      palette: { value: texture(enlilPalette(quantity), 256, 1) },
      strength: { value: 1 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const object = new THREE.Mesh(geometry, material);
  object.onBeforeRender = () => { material.uniforms.DRAWN_AU.value = unitsPerAuNow(); };
  object.name = 'enlil-disc';
  object.frustumCulled = false;
  const replace = (name: 'before' | 'after' | 'palette', tex: THREE.DataTexture) => {
    (material.uniforms[name].value as THREE.DataTexture).dispose();
    material.uniforms[name].value = tex;
  };
  return {
    object,
    setFrames(before, after, mix) {
      replace('before', texture(before, gridSize, gridSize));
      replace('after', texture(after, gridSize, gridSize));
      material.uniforms.mixWeight.value = mix;
    },
    setMix(mix) { material.uniforms.mixWeight.value = mix; },
    setQuantity(next) { replace('palette', texture(enlilPalette(next), 256, 1)); },
    setBasis(basis) {
      (material.uniforms.xAxis.value as THREE.Vector3).copy(basis.x);
      (material.uniforms.yAxis.value as THREE.Vector3).copy(basis.y);
      (material.uniforms.zAxis.value as THREE.Vector3).copy(basis.z);
    },
    dispose() {
      for (const name of ['before', 'after', 'palette'] as const) (material.uniforms[name].value as THREE.DataTexture).dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
