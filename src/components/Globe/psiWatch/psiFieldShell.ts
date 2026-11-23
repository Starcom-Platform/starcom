/**
 * The ψ field on the globe (decision D-PW, PW57, PW78): one shell over the planet, each pixel looking its own place
 * up in the field's grid, as the temperature heat map and the geoelectric field do (weather/heatMap.ts,
 * spaceWeather/eFieldShell.ts). The grid's 2° cells are one texture of half floats, blended linearly between cells
 * and round the antimeridian: ā, ā without the tides, and G. ψ = √(max(ā, 0)) is taken per pixel, so the veins'
 * edges follow ā's own line through nought: ψ blended between cells stepped along their edges (seen 30 Oct).
 *
 * Four looks, each its own dimension, drawn alone or together (PW57):
 *   - heat: ψ in Psi Watch's aqua, from a deep sea-green where faint to the aqua where it condenses; where ψ is
 *     nought, nothing, so the planet shows between the veins;
 *   - contours: a line at each tenth of ψ;
 *   - relief: G, the slow drive beneath (the geoid's ridges and valleys, the spreading ridges, the core's null-flux
 *     line, the coasts), raised, and shaded by its own slope as a hillshade is, in gunmetal;
 *   - flow: the tides' share of ψ, aqua where they raise it and violet where they lower it, its crests drifting west
 *     as the Earth turns under the Moon and the Sun.
 * A still holds the crests at its own moment (captureClock). The shell clips to its half while the globe is split.
 */
import * as THREE from 'three';
import { stilledAt } from '../../../globe-engine/captureClock';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import type { PsiFieldLooks } from '../../../services/psiWatch/psiField/psiFieldLooks';
import { PSI_GRID } from '../../../services/psiWatch/psiField/grid';

const RAMP_TEXELS = 256;
/** How far the relief raises the strongest drive, as a share of the radius: about 130 km, to be seen. */
export const PSI_RELIEF_MAX = 0.02;
/** The tides' share at which the flow's tint is full. */
export const PSI_FLOW_FULL = 0.12;

const STOPS = DATA_SCALES.psiField.map(([psi, color]) => ({ psi, rgb: [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16)) }));

/** The heat's colour at a value of ψ, as sRGB bytes, blended between its stops (not through THREE.Color: heatMap.ts says why). */
export function psiRgb(psi: number): [number, number, number] {
  const v = Math.min(Math.max(psi, STOPS[0].psi), STOPS[STOPS.length - 1].psi);
  let i = 0;
  while (i < STOPS.length - 2 && v > STOPS[i + 1].psi) i++;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const t = (v - a.psi) / (b.psi - a.psi);
  return [0, 1, 2].map((k) => Math.round(a.rgb[k] + (b.rgb[k] - a.rgb[k]) * t)) as [number, number, number];
}

const toVec3 = (hex: string) => new THREE.Vector3(...[1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255));

function rampTexture(): THREE.DataTexture {
  const data = new Uint8Array(RAMP_TEXELS * 4);
  for (let i = 0; i < RAMP_TEXELS; i++) data.set([...psiRgb(i / (RAMP_TEXELS - 1)), 255], i * 4);
  const tex = new THREE.DataTexture(data, RAMP_TEXELS, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Each cell as ā, ā without the tides, G, 1; rows from the south. */
export function psiTextureData(field: { mean: ArrayLike<number>; calmMean: ArrayLike<number>; structure: ArrayLike<number> }): Float32Array {
  const data = new Float32Array(field.mean.length * 4);
  for (let i = 0; i < field.mean.length; i++) data.set([field.mean[i], field.calmMean[i], field.structure[i], 1], i * 4);
  return data;
}

function fieldTexture(field: Parameters<typeof psiTextureData>[0]): THREE.DataTexture {
  const half = Uint16Array.from(psiTextureData(field), (v) => THREE.DataUtils.toHalfFloat(v));
  const tex = new THREE.DataTexture(half, PSI_GRID.cols, PSI_GRID.rows, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  // Round the antimeridian, the last column blends into the first.
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Two vertices a degree, so the relief follows its 350 km bands. */
const SEGMENTS_PER_CELL = 2;

function shellGeometry(radius: number): THREE.BufferGeometry {
  const nx = PSI_GRID.cols * SEGMENTS_PER_CELL;
  const ny = PSI_GRID.rows * SEGMENTS_PER_CELL;
  const positions = new Float32Array((nx + 1) * (ny + 1) * 3);
  const normals = new Float32Array(positions.length);
  for (let j = 0; j <= ny; j++) {
    const lat = (-90 + (j * PSI_GRID.step) / SEGMENTS_PER_CELL) * (Math.PI / 180);
    for (let i = 0; i <= nx; i++) {
      const lng = (-180 + (i * PSI_GRID.step) / SEGMENTS_PER_CELL) * (Math.PI / 180);
      // The scene's frame (latLngToGlobeWorld): x = cos φ sin λ, y = sin φ, z = cos φ cos λ.
      const d = [Math.cos(lat) * Math.sin(lng), Math.sin(lat), Math.cos(lat) * Math.cos(lng)];
      positions.set(d.map((v) => v * radius), (j * (nx + 1) + i) * 3);
      normals.set(d, (j * (nx + 1) + i) * 3);
    }
  }
  const index: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i;
    const b = a + 1;
    const c = a + nx + 1;
    const d = c + 1;
    index.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return geometry;
}

const SAMPLE_FIELD = /* glsl */ `
  uniform sampler2D field;
  uniform vec2 origin;     // lon0, lat0: the south-west cell's centre
  uniform float step;      // degrees a cell
  uniform vec2 gridSize;   // columns, rows
  // ā, ā without the tides, G.
  vec3 fieldAt(vec2 lngLat) {
    vec2 uv = vec2(((lngLat.x - origin.x) / step + 0.5) / gridSize.x, ((lngLat.y - origin.y) / step + 0.5) / gridSize.y);
    return texture2D(field, uv).rgb;
  }
  vec2 lngLatOf(vec3 p) {
    vec3 d = normalize(p);
    return vec2(degrees(atan(d.x, d.z)), degrees(asin(clamp(d.y, -1.0, 1.0))));
  }
`;

const vertexShader = /* glsl */ `
  #include <common>
  #include <clipping_planes_pars_vertex>
  uniform vec4 looks;      // heat, contours, relief, flow: 1 on
  uniform float reliefMax;
  ${SAMPLE_FIELD}
  varying vec3 vDir;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;
  void main() {
    vDir = normalize(position);
    vec3 placed = position;
    if (looks.z > 0.5) placed = position * (1.0 + reliefMax * fieldAt(lngLatOf(position)).b);
    vViewNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(placed, 1.0);
    vViewPosition = mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <clipping_planes_pars_fragment>
  uniform sampler2D ramp;
  uniform vec4 looks;      // heat, contours, relief, flow: 1 on
  uniform float opacity;
  uniform float time;      // seconds, for the flow's crests
  uniform float flowFull;
  uniform vec3 raised;
  uniform vec3 lowered;
  uniform vec3 reliefLow;
  uniform vec3 reliefHigh;
  uniform vec3 lineColor;
  ${SAMPLE_FIELD}
  varying vec3 vDir;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  // One colour laid over another, neither premultiplied.
  void over(inout vec3 c, inout float a, vec3 top, float topA) {
    float outA = topA + a * (1.0 - topA);
    c = outA > 0.0 ? (top * topA + c * a * (1.0 - topA)) / outA : top;
    a = outA;
  }

  void main() {
    #include <clipping_planes_fragment>
    vec2 lngLat = lngLatOf(vDir);
    vec3 f = fieldAt(lngLat);
    float psi = sqrt(max(f.r, 0.0));
    float calm = sqrt(max(f.g, 0.0));
    vec3 color = vec3(0.0);
    float alpha = 0.0;

    if (looks.z > 0.5) {
      // The relief, a hillshade: G's slope over three degrees each way, lit from the north-west.
      float d = step * 0.75;
      float east = d / max(cos(radians(lngLat.y)), 0.2);
      float slopeE = fieldAt(lngLat + vec2(east, 0.0)).b - fieldAt(lngLat - vec2(east, 0.0)).b;
      float slopeN = fieldAt(lngLat + vec2(0.0, d)).b - fieldAt(lngLat - vec2(0.0, d)).b;
      float shade = clamp(0.75 + 2.4 * (slopeE - slopeN), 0.2, 1.6);
      over(color, alpha, mix(reliefLow, reliefHigh, f.b) * shade, opacity * 0.95 * smoothstep(0.1, 0.45, f.b));
    }
    if (looks.x > 0.5 && psi > 0.0) {
      float t = clamp(psi, 0.0, 1.0);
      over(color, alpha, texture2D(ramp, vec2(t, 0.5)).rgb, opacity * smoothstep(0.0, 0.12, psi) * (0.6 + 0.4 * t));
    }
    if (looks.w > 0.5) {
      // The tides' share: aqua where they raise ψ, violet where they lower it; crests drifting west.
      float d = psi - calm;
      // Faded where the field is faint: at its edge both roots rise steeply, and their difference with them.
      float strength = clamp(abs(d) / flowFull, 0.0, 1.0) * smoothstep(0.0, 0.2, max(psi, calm));
      float crest = fract(lngLat.x / 8.0 + time * 0.25);
      float band = smoothstep(0.62, 0.82, crest) * (1.0 - smoothstep(0.82, 1.0, crest));
      over(color, alpha, d > 0.0 ? raised : lowered, opacity * strength * (0.35 + 0.55 * band));
    }
    if (looks.y > 0.5 && psi > 0.0) {
      // A line at each tenth of ψ, the half stronger; where ψ changes by much of a step a pixel, none.
      float v = psi * 10.0;
      float w = max(fwidth(v), 1e-4);
      // None at nought: the veins' edge, where ψ rises steepest, would draw as a hard rim.
      float line = (1.0 - smoothstep(0.0, 1.2 * w, abs(fract(v - 0.5) - 0.5))) * (1.0 - smoothstep(0.35, 0.7, w)) * smoothstep(0.5, 0.8, v);
      float half_ = abs(fract(v / 5.0 - 0.5) - 0.5) * 5.0 < 0.5 ? 1.0 : 0.7;
      over(color, alpha, lineColor, opacity * line * half_);
    }

    // Softened toward the limb.
    float facing = dot(normalize(vViewNormal), normalize(-vViewPosition));
    alpha *= smoothstep(0.0, 0.3, facing);
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface PsiFieldShell {
  mesh: THREE.Mesh;
  /** A newer moment's field. */
  setField(field: Parameters<typeof psiTextureData>[0]): void;
  setLooks(looks: PsiFieldLooks): void;
  setOpacity(opacity: number): void;
  dispose(): void;
}

export function createPsiFieldShell(initial: Parameters<typeof psiTextureData>[0], options: { radius: number; looks: PsiFieldLooks; opacity?: number }): PsiFieldShell {
  const ramp = rampTexture();
  let texture = fieldTexture(initial);
  const lookVector = (looks: PsiFieldLooks) => new THREE.Vector4(+looks.heat, +looks.contours, +looks.relief, +looks.flow);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      field: { value: texture },
      ramp: { value: ramp },
      origin: { value: new THREE.Vector2(PSI_GRID.lon0, PSI_GRID.lat0) },
      step: { value: PSI_GRID.step },
      gridSize: { value: new THREE.Vector2(PSI_GRID.cols, PSI_GRID.rows) },
      looks: { value: lookVector(options.looks) },
      opacity: { value: options.opacity ?? 0.85 },
      time: { value: 0 },
      flowFull: { value: PSI_FLOW_FULL },
      reliefMax: { value: PSI_RELIEF_MAX },
      raised: { value: toVec3(DATA_SCALES.psiWatch) },
      lowered: { value: toVec3(DATA_SCALES.psiGround) },
      reliefLow: { value: toVec3(GUNMETAL[500]) },
      reliefHigh: { value: toVec3(GUNMETAL[100]) },
      lineColor: { value: toVec3(DATA_SCALES.psiField[DATA_SCALES.psiField.length - 1][1]) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    clipping: true,
  });
  const mesh = new THREE.Mesh(shellGeometry(options.radius), material);
  mesh.name = 'psi-field';
  // Raised by the relief in the shader: three.js cannot bound it from the sphere alone.
  mesh.frustumCulled = false;
  // The crests' clock: a still's own moment while one is held, the page's otherwise.
  mesh.onBeforeRender = () => {
    material.uniforms.time.value = ((stilledAt() ?? performance.now()) / 1000) % 1000;
  };

  return {
    mesh,
    setField(field) {
      texture.dispose();
      texture = fieldTexture(field);
      material.uniforms.field.value = texture;
    },
    setLooks(looks) { material.uniforms.looks.value = lookVector(looks); },
    setOpacity(next) { material.uniforms.opacity.value = next; },
    dispose() {
      mesh.geometry.dispose();
      texture.dispose();
      ramp.dispose();
      material.dispose();
    },
  };
}
