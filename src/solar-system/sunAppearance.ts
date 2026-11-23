/**
 * How the Sun looks (decision K6, step 5; record
 * docs/missions/01-architecture-decisions/solar-system.md): a surface, a corona that
 * faces the viewer, and a lens flare. The bloom round it is the globe's (sunBloom.ts).
 *
 * The surface darkens and reddens toward the limb as the real one does (limb
 * darkening: the edge is seen through cooler, higher gas) and is mottled with
 * slowly changing granulation. It is drawn brighter than white, 1.6 in linear light,
 * so a bloom that takes only what is brighter than white takes the Sun and nothing
 * else on the globe. The corona is a flat disc that always faces the camera, so it
 * reads the same from any side, its light falling off with distance from the limb and
 * broken into streamers. The flare is a camera's, so it weakens as the Sun's disc
 * shrinks with distance: from the farthest reach there is none.
 */
import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';

/** The surface's brightness in linear light: over 1, so the bloom finds it (and only it). */
export const SUN_SURFACE_BRIGHTNESS = 1.6;
/** The corona's reach, in Sun radii from the centre. */
export const CORONA_RADII = 4;
/** The disc radius on screen, in CSS pixels, at which the flare is at full strength. */
const FLARE_FULL_PX = 60;

const NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float valueNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int k = 0; k < 4; k++) {
      v += a * valueNoise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;

const SURFACE_VERTEX = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vPositionView;
  varying vec3 vSphere;
  void main() {
    vSphere = normalize(position);
    vNormalView = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vPositionView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const SURFACE_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform float brightness;
  uniform float opacity;
  varying vec3 vNormalView;
  varying vec3 vPositionView;
  varying vec3 vSphere;
  ${NOISE_GLSL}
  void main() {
    float mu = clamp(dot(normalize(vNormalView), normalize(-vPositionView)), 0.0, 1.0);
    float limb = 1.0 - 0.6 * (1.0 - mu);
    float granules = fbm(vSphere * 28.0 + vec3(0.0, 0.0, time * 0.02));
    vec3 core = vec3(1.0, 0.86, 0.62);
    vec3 edge = vec3(1.0, 0.42, 0.08);
    vec3 colour = mix(edge, core, pow(mu, 0.6)) * limb * (0.82 + 0.36 * granules);
    gl_FragColor = vec4(colour * brightness, opacity);
    #include <colorspace_fragment>
  }
`;

const CORONA_VERTEX = /* glsl */ `
  uniform float size;
  varying vec2 vOffset;
  void main() {
    vOffset = position.xy;
    vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    centre.xy += position.xy * size;
    gl_Position = projectionMatrix * centre;
  }
`;

const CORONA_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform float reach;
  uniform float opacity;
  varying vec2 vOffset;
  ${NOISE_GLSL}
  void main() {
    // Distance from the centre in Sun radii, and the direction round the limb.
    float r = length(vOffset) * reach;
    if (r < 1.0 || r > reach) discard;
    float angle = atan(vOffset.y, vOffset.x);
    float streamers = fbm(vec3(cos(angle) * 3.0, sin(angle) * 3.0, time * 0.005));
    float falloff = pow(1.0 / r, 3.0) * (0.55 + 0.9 * streamers);
    float edge = 1.0 - smoothstep(reach * 0.75, reach, r);
    gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * falloff * edge * opacity, 1.0);
    #include <colorspace_fragment>
  }
`;

export type SunSurfaceMaterial = THREE.ShaderMaterial & {
  uniforms: { time: { value: number }; brightness: { value: number }; opacity: { value: number } };
};

/** The Sun's surface. See-through only while it fades in. */
export function createSunSurfaceMaterial(): SunSurfaceMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      brightness: { value: SUN_SURFACE_BRIGHTNESS },
      opacity: { value: 1 },
    },
    vertexShader: SURFACE_VERTEX,
    fragmentShader: SURFACE_FRAGMENT,
    transparent: true,
  }) as SunSurfaceMaterial;
}

export type CoronaMaterial = THREE.ShaderMaterial & {
  uniforms: { size: { value: number }; reach: { value: number }; time: { value: number }; opacity: { value: number } };
};

/**
 * The corona: a square that always faces the camera, `radius × CORONA_RADII` from its
 * centre to each side, its light added to what is behind it. Drawn after the surface,
 * which hides the part of it in front of the disc.
 */
export function createCorona(radius: number): THREE.Mesh<THREE.PlaneGeometry, CoronaMaterial> {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      size: { value: radius * CORONA_RADII },
      reach: { value: CORONA_RADII },
      time: { value: 0 },
      opacity: { value: 1 },
    },
    vertexShader: CORONA_VERTEX,
    fragmentShader: CORONA_FRAGMENT,
    transparent: true,
    // Light added to what is behind, and the canvas's alpha left as it is: the canvas is
    // see-through over the page, and an additive blend that also added alpha would set a
    // dark disc round the Sun wherever its light had faded to nothing.
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    depthWrite: false,
  }) as CoronaMaterial;
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  corona.name = 'sun-corona';
  // It faces the camera in its shader, so its bounds are a sphere, not the square.
  corona.frustumCulled = false;
  corona.renderOrder = 1;
  return corona;
}

/** How strong the lens flare is when the Sun's disc on screen is `discPx` in radius: its light on the lens. */
export function flareStrength(discPx: number): number {
  return THREE.MathUtils.clamp((discPx / FLARE_FULL_PX) ** 2, 0, 1);
}

/** A soft round spot, `size` texels across, its edge falling off by `power`, as a texture. */
function spotTexture(size: number, power: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const a = Math.max(0, 1 - r) ** power;
      const i = (y * size + x) * 4;
      data.set([255, 255, 255, Math.round(a * 255)], i);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

/** The elements of the flare, each with its colour at full strength. */
const FLARE_ELEMENTS: Array<{ size: number; distance: number; colour: number; power: number }> = [
  { size: 420, distance: 0, colour: 0xffe2b0, power: 2.2 },
  { size: 60, distance: 0.6, colour: 0x6a5a40, power: 1 },
  { size: 90, distance: 0.75, colour: 0x4a5a6a, power: 1.2 },
  { size: 140, distance: 0.95, colour: 0x403a30, power: 1.5 },
  { size: 70, distance: 1.1, colour: 0x3a4a3a, power: 1 },
];

export interface SunFlare {
  flare: Lensflare;
  /** Scales every element's light; 0 draws nothing. */
  setStrength(strength: number): void;
  /** The strength last set. */
  strength(): number;
}

/** The lens flare, to be placed just in front of the Sun's surface toward the camera. */
export function createSunFlare(): SunFlare {
  const flare = new Lensflare();
  flare.name = 'sun-flare';
  const elements = FLARE_ELEMENTS.map(({ size, distance, power }) => {
    const element = new LensflareElement(spotTexture(64, power), size, distance, new THREE.Color(0, 0, 0));
    flare.addElement(element);
    return element;
  });
  let current = 0;
  return {
    flare,
    setStrength(strength: number) {
      current = strength;
      elements.forEach((element, i) => element.color.setHex(FLARE_ELEMENTS[i].colour).multiplyScalar(strength));
    },
    strength: () => current,
  };
}
