/**
 * The solar wind's particles from the Sun to the Earth, drawn (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW6, SW7, SW16, SW17).
 *
 * Each source (services/spaceWeather/heliosphere.ts: a measured minute, a place on the turning Sun)
 * sends a train of particles out along its spiral arm, at its own measured speed, so fast streams
 * outrun slow ones; the IMF's polarity colours them, measured turbulence jitters them, and density
 * sizes them. Worked out on the GPU: each particle carries its source, and the vertex shader walks it
 * out and places it.
 *
 * Placed as the solar system is (bodyPlacement.ts): direction from the Earth true, at its one scale about
 * the Earth (C32), so the hindcast's Sun falls on the drawn Sun. The frame is the Sun-Earth frame (x from
 * the Sun to the Earth, z the ecliptic's pole, y = z × x), aligned to the Sun as drawn now. Faded near the
 * Sun, past 2 AU, and within about 90 Earth radii (drawn) of the Earth, where the near-Earth flow is drawn
 * at its true scale instead; and drawn only a little past the Earth (1.3 AU), where the stream has passed us.
 */
import * as THREE from 'three';
import { AU_KM, SUN_ROTATION, type WindSource } from '../../../services/spaceWeather/heliosphere';
import { unitsPerAuNow } from '../../../solar-system/solarScale';

/** Particles a source sends, spread along its arm. */
const PER_SOURCE = 36;
/** How far out an arm is drawn, AU: a little past the Earth, where the stream has passed us. */
export const REACH_AU = 1.3;
/** The Sun's turn a day, radians. */
const TURN_A_DAY = SUN_ROTATION * 86_400_000;
/** Days of flow a second of the clock: a parcel at 400 km/s crosses 1 AU in about 26 s. */
export const FLOW_DAYS_PER_SECOND = 1 / 6;

export interface SunEarthBasis {
  /** From the Sun toward the Earth, in the ecliptic, and ahead along the Earth's orbit, and the ecliptic's pole: unit vectors in the scene. */
  x: THREE.Vector3;
  y: THREE.Vector3;
  z: THREE.Vector3;
}

/** The ecliptic's north pole in J2000 equatorial axes (obliquity 23.4392911°): skyFrame turns it into the scene. */
const ECLIPTIC_POLE_J2000 = (() => {
  const e = THREE.MathUtils.degToRad(23.4392911);
  return new THREE.Vector3(0, -Math.sin(e), Math.cos(e));
})();

/** The ecliptic's pole in the scene at a moment, through the solar system's own sky frame. */
export function eclipticPoleAt(frame: THREE.Matrix4): THREE.Vector3 {
  return ECLIPTIC_POLE_J2000.clone().applyMatrix4(frame).normalize();
}

/** The Sun-Earth frame in the scene, from the drawn Sun's direction and the ecliptic's pole there. */
export function sunEarthBasis(sunDirection: THREE.Vector3, eclipticPole: THREE.Vector3): SunEarthBasis {
  const z = eclipticPole.clone().normalize();
  const toEarth = sunDirection.clone().negate();
  const x = toEarth.sub(z.clone().multiplyScalar(toEarth.dot(z))).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return { x, y, z };
}

/** Where a source's particle, `days` out from the Sun, is drawn: the shader's sum, for tests and probes. */
export function drawnParticle(source: Pick<WindSource, 'angle' | 'speed'>, days: number, basis: SunEarthBasis): THREE.Vector3 {
  const r = (source.speed * days * 86_400) / AU_KM;
  const a = source.angle - TURN_A_DAY * days;
  const g = basis.x.clone().multiplyScalar(r * Math.cos(a) - 1).add(basis.y.clone().multiplyScalar(r * Math.sin(a)));
  return g.multiplyScalar(unitsPerAuNow());
}

const vertex = /* glsl */ `
  attribute float angle;
  attribute float speed;
  attribute float phase;      // days along the arm at the clock's start
  attribute float polarity;
  attribute float density;
  attribute float turbulence;
  attribute float seed;
  uniform vec3 xAxis;
  uniform vec3 yAxis;
  uniform float flowDays;
  uniform float size;
  varying float vFade;
  varying float vPolarity;
  const float AU_KM = ${AU_KM.toFixed(1)};
  const float TURN = ${TURN_A_DAY.toFixed(9)};
  // The astronomical unit drawn now: the scale in force, gliding (OR9).
  uniform float DRAWN_AU;
  const float REACH = ${REACH_AU.toFixed(2)};
  void main() {
    float reachDays = REACH * AU_KM / (speed * 86400.0);
    float days = mod(phase + flowDays, reachDays);
    float r = speed * days * 86400.0 / AU_KM;
    float a = angle - TURN * days;
    // Measured turbulence: a wiggle across the arm.
    float jitter = turbulence * 0.012 * sin(seed * 91.7 + flowDays * 40.0 + r * 37.0);
    vec2 p = vec2(r * cos(a), r * sin(a)) + jitter * vec2(-sin(a), cos(a));
    vec3 g = (p.x - 1.0) * xAxis + p.y * yAxis;
    float drawn = length(g) * DRAWN_AU;
    vec3 world = g * DRAWN_AU;
    // Seen edge-on, faded, as the ENLIL disc is (SW25): from near the ecliptic the whole disc of particles would
    // collapse into one bright line through the Earth and the Sun. Near ones seen from a little above still show.
    float facing = abs(dot(normalize(cameraPosition - world), normalize(cross(xAxis, yAxis))));
    vFade = smoothstep(0.03, 0.09, r) * (1.0 - smoothstep(REACH - 0.2, REACH, r)) * smoothstep(7000.0, 12000.0, drawn)
      * smoothstep(0.08, 0.35, facing);
    vPolarity = polarity;
    vec4 view = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = size * (0.55 + 0.45 * clamp(log(max(density, 0.1)) / log(20.0), 0.0, 1.0));
  }
`;
const fragment = /* glsl */ `
  uniform vec3 away;
  uniform vec3 toward;
  varying float vFade;
  varying float vPolarity;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d) * 4.0;
    if (r2 > 1.0 || vFade <= 0.0) discard;
    float glow = exp(-3.0 * r2);
    vec3 color = vPolarity > 0.0 ? away : toward;
    gl_FragColor = vec4(color * glow * vFade * 0.85, 1.0);
  }
`;

export interface HeliosphereParticles {
  object: THREE.Points;
  setBasis(basis: SunEarthBasis): void;
  /** Days of flow since the clock's start. */
  setFlow(days: number): void;
  dispose(): void;
}

export function createHeliosphereParticles(sources: readonly WindSource[], colors: { away: string; toward: string }): HeliosphereParticles {
  const n = sources.length * PER_SOURCE;
  const attr = () => new Float32Array(n);
  const a = { angle: attr(), speed: attr(), phase: attr(), polarity: attr(), density: attr(), turbulence: attr(), seed: attr() };
  let i = 0;
  sources.forEach((s, k) => {
    const reachDays = (REACH_AU * AU_KM) / (s.speed * 86_400);
    for (let p = 0; p < PER_SOURCE; p++, i++) {
      a.angle[i] = s.angle;
      a.speed[i] = s.speed;
      a.phase[i] = ((p + ((k * 0.618) % 1)) / PER_SOURCE) * reachDays;
      a.polarity[i] = s.polarity;
      a.density[i] = s.density;
      a.turbulence[i] = s.turbulence;
      a.seed[i] = (k * 7.31 + p * 1.7) % 100;
    }
  });
  const geometry = new THREE.BufferGeometry();
  // Positions are worked out in the shader; three still wants a position to count the points by.
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  for (const [name, values] of Object.entries(a)) geometry.setAttribute(name, new THREE.BufferAttribute(values, 1));
  const pixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      DRAWN_AU: { value: unitsPerAuNow() },
      xAxis: { value: new THREE.Vector3(1, 0, 0) },
      yAxis: { value: new THREE.Vector3(0, 0, -1) },
      flowDays: { value: 0 },
      size: { value: 3.5 * pixelRatio },
      away: { value: new THREE.Color(colors.away) },
      toward: { value: new THREE.Color(colors.toward) },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const object = new THREE.Points(geometry, material);
  object.onBeforeRender = () => { material.uniforms.DRAWN_AU.value = unitsPerAuNow(); };
  object.name = 'heliosphere-particles';
  object.frustumCulled = false;
  return {
    object,
    setBasis(basis) {
      (material.uniforms.xAxis.value as THREE.Vector3).copy(basis.x);
      (material.uniforms.yAxis.value as THREE.Vector3).copy(basis.y);
    },
    setFlow(days) { material.uniforms.flowDays.value = days % 1000; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
