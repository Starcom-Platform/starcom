/**
 * A body of the solar system lit from where the Sun really is, seen from it (decision
 * K6, step 3; record docs/missions/01-architecture-decisions/solar-system.md).
 *
 * The globe's light is one parallel light along the Sun's direction from the Earth.
 * That is right for the Earth and, the Sun being so far, for the Moon, but not for a
 * planet: seen from the Earth, Venus at its greatest elongation is half lit, and under
 * the Earth's light it was drawn as a thin crescent. A three.js light reaches every lit
 * object in the scene alike, so each body carries its own direction to the Sun instead,
 * and its phase as seen from the Earth is its true phase.
 */
import * as THREE from 'three';

/** How much of the night side still shows: dark, but not a hole in the sky. */
const NIGHT_FILL = 0.04;

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  void main() {
    vUv = uv;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D map;
  uniform bool hasMap;
  uniform vec3 color;
  uniform vec3 sunDirection;
  uniform float opacity;
  uniform float nightFill;
  varying vec2 vUv;
  varying vec3 vNormalWorld;
  void main() {
    vec3 surface = hasMap ? texture2D(map, vUv).rgb : color;
    float day = max(dot(normalize(vNormalWorld), sunDirection), 0.0);
    gl_FragColor = vec4(surface * mix(nightFill, 1.0, day), opacity);
    #include <colorspace_fragment>
  }
`;

export type SunlitMaterial = THREE.ShaderMaterial & {
  uniforms: {
    map: { value: THREE.Texture | null };
    hasMap: { value: boolean };
    color: { value: THREE.Color };
    sunDirection: { value: THREE.Vector3 };
    opacity: { value: number };
    nightFill: { value: number };
  };
};

/** A body's surface, `color` until its imagery arrives (setSunlitMap). See-through only while it fades in. */
export function createSunlitMaterial(color: number): SunlitMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: null },
      hasMap: { value: false },
      color: { value: new THREE.Color(color) },
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      opacity: { value: 1 },
      nightFill: { value: NIGHT_FILL },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
  }) as SunlitMaterial;
}

/** Wraps the body in its imagery. */
export function setSunlitMap(material: SunlitMaterial, texture: THREE.Texture): void {
  material.uniforms.map.value = texture;
  material.uniforms.hasMap.value = true;
}

/** Where the Sun is from the body, a direction in the scene. */
export function setSunDirection(material: SunlitMaterial, direction: THREE.Vector3): void {
  material.uniforms.sunDirection.value.copy(direction).normalize();
}

/** How much of the body is drawn, kept in step with the material's own opacity. */
export function setSunlitOpacity(material: SunlitMaterial, opacity: number): void {
  material.uniforms.opacity.value = opacity;
  material.opacity = opacity;
}
