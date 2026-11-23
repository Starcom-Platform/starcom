/**
 * Threads of light in the Sun-Earth frame, as a CME's plasma is points of it (cmeShells.ts): a CME's flux rope's
 * field lines (cmeFluxRope.ts, SW28) and the arc of the Earth's orbit its front sweeps across (cmeOrbitSweep.ts,
 * SW30). Each line soft points of light, dense enough to read as one line, with a slow shimmer running along it on
 * the moment drawn; as fat lines they beaded, each joint's two round ends adding their light twice.
 *
 * Laid out in AU in the Sun-Earth frame (the Sun at the origin, the Earth at x = 1) and placed in the vertex shader
 * as the plasma is, at a scale about the Sun: a rope grows with its front, an orbit stays at 1 AU. Faded near the
 * Earth, as the plasma is.
 */
import * as THREE from 'three';
import { unitsPerAuNow } from '../../../solar-system/solarScale';
import { stilledAt } from '../../../globe-engine/captureClock';
import { plasmaDriftAt } from './cmeShells';
import type { SunEarthBasis } from './heliosphereParticles';

const vertex = /* glsl */ `
  attribute vec2 along;  // its light, and how far along its line
  uniform float scale;
  uniform float drift;
  uniform float pixelRatio;
  uniform float pointPx;
  uniform vec3 xAxis;
  uniform vec3 yAxis;
  uniform vec3 zAxis;
  varying float vLight;
  varying float vFade;
  // The astronomical unit drawn now: the scale in force, gliding (OR9).
  uniform float DRAWN_AU;
  void main() {
    vec3 p = scale * position;
    vec3 g = (p.x - 1.0) * xAxis + p.y * yAxis + p.z * zAxis;
    // Faded within about 120 Earth radii of the Earth, as the plasma is.
    vFade = smoothstep(9000.0, 15000.0, length(g) * DRAWN_AU);
    vLight = along.x * (0.75 + 0.25 * sin(drift * 1.7 - along.y * 60.0));
    gl_Position = projectionMatrix * viewMatrix * vec4(g * DRAWN_AU, 1.0);
    gl_PointSize = pointPx * pixelRatio;
  }
`;
const fragment = /* glsl */ `
  uniform vec3 color;
  uniform float strength;
  varying float vLight;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c) * 4.0;
    if (r2 > 1.0 || vFade <= 0.0) discard;
    gl_FragColor = vec4(mix(color, vec3(1.0), 0.2) * exp(-3.0 * r2) * vLight * vFade * strength, 1.0);
  }
`;

export interface LightThreads {
  object: THREE.Points;
  /** Its scale about the Sun: what is laid out at 1 AU is drawn this far out. */
  setScale(scale: number): void;
  /** Its light, a share of its strength; drawn only while some. */
  setGain(gain: number): void;
  setBasis(basis: SunEarthBasis): void;
  dispose(): void;
}

export interface ThreadLook {
  /** sRGB bytes, written straight out, as the plasma's are. */
  rgb: readonly number[];
  strength: number;
  pointPx: number;
  /** A point's light from how far along its line it is, 0 to 1. */
  lightAt(t: number): number;
}

export function createLightThreads(name: string, lines: readonly number[][], look: ThreadLook): LightThreads {
  const count = lines.reduce((n, l) => n + l.length / 3, 0);
  const position = new Float32Array(count * 3);
  const along = new Float32Array(count * 2);
  let i = 0;
  for (const line of lines) {
    const n = line.length / 3;
    position.set(line, i * 3);
    for (let k = 0; k < n; k += 1, i += 1) along.set([look.lightAt(k / (n - 1)), k / (n - 1)], i * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('along', new THREE.BufferAttribute(along, 2));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      DRAWN_AU: { value: unitsPerAuNow() },
      scale: { value: 1 },
      drift: { value: 0 },
      pixelRatio: { value: 1 },
      pointPx: { value: look.pointPx },
      xAxis: { value: new THREE.Vector3(1, 0, 0) },
      yAxis: { value: new THREE.Vector3(0, 0, -1) },
      zAxis: { value: new THREE.Vector3(0, 1, 0) },
      color: { value: new THREE.Vector3(...look.rgb.map((c) => c / 255)) },
      strength: { value: 0 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const object = new THREE.Points(geometry, material);
  object.name = name;
  object.frustumCulled = false;
  object.visible = false;
  object.onBeforeRender = (renderer) => {
    material.uniforms.DRAWN_AU.value = unitsPerAuNow();
    material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    material.uniforms.drift.value = plasmaDriftAt(stilledAt() ?? Date.now());
  };
  return {
    object,
    setScale(scale) { material.uniforms.scale.value = scale; },
    setGain(gain) {
      material.uniforms.strength.value = look.strength * gain;
      object.visible = gain > 0;
    },
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
