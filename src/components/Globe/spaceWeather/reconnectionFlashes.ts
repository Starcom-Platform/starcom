/**
 * The day side's bursts of reconnection, drawn (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW5): glowing points on the
 * magnetopause about its nose, a few pixels' glow whatever the distance, as added light. Where and
 * when they light is cusps.ts's flashesAt; this only draws them.
 */
import * as THREE from 'three';

/** The most bursts lit at once. */
const MAX_FLASHES = 2;
/** A burst's glow at its height, pixels across. */
const FLASH_PX = 56;

const vertex = /* glsl */ `
  attribute float strength;
  varying float vStrength;
  uniform float size;
  void main() {
    vStrength = strength;
    gl_PointSize = size * (0.4 + 0.6 * strength);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragment = /* glsl */ `
  uniform vec3 color;
  varying float vStrength;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float glow = exp(-6.0 * r * r) + 0.35 * exp(-1.5 * r * r);
    gl_FragColor = vec4(color * glow * vStrength, 1.0);
  }
`;

export interface ReconnectionFlashes {
  object: THREE.Points;
  /** The bursts lit now: where each is, scene units, and how bright, 0 to 1. */
  set(flashes: ReadonlyArray<{ at: readonly number[]; strength: number }>): void;
  dispose(): void;
}

export function createReconnectionFlashes(color: string): ReconnectionFlashes {
  const positions = new Float32Array(MAX_FLASHES * 3);
  const strengths = new Float32Array(MAX_FLASHES);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('strength', new THREE.BufferAttribute(strengths, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, size: { value: FLASH_PX * (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1) } },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const object = new THREE.Points(geometry, material);
  object.name = 'reconnection-flashes';
  object.frustumCulled = false;
  return {
    object,
    set(flashes) {
      strengths.fill(0);
      flashes.slice(0, MAX_FLASHES).forEach((f, k) => {
        positions.set(f.at, k * 3);
        strengths[k] = f.strength;
      });
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.strength.needsUpdate = true;
    },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
