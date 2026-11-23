/**
 * The geoelectric field's direction as flowing streaks (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW1).
 *
 * The wind's flow (weather/windFlow.ts), over a region rather than the planet:
 * particles live in a float texture (longitude, latitude, age, seed), moved every
 * frame on the GPU along the field at their place, and each is drawn as a comet
 * whose head points the way the field points. They start only where a model holds
 * the grid, and start afresh when they drift off it, so no streak is drawn where
 * nobody measured the field. A stronger field moves them faster and draws them
 * longer and brighter, on a log scale, as the colours are: a quiet field's few
 * mV/km and a storm's thousands both read.
 *
 * A sibling of the wind's flow rather than a change to it: the wind is global, on
 * the GFS grid, in m/s, and its cards are kept as goldens.
 *
 * The field is the shell's texture (eFieldShell.eFieldTexture): east and north,
 * premultiplied by the coverage in its third channel.
 */
import * as THREE from 'three';
import { GPUComputationRenderer, type Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import type { EFieldGrid } from '../../../services/spaceWeather/eFieldGrid';
import { GUNMETAL } from '../../../styles/tokens';

const GLOBE_RADIUS_UNITS = 100;
/** Degrees a second a streak moves for each decade of mV/km above one, plus a floor so a quiet field still flows. */
const SPEED_DEG_S = 0.35;
/** A particle lives this long, plus up to as long again, then starts afresh. */
const LIFE_S = 3;

const SAMPLE_FIELD = /* glsl */ `
  uniform sampler2D field;
  uniform vec2 origin;    // lon0, lat0: the south-west cell's centre
  uniform float cell;     // degrees a cell
  uniform vec2 gridSize;  // columns, rows
  // The field at a place: east and north in mV/km, and how far a model holds it (0 to 1).
  vec3 fieldAt(vec2 lonLat) {
    vec2 uv = vec2(((lonLat.x - origin.x) / cell + 0.5) / gridSize.x, ((lonLat.y - origin.y) / cell + 0.5) / gridSize.y);
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
    vec4 s = texture2D(field, uv);
    return s.b > 0.02 ? vec3(s.rg / s.b, s.b) : vec3(0.0);
  }
  // How fast a field of this strength moves a streak, in degrees a second: a decade of mV/km at a time.
  float paceOf(float mvkm) { return 0.3 + log(1.0 + mvkm) / log(10.0); }
`;

const computeShader = /* glsl */ `
  uniform float dt;
  uniform float time;
  uniform float speed;
  uniform float life;
  ${SAMPLE_FIELD}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  // A place in the grid's box, spread by the hashes: the caller keeps it only where a model holds the field.
  vec2 placeIn(float a, float b) {
    vec2 span = (gridSize - 1.0) * cell + cell;
    return origin - 0.5 * cell + vec2(a, b) * span;
  }
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 s = texture2D(textureState, uv);
    vec3 f = fieldAt(s.xy);
    float mag = length(f.xy);
    vec2 dir = mag > 1e-4 ? f.xy / mag : vec2(0.0);
    float coslat = max(cos(radians(s.y)), 0.08);
    vec2 next = s.xy + vec2(dir.x / coslat, dir.y) * speed * paceOf(mag) * dt;
    float age = s.z + dt;
    float span = life * (1.0 + s.w);
    if (age > span || fieldAt(next).z < 0.3) {
      // Start afresh at a place the field covers: four tries, then wherever the last one fell (drawn faint, or not at all).
      for (int k = 0; k < 4; k++) {
        float a = hash(vec2(s.w * 91.7 + float(k) * 3.1, time));
        float b = hash(vec2(time + float(k) * 7.3, s.w * 17.3 + uv.x));
        next = placeIn(a, b);
        if (fieldAt(next).z > 0.5) break;
      }
      age = 0.0;
    }
    gl_FragColor = vec4(next, age, s.w);
  }
`;

const streakVertex = /* glsl */ `
  uniform sampler2D state;
  uniform float radius;
  uniform vec2 viewport;
  uniform float widthPx;
  uniform float life;
  attribute vec2 ref;
  attribute float end;   // 0 at the tail, 1 at the head
  attribute float side;  // -1 or 1, across the streak
  varying float vAlpha;
  varying float vEnd;
  ${SAMPLE_FIELD}
  vec3 toScene(vec2 lonLat) {
    float lat = radians(lonLat.y), lng = radians(lonLat.x);
    return radius * vec3(cos(lat) * sin(lng), sin(lat), cos(lat) * cos(lng));
  }
  void main() {
    vec4 s = texture2D(state, ref);
    vec3 f = fieldAt(s.xy);
    float mag = length(f.xy);
    float coslat = max(cos(radians(s.y)), 0.08);
    // The tail trails the head along the field, longer where it is stronger.
    vec2 back = mag > 1e-4 ? (f.xy / mag) * (0.6 + 0.6 * paceOf(mag)) : vec2(0.0);
    vec2 tail = s.xy - vec2(back.x / coslat, back.y);
    vec4 headClip = projectionMatrix * modelViewMatrix * vec4(toScene(s.xy), 1.0);
    vec4 tailClip = projectionMatrix * modelViewMatrix * vec4(toScene(tail), 1.0);
    vec4 clip = mix(tailClip, headClip, end);
    vec2 dir = normalize((headClip.xy / headClip.w - tailClip.xy / tailClip.w) * viewport + 1e-6);
    vec2 across = vec2(-dir.y, dir.x) * side * widthPx / viewport;
    gl_Position = clip + vec4(across * clip.w, 0.0, 0.0);
    float span = life * (1.0 + s.w);
    float fade = smoothstep(0.0, 0.5, s.z) * (1.0 - smoothstep(span - 0.7, span, s.z));
    // Lighter than the wind's: over a coloured field, brighter streaks read as hatching (a card of 2026-10-10).
    vAlpha = fade * smoothstep(0.3, 0.6, f.z) * clamp(0.22 + 0.2 * paceOf(mag), 0.0, 0.8);
    vEnd = end;
  }
`;

const streakFragment = /* glsl */ `
  uniform vec3 color;
  varying float vAlpha;
  varying float vEnd;
  void main() {
    // A comet: brightest at the head, gone at the tail.
    gl_FragColor = vec4(color, vAlpha * vEnd * vEnd);
  }
`;

export interface EFieldFlow {
  /** The streaks, to add to the scene. */
  object: THREE.Mesh;
  /** Moves every particle on by dt seconds (capped at a thirtieth of a second). */
  step(dt: number): void;
  /** A newer grid: its texture, and where particles start. */
  setGrid(grid: EFieldGrid, texture: THREE.Texture): void;
  /** How fast the streaks move, as a share of their default (SW2). */
  setSpeed(share: number): void;
  /** Particles back to where a seed puts them, then moved on: the same moment draws the same streaks. */
  settle(seedTime: number, steps: number): void;
  dispose(): void;
}

export class EFieldFlowUnsupported extends Error {}

/** Particles in a side × side grid, over the field's grid at `texture`. */
export function createEFieldFlow(
  renderer: THREE.WebGLRenderer,
  initial: { grid: EFieldGrid; texture: THREE.Texture },
  options: { side: number; radiusFraction: number; speed?: number },
): EFieldFlow {
  const { side } = options;
  let grid = initial.grid;
  const gpu = new GPUComputationRenderer(side, side, renderer);
  const seeded = gpu.createTexture();
  seedParticles(seeded.image.data as Float32Array, 0, grid);
  const variable: Variable = gpu.addVariable('textureState', computeShader, seeded);
  gpu.setVariableDependencies(variable, [variable]);
  const cu = variable.material.uniforms;
  const fieldUniforms = () => ({
    field: { value: initial.texture },
    origin: { value: new THREE.Vector2(grid.lon0, grid.lat0) },
    cell: { value: grid.step },
    gridSize: { value: new THREE.Vector2(grid.cols, grid.rows) },
  });
  Object.assign(cu, fieldUniforms(), {
    dt: { value: 0 },
    time: { value: 0 },
    speed: { value: SPEED_DEG_S * (options.speed ?? 1) },
    life: { value: LIFE_S },
  });
  const error = gpu.init();
  if (error) {
    gpu.dispose();
    throw new EFieldFlowUnsupported(`This device's GPU cannot draw the e-field's streaks: ${error}`);
  }

  // One quad per particle, its corners told apart by end (tail or head) and side.
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
  quad.setAttribute('end', new THREE.Float32BufferAttribute([0, 0, 1, 1], 1));
  quad.setAttribute('side', new THREE.Float32BufferAttribute([-1, 1, -1, 1], 1));
  quad.setIndex([0, 2, 1, 2, 3, 1]);
  const refs = new Float32Array(side * side * 2);
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
    refs[(j * side + i) * 2] = (i + 0.5) / side;
    refs[(j * side + i) * 2 + 1] = (j + 0.5) / side;
  }
  quad.setAttribute('ref', new THREE.InstancedBufferAttribute(refs, 2));
  quad.instanceCount = side * side;
  // Placed by the shader, so three.js cannot bound them: never cull.
  quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GLOBE_RADIUS_UNITS * 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...fieldUniforms(),
      state: { value: gpu.getCurrentRenderTarget(variable).texture },
      radius: { value: GLOBE_RADIUS_UNITS * options.radiusFraction },
      viewport: { value: new THREE.Vector2(1, 1) },
      widthPx: { value: 1.5 },
      life: { value: LIFE_S },
      // The authored bytes, not through THREE.Color (heatMap.ts says why).
      color: { value: new THREE.Vector3(...[1, 3, 5].map((k) => parseInt(GUNMETAL[100].slice(k, k + 2), 16) / 255)) },
    },
    vertexShader: streakVertex,
    fragmentShader: streakFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const object = new THREE.Mesh(quad, material);
  object.name = 'e-field-flow';
  object.frustumCulled = false;
  // Nearly two pixels wide in the pixels being drawn, screen or card (windFlow.ts says why).
  const buffer = new THREE.Vector2();
  object.onBeforeRender = (r) => {
    r.getDrawingBufferSize(buffer);
    material.uniforms.viewport.value.set(Math.max(buffer.x, 1), Math.max(buffer.y, 1));
    material.uniforms.widthPx.value = 1.8 * Math.max(r.getPixelRatio(), 1);
  };
  // The particles as they stand, read back from the GPU, for a rendered-globe check. Never called while drawing.
  object.userData.readState = () => {
    const out = new Float32Array(side * side * 4);
    renderer.readRenderTargetPixels(gpu.getCurrentRenderTarget(variable), 0, 0, side, side, out);
    return out;
  };

  let time = 0;
  const advance = (dt: number) => {
    time += dt;
    cu.dt.value = dt;
    cu.time.value = time % 1000;
    gpu.compute();
    material.uniforms.state.value = gpu.getCurrentRenderTarget(variable).texture;
  };

  return {
    object,
    step: (dt) => advance(Math.min(Math.max(dt, 0), 1 / 30)),
    setGrid(next, texture) {
      grid = next;
      for (const u of [cu, material.uniforms]) {
        u.field.value = texture;
        u.origin.value.set(grid.lon0, grid.lat0);
        u.cell.value = grid.step;
        u.gridSize.value.set(grid.cols, grid.rows);
      }
    },
    setSpeed(share) { cu.speed.value = SPEED_DEG_S * share; },
    settle(seedTime, steps) {
      const fresh = gpu.createTexture();
      seedParticles(fresh.image.data as Float32Array, seedTime, grid);
      gpu.renderTexture(fresh, gpu.getCurrentRenderTarget(variable));
      gpu.renderTexture(fresh, gpu.getAlternateRenderTarget(variable));
      fresh.dispose();
      time = seedTime % 1000;
      for (let k = 0; k < steps; k++) advance(1 / 30);
    },
    dispose() {
      gpu.dispose();
      quad.dispose();
      material.dispose();
    },
  };
}

/**
 * Where particles start: at the cells a model holds, spread over them, each part way
 * through its life so the field does not pulse. The same seed time places them the
 * same way, which is what lets a still be drawn again.
 */
export function seedParticles(data: Float32Array, seedTime: number, grid: EFieldGrid): void {
  let state = (Math.floor(seedTime * 1000) ^ 0x85ebca6b) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const held: number[] = [];
  for (let c = 0; c < grid.model.length; c++) if (grid.model[c]) held.push(c);
  for (let k = 0; k < data.length; k += 4) {
    const seed = next();
    const c = held.length ? held[Math.floor(next() * held.length)] : 0;
    // Anywhere within the cell, not on its centre: the streaks do not line up in rows.
    data[k] = grid.lon0 + (c % grid.cols) * grid.step + (next() - 0.5) * grid.step;
    data[k + 1] = grid.lat0 + Math.floor(c / grid.cols) * grid.step + (next() - 0.5) * grid.step;
    data[k + 2] = next() * LIFE_S * (1 + seed);
    data[k + 3] = seed;
  }
}
