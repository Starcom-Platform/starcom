/**
 * The field lines drawn glowing, with light running along them (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW5).
 *
 * Each kind of line (closed, open) is one batch of screen-space lines (three's LineSegments2, as the
 * borders and cables are), a few pixels wide whatever the distance, bright at the middle and fading
 * to its edges, added to what is behind. Pulses of light run along each line from its footpoint, at
 * a pace set by the solar wind's speed: illustration, sped up, not a measurement. Each line's pulses
 * start at their own phase, so the lines do not pulse in step. Near the ground, where every line of a
 * hemisphere crowds into its polar cap, each fades, so their added light does not burn to white.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { lineToScene, RE_UNITS, type TracedFieldLine } from './fieldLines';
import type { Frame } from '../../../services/spaceWeather/geopack/geopack';

/** Pulses a line carries: one every this many Earth radii along it, and how long each is. */
export const PULSE_SPACING_RE = 8;
const PULSE_LENGTH = 0.18;
/** How wide the lines are drawn, pixels. */
const LINE_PX = 3;
/** A line's brightness at the ground, and the distance, Re, by which it is at its full. */
const NEAR_GROUND = 0.2;
const FULL_FROM_RE = 2.5;

/** How bright a line is at a distance from the Earth's centre, Re: dim at the ground, full from 2.5 Re. */
export function brightnessAt(re: number): number {
  const t = Math.min(Math.max((re - 1) / (FULL_FROM_RE - 1), 0), 1);
  return NEAR_GROUND + (1 - NEAR_GROUND) * t * t * (3 - 2 * t);
}

/** How far a pulse runs a second, scene units: 3 Earth radii a second at a 400 km/s wind, in proportion to it. */
export function pulseUnitsPerSecond(windKmS: number): number {
  return (3 * RE_UNITS * windKmS) / 400;
}

/** A line's own phase, a share of the spacing, fixed by where it starts so a re-trace keeps it. */
export function phaseOf(line: Pick<TracedFieldLine, 'lat' | 'mlt' | 'hemisphere'>): number {
  const n = Math.sin(line.lat * 12.9898 + line.mlt * 78.233 + (line.hemisphere === 'south' ? 37.719 : 0)) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * One kind of line as segments, scene units: positions as pairs (p0 p1, p1 p2, …), each segment's
 * distance along its line from the footpoint at its start and end, offset by the line's own phase, and
 * its brightness at each end (as grey, multiplying the line's colour).
 */
export function fieldLineSegments(lines: readonly TracedFieldLine[], kind: TracedFieldLine['kind'], frame: Frame): { positions: Float32Array; distances: Float32Array; brightness: Float32Array } {
  const parts = lines.filter((l) => l.kind === kind).map((l) => ({ line: l, points: lineToScene(frame, l.points) }));
  const segments = parts.reduce((n, p) => n + Math.max(0, p.points.length / 3 - 1), 0);
  const positions = new Float32Array(segments * 6);
  const distances = new Float32Array(segments * 2);
  const brightness = new Float32Array(segments * 6);
  const at = (p: Float32Array, k: number) => brightnessAt(Math.hypot(p[k], p[k + 1], p[k + 2]) / RE_UNITS);
  let s = 0;
  for (const { line, points } of parts) {
    let along = phaseOf(line) * PULSE_SPACING_RE * RE_UNITS;
    for (let k = 0; k + 5 < points.length; k += 3) {
      positions.set(points.subarray(k, k + 6), s * 6);
      const step = Math.hypot(points[k + 3] - points[k], points[k + 4] - points[k + 1], points[k + 5] - points[k + 2]);
      distances[s * 2] = along;
      distances[s * 2 + 1] = along + step;
      brightness.fill(at(points, k), s * 6, s * 6 + 3);
      brightness.fill(at(points, k + 3), s * 6 + 3, s * 6 + 6);
      along += step;
      s++;
    }
  }
  return { positions, distances, brightness };
}

export interface FieldLineGlow {
  object: LineSegments2;
  /** Where the pulses are, scene units run since the clock's start. */
  setPulse(units: number): void;
  dispose(): void;
}

/** One kind of line, glowing and pulsing, in its colour, `widthPx` wide (3 unless said). */
export function createFieldLineGlow(segments: { positions: Float32Array; distances: Float32Array; brightness: Float32Array }, color: string, name: string, widthPx = LINE_PX): FieldLineGlow {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(segments.positions);
  geometry.setColors(segments.brightness);
  // Each segment's distance along its line, as LineSegments2.computeLineDistances lays them out, but per line.
  const distances = new THREE.InstancedInterleavedBuffer(segments.distances, 2, 1);
  geometry.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(distances, 1, 0));
  geometry.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(distances, 1, 1));
  const material = new LineMaterial({
    color,
    linewidth: widthPx,
    vertexColors: true,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // Dashing on only for the distance along the line it carries: no gaps.
    dashed: true,
    dashSize: 1e9,
    gapSize: 0,
  });
  const spacing = PULSE_SPACING_RE * RE_UNITS;
  const pulse = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.pulseAt = pulse;
    shader.uniforms.pulseSpacing = { value: spacing };
    shader.fragmentShader = shader.fragmentShader
      .replace('uniform float linewidth;', 'uniform float linewidth;\nuniform float pulseAt;\nuniform float pulseSpacing;')
      .replace(
        'gl_FragColor = vec4( diffuseColor.rgb, alpha );',
        `// Bright at the middle, fading to the edges: a glow.
        float across = exp( -2.5 * vUv.x * vUv.x );
        // A pulse running away from the footpoint: its head where the phase wraps, a sharp front ahead
        // of it (just past the wrap) and a fading tail behind it (just short of the wrap).
        float phase = fract( ( vLineDistance - pulseAt ) / pulseSpacing );
        float tail = smoothstep( 1.0 - ${PULSE_LENGTH.toFixed(3)}, 1.0, phase );
        float front = 1.0 - smoothstep( 0.0, 0.015, phase );
        float glow = max( tail, front );
        vec3 lit = diffuseColor.rgb * ( 1.0 + 1.6 * glow ) + vec3( 0.35 * glow );
        gl_FragColor = vec4( lit, alpha * across * ( 0.55 + 0.45 * glow ) );`,
      );
  };
  const object = new LineSegments2(geometry, material);
  object.name = name;
  object.frustumCulled = false;
  // Where the pulses are, for a probe or a test to read.
  object.userData.pulseAt = () => pulse.value;
  return {
    object,
    setPulse(units) { pulse.value = units % spacing; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
