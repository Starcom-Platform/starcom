/**
 * Wind as flowing streaks (decision D-W, WX3): GFS 10 m wind moves a field of
 * particles across the globe on the GPU, each drawn as a short comet whose
 * length and brightness follow the wind's speed.
 *
 * Where each particle is lives in a float texture (longitude, latitude, age,
 * seed), advanced every frame by a compute pass that samples the wind
 * texture, so the CPU touches no particle. Float render targets are needed:
 * a particle moves about a hundredth of a degree a frame, finer than a half
 * float holds near 360°. Where a GPU cannot render to floats, init() says so
 * and the layer states it rather than drawing something wrong.
 *
 * Each streak is a screen-space quad between its tail and its head, nearly
 * two pixels wide whatever the zoom, so it stays visible on a card drawn at
 * twice the screen's size, where a one-pixel line would vanish.
 *
 * Between two of the model's steps the particles move by both, blended by
 * how far between them the moment lies (WX10), so the flow turns smoothly as
 * the moment moves.
 */
import * as THREE from 'three';
import { GPUComputationRenderer, type Variable } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { GUNMETAL } from '../../../styles/tokens';

const GLOBE_RADIUS_UNITS = 100;

/** How the motion looks: degrees a particle moves per second for each m/s of wind. */
const SPEED_SCALE = 0.06;
/** A particle lives this long, plus up to as long again, then starts afresh elsewhere. */
const LIFE_S = 3;

const SAMPLE_WIND = /* glsl */ `
  uniform sampler2D wind;
  uniform sampler2D windNext;
  uniform float windWeight;  // how far from wind's hour to windNext's the moment lies
  // The wind at a place: R east, G north, m/s. Column i is longitude i°, row j latitude 90 - j°.
  vec2 windAt(vec2 lonLat) {
    vec2 uv = vec2((lonLat.x + 0.5) / 360.0, (90.0 - lonLat.y + 0.5) / 181.0);
    return mix(texture2D(wind, uv).rg, texture2D(windNext, uv).rg, windWeight);
  }
`;

const computeShader = /* glsl */ `
  uniform float dt;
  uniform float time;
  uniform float speedScale;
  uniform float life;
  ${SAMPLE_WIND}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 s = texture2D(textureState, uv);
    vec2 w = windAt(s.xy);
    float coslat = max(cos(radians(s.y)), 0.08);
    vec2 next = s.xy + vec2(w.x / coslat, w.y) * speedScale * dt;
    float age = s.z + dt;
    float span = life * (1.0 + s.w);
    if (age > span || abs(next.y) > 84.0) {
      // Start afresh at a place spread evenly over the sphere, not crowded at the poles.
      float a = hash(vec2(s.w * 91.7, time));
      float b = hash(vec2(time, s.w * 17.3 + uv.x));
      next = vec2(a * 360.0, degrees(asin(b * 2.0 - 1.0)));
      age = 0.0;
    }
    gl_FragColor = vec4(mod(next.x + 360.0, 360.0), next.y, age, s.w);
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
  ${SAMPLE_WIND}
  vec3 toScene(vec2 lonLat) {
    float lat = radians(lonLat.y), lng = radians(lonLat.x);
    return radius * vec3(cos(lat) * sin(lng), sin(lat), cos(lat) * cos(lng));
  }
  void main() {
    vec4 s = texture2D(state, ref);
    vec2 w = windAt(s.xy);
    float speed = length(w);
    float coslat = max(cos(radians(s.y)), 0.08);
    // The tail trails behind the head by a length that grows with speed.
    vec2 back = speed > 0.01 ? (w / speed) * (0.6 + 0.16 * speed) : vec2(0.0);
    vec2 tail = s.xy - vec2(back.x / coslat, back.y);
    vec4 headClip = projectionMatrix * modelViewMatrix * vec4(toScene(s.xy), 1.0);
    vec4 tailClip = projectionMatrix * modelViewMatrix * vec4(toScene(tail), 1.0);
    vec4 clip = mix(tailClip, headClip, end);
    vec2 dir = normalize((headClip.xy / headClip.w - tailClip.xy / tailClip.w) * viewport + 1e-6);
    vec2 across = vec2(-dir.y, dir.x) * side * widthPx / viewport;
    gl_Position = clip + vec4(across * clip.w, 0.0, 0.0);
    float span = life * (1.0 + s.w);
    float fade = smoothstep(0.0, 0.6, s.z) * (1.0 - smoothstep(span - 0.8, span, s.z));
    vAlpha = fade * smoothstep(0.3, 6.0, speed) * 0.9;
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

export interface WindFlow {
  /** The streaks, to add to the scene. */
  object: THREE.Mesh;
  /** Moves every particle on by dt seconds (capped at a thirtieth of a second, so a stalled tab does not jump). */
  step(dt: number): void;
  /** The wind at the step before the moment and the one after: the same texture for one step. */
  setWind(first: THREE.Texture, second: THREE.Texture): void;
  /** How far between them the moment lies: only a uniform changes. */
  setWeight(weight: number): void;
  /** Particles back to where a seed puts them, then moved on, so the same moment draws the same streaks. */
  settle(seedTime: number, steps: number): void;
  dispose(): void;
}

export class WindFlowUnsupported extends Error {}

/** Particles in a side × side grid: 128 draws 16,384 streaks. */
export function createWindFlow(
  renderer: THREE.WebGLRenderer,
  wind: { first: THREE.Texture; second: THREE.Texture; weight: number },
  options: { side: number; radiusFraction: number },
): WindFlow {
  const { side } = options;
  const gpu = new GPUComputationRenderer(side, side, renderer);
  const initial = gpu.createTexture();
  seedParticles(initial.image.data as Float32Array, 0);
  const variable: Variable = gpu.addVariable('textureState', computeShader, initial);
  gpu.setVariableDependencies(variable, [variable]);
  const cu = variable.material.uniforms;
  cu.wind = { value: wind.first };
  cu.windNext = { value: wind.second };
  cu.windWeight = { value: wind.weight };
  cu.dt = { value: 0 };
  cu.time = { value: 0 };
  cu.speedScale = { value: SPEED_SCALE };
  cu.life = { value: LIFE_S };
  const error = gpu.init();
  if (error) {
    gpu.dispose();
    throw new WindFlowUnsupported(`This device's GPU cannot draw the wind flow: ${error}`);
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
  // The streaks are placed by the shader, so three.js cannot bound them: never cull.
  quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GLOBE_RADIUS_UNITS * 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      state: { value: gpu.getCurrentRenderTarget(variable).texture },
      wind: { value: wind.first },
      windNext: { value: wind.second },
      windWeight: { value: wind.weight },
      radius: { value: GLOBE_RADIUS_UNITS * options.radiusFraction },
      viewport: { value: new THREE.Vector2(1, 1) },
      widthPx: { value: 1.5 },
      life: { value: LIFE_S },
      // The authored bytes, not through THREE.Color, which would turn them into linear light (heatMap.ts says how that went).
      color: { value: new THREE.Vector3(...[1, 3, 5].map((k) => parseInt(GUNMETAL[100].slice(k, k + 2), 16) / 255)) },
    },
    vertexShader: streakVertex,
    fragmentShader: streakFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const object = new THREE.Mesh(quad, material);
  object.name = 'wind-flow';
  object.frustumCulled = false;
  /*
   * The width is in the pixels being drawn, read as each frame is drawn: a
   * capture draws at a ratio of 1 and a card's own size (captureGlobeFrame),
   * the screen at the device's ratio, and the streaks stay nearly two pixels
   * wide on either.
   */
  const buffer = new THREE.Vector2();
  object.onBeforeRender = (r) => {
    r.getDrawingBufferSize(buffer);
    material.uniforms.viewport.value.set(Math.max(buffer.x, 1), Math.max(buffer.y, 1));
    material.uniforms.widthPx.value = 1.8 * Math.max(r.getPixelRatio(), 1);
  };

  /*
   * The particles as they stand, read back from the GPU: how the rendered-globe
   * check proves each moves the way the wind at its place blows (longitude,
   * latitude, age, seed per particle). Never called while drawing.
   */
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
    setWind(first, second) {
      cu.wind.value = first;
      cu.windNext.value = second;
      material.uniforms.wind.value = first;
      material.uniforms.windNext.value = second;
    },
    setWeight(weight) {
      cu.windWeight.value = weight;
      material.uniforms.windWeight.value = weight;
    },
    settle(seedTime, steps) {
      const fresh = gpu.createTexture();
      seedParticles(fresh.image.data as Float32Array, seedTime);
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
 * Where particles start: spread evenly over the sphere, each with an age part
 * way through its life, so the field does not pulse. The same seed time
 * places them the same way, which is what lets a still be drawn again.
 */
export function seedParticles(data: Float32Array, seedTime: number): void {
  let state = (Math.floor(seedTime * 1000) ^ 0x9e3779b9) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let k = 0; k < data.length; k += 4) {
    const seed = next();
    data[k] = next() * 360;
    data[k + 1] = (Math.asin(next() * 2 - 1) * 180) / Math.PI;
    data[k + 2] = next() * LIFE_S * (1 + seed);
    data[k + 3] = seed;
  }
}
