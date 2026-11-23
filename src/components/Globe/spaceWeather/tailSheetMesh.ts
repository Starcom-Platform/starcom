/**
 * The magnetotail's current sheet, drawn (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW5): a translucent surface
 * through the grid tailSheet.ts finds, brighter where the lobes' field either side is stronger (where
 * it carries more current), soft at its edges, with a shimmer running across it from dawn to dusk, the
 * way the current flows. The shimmer is an illustration; the surface's place is T96's.
 */
import * as THREE from 'three';
import type { Frame } from '../../../services/spaceWeather/geopack/geopack';
import { gsmToScene } from './fieldLines';
import type { TailSheet } from './tailSheet';

/** The lobes' field at which the sheet is at its brightest, nT. */
const FULL_LOBE_NT = 30;
/** Cells from an edge (the grid's, or a cell with no sheet) over which the sheet fades in. */
const EDGE_CELLS = 2;

/** How bright the sheet is for its lobes' field, nT: a glimmer at least, full from 30. */
export function sheetBrightness(lobeNt: number): number {
  return Math.min(Math.max(lobeNt / FULL_LOBE_NT, 0.15), 1);
}

/** For each cell, how many cells it is from an edge or a cell with no sheet, up to EDGE_CELLS. */
export function cellsFromEdge(sheet: Pick<TailSheet, 'xs' | 'ys' | 'z'>): Uint8Array {
  const nx = sheet.xs.length, ny = sheet.ys.length;
  const d = new Uint8Array(nx * ny);
  const has = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && Number.isFinite(sheet.z[j * nx + i]);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (!has(i, j)) continue;
      let k = 1;
      while (k <= EDGE_CELLS) {
        let clear = true;
        for (let dj = -k; dj <= k && clear; dj++) for (let di = -k; di <= k && clear; di++) if (!has(i + di, j + dj)) clear = false;
        if (!clear) break;
        k++;
      }
      d[j * nx + i] = k - 1;
    }
  }
  return d;
}

const vertex = /* glsl */ `
  attribute float along;
  attribute float across;
  attribute float strength;
  attribute float edge;
  varying float vAlong;
  varying float vAcross;
  varying float vStrength;
  varying float vEdge;
  void main() {
    vAlong = along; vAcross = across; vStrength = strength; vEdge = edge;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragment = /* glsl */ `
  uniform vec3 color;
  uniform float time;
  varying float vAlong;
  varying float vAcross;
  varying float vStrength;
  varying float vEdge;
  void main() {
    // Bands running across the tail, dawn to dusk, warped as they go: the current, drawn to be seen.
    float bands = 0.55 + 0.45 * sin(vAcross * 0.55 - time * 1.4 + 1.8 * sin(vAlong * 0.18 + time * 0.35));
    float ripple = 0.75 + 0.25 * sin(vAlong * 0.9 - vAcross * 0.3 + time * 2.1);
    float a = 0.5 * vStrength * smoothstep(0.0, 1.0, vEdge) * bands * ripple;
    gl_FragColor = vec4(color * a, 1.0);
  }
`;

export interface TailSheetMesh {
  object: THREE.Mesh;
  /** Seconds, for the shimmer: the clock live, a still's own moment on a card. */
  setTime(seconds: number): void;
  dispose(): void;
}

/** The sheet as a surface in the scene's frame, for the moment's frame. */
export function createTailSheetMesh(sheet: TailSheet, frame: Frame, color: string): TailSheetMesh {
  const nx = sheet.xs.length, ny = sheet.ys.length;
  const edges = cellsFromEdge(sheet);
  const positions = new Float32Array(nx * ny * 3);
  const along = new Float32Array(nx * ny), across = new Float32Array(nx * ny);
  const strength = new Float32Array(nx * ny), edge = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const z = sheet.z[k];
      if (!Number.isFinite(z)) continue;
      positions.set(gsmToScene(frame, [sheet.xs[i], sheet.ys[j], z]), k * 3);
      along[k] = sheet.xs[i];
      across[k] = sheet.ys[j];
      strength[k] = sheetBrightness(sheet.lobe[k]);
      edge[k] = edges[k] / EDGE_CELLS;
    }
  }
  const index: number[] = [];
  const has = (i: number, j: number) => Number.isFinite(sheet.z[j * nx + i]);
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      if (!(has(i, j) && has(i + 1, j) && has(i, j + 1) && has(i + 1, j + 1))) continue;
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('along', new THREE.BufferAttribute(along, 1));
  geometry.setAttribute('across', new THREE.BufferAttribute(across, 1));
  geometry.setAttribute('strength', new THREE.BufferAttribute(strength, 1));
  geometry.setAttribute('edge', new THREE.BufferAttribute(edge, 1));
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, time: { value: 0 } },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const object = new THREE.Mesh(geometry, material);
  object.name = 'tail-sheet';
  object.frustumCulled = false;
  return {
    object,
    setTime(seconds) { material.uniforms.time.value = seconds % 3600; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
