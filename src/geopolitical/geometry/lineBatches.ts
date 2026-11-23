/**
 * Many lines, few draw calls.
 *
 * Every border, maritime boundary and diplomatic arc was its own Line2: its own
 * geometry, material and draw call. Lines that share a look (width, opacity,
 * dashing, draw order) now share one LineSegments2, and the one thing that differs
 * between them, colour, rides along per segment.
 *
 * A batch records which segments belong to which line (userData.lines), so a hover
 * can still pick out one border and draw it alone, and a probe can still say which
 * classification sits under the centre of the screen.
 */
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { GlobeNoteSet } from '../../features/globe/noteDetail/globeNoteStore';

/** Everything a batch holds in common. Lines differing in any of these go to separate batches. */
export interface LineLook {
  opacity: number;
  linewidth: number;
  dashed: boolean;
  dashSize: number;
  gapSize: number;
  dashScale: number;
  renderOrder: number;
}

export interface LinePath {
  id: string;
  /** Flattened xyz: two points or more. */
  positions: ArrayLike<number>;
  color: number;
  classification?: string;
  /** What a hover on the line says (useGlobePointTooltips), when its group is registered for tooltips. */
  tooltip?: string;
  /** What a click on it opens, beside the tooltip (D-GV GV0.4). */
  opens?: GlobeNoteSet | null;
}

/** Where one line's segments sit inside its batch. */
export interface BatchedLine {
  id: string;
  color: number;
  classification?: string;
  start: number;
  count: number;
  tooltip?: string;
  opens?: GlobeNoteSet | null;
}

export interface LineBatchData {
  lines: BatchedLine[];
  look: LineLook;
}

const lookKey = (look: LineLook) =>
  [look.opacity, look.linewidth, look.dashed, look.dashSize, look.gapSize, look.dashScale, look.renderOrder].join('|');

function writeDistances(geometry: LineSegmentsGeometry, distances: Float32Array): void {
  // Written here rather than by LineSegments2.computeLineDistances, which runs one
  // distance across the whole batch. Restarting at each line keeps a dash pattern
  // starting where that line starts, as it did when every line was its own object.
  const buffer = new THREE.InstancedInterleavedBuffer(distances, 2, 1);
  geometry.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(buffer, 1, 0));
  geometry.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(buffer, 1, 1));
}

function lineMaterial(look: LineLook, color: number, vertexColors: boolean): LineMaterial {
  return new LineMaterial({
    color,
    vertexColors,
    transparent: true,
    depthWrite: false,
    opacity: look.opacity,
    linewidth: look.linewidth,
    dashed: look.dashed,
    dashSize: look.dashSize,
    gapSize: look.gapSize,
    dashScale: look.dashScale,
  });
}

/** One draw call for every path given. Null when no path has two points. */
export function buildLineBatch(paths: LinePath[], look: LineLook): LineSegments2 | null {
  const usable = paths.filter((p) => p.positions.length >= 6 && p.positions.length % 3 === 0);
  const segmentCount = usable.reduce((n, p) => n + p.positions.length / 3 - 1, 0);
  if (segmentCount === 0) return null;

  // A colour every path shares goes on the material; only a mixed batch pays for a colour per segment.
  const sharedColor = usable.every((p) => p.color === usable[0].color) ? usable[0].color : null;
  const positions = new Float32Array(segmentCount * 6);
  const colors = sharedColor === null ? new Float32Array(segmentCount * 6) : null;
  const distances = new Float32Array(segmentCount * 2);
  const lines: BatchedLine[] = [];
  const color = new THREE.Color();
  let s = 0;
  for (const path of usable) {
    const p = path.positions;
    const points = p.length / 3;
    color.setHex(path.color);
    lines.push({
      id: path.id, color: path.color, classification: path.classification, start: s, count: points - 1,
      ...(path.tooltip !== undefined ? { tooltip: path.tooltip } : {}),
      ...(path.opens ? { opens: path.opens } : {}),
    });
    let travelled = 0;
    for (let i = 0; i < points - 1; i++, s++) {
      const a = i * 3;
      const b = a + 3;
      const o = s * 6;
      positions[o] = p[a]; positions[o + 1] = p[a + 1]; positions[o + 2] = p[a + 2];
      positions[o + 3] = p[b]; positions[o + 4] = p[b + 1]; positions[o + 5] = p[b + 2];
      if (colors) {
        colors[o] = colors[o + 3] = color.r;
        colors[o + 1] = colors[o + 4] = color.g;
        colors[o + 2] = colors[o + 5] = color.b;
      }
      distances[s * 2] = travelled;
      travelled += Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
      distances[s * 2 + 1] = travelled;
    }
  }

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  if (colors) geometry.setColors(colors);
  writeDistances(geometry, distances);

  // A mixed batch draws white, times each segment's own colour.
  const batch = new LineSegments2(geometry, lineMaterial(look, sharedColor ?? 0xffffff, colors !== null));
  batch.renderOrder = look.renderOrder;
  const data: LineBatchData = { lines, look };
  batch.userData = data;
  return batch;
}

/** Sorts paths into one batch per look, drawn in renderOrder. */
export function buildLineBatches(paths: Array<LinePath & { look: LineLook }>): THREE.Group {
  const byLook = new Map<string, { look: LineLook; paths: LinePath[] }>();
  for (const path of paths) {
    const key = lookKey(path.look);
    const entry = byLook.get(key) ?? { look: path.look, paths: [] };
    entry.paths.push(path);
    byLook.set(key, entry);
  }
  const group = new THREE.Group();
  [...byLook.values()]
    .sort((a, b) => a.look.renderOrder - b.look.renderOrder)
    .forEach(({ look, paths: batchPaths }) => {
      const batch = buildLineBatch(batchPaths, look);
      if (batch) group.add(batch);
    });
  return group;
}

export function lineBatchData(obj: THREE.Object3D | null | undefined): LineBatchData | null {
  if (!(obj instanceof LineSegments2)) return null;
  const data = obj.userData as Partial<LineBatchData>;
  return Array.isArray(data.lines) && data.look ? (data as LineBatchData) : null;
}

/** Every line held by a group's batches, in draw order. */
export function batchedLines(group: THREE.Object3D | null | undefined): BatchedLine[] {
  return (group?.children ?? []).flatMap((child) => lineBatchData(child)?.lines ?? []);
}

export function findBatchedLine(
  groups: Array<THREE.Object3D | null | undefined>,
  id: string,
): { batch: LineSegments2; line: BatchedLine } | null {
  for (const group of groups) {
    for (const child of group?.children ?? []) {
      const line = lineBatchData(child)?.lines.find((l) => l.id === id);
      if (line) return { batch: child as LineSegments2, line };
    }
  }
  return null;
}

/** The line a raycast hit on a batch met, by the segment it names (LineSegments2 gives it as `faceIndex`), or null. */
export function batchedLineAt(hit: THREE.Intersection): BatchedLine | null {
  const data = (hit.object as LineSegments2).isLineSegments2 ? lineBatchData(hit.object) : null;
  const segment = hit.faceIndex;
  if (!data || typeof segment !== 'number') return null;
  return data.lines.find((line) => segment >= line.start && segment < line.start + line.count) ?? null;
}

/** One line's segment endpoints, xyz xyz per segment, copied out of its batch. */
export function batchedLinePositions(batch: LineSegments2, line: BatchedLine): Float32Array {
  const start = batch.geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute;
  return (start.data.array as Float32Array).slice(line.start * 6, (line.start + line.count) * 6);
}

/**
 * One line drawn alone over its batch: the hover highlight. Its own geometry, so
 * disposing it never touches the batch.
 */
export function buildLineHighlight(
  batch: LineSegments2,
  line: BatchedLine,
  style: { color: number; opacity: number; linewidth: number },
): LineSegments2 {
  const { look } = lineBatchData(batch)!;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(batchedLinePositions(batch, line));
  const distanceStart = batch.geometry.getAttribute('instanceDistanceStart') as THREE.InterleavedBufferAttribute | undefined;
  if (distanceStart) {
    writeDistances(geometry, (distanceStart.data.array as Float32Array).slice(line.start * 2, (line.start + line.count) * 2));
  }
  const highlight = new LineSegments2(
    geometry,
    lineMaterial({ ...look, opacity: style.opacity, linewidth: style.linewidth }, style.color, false),
  );
  highlight.renderOrder = look.renderOrder + 1;
  highlight.name = `highlight:${line.id}`;
  highlight.raycast = () => {};
  return highlight;
}

/**
 * Gives a batch's lines the colours `colourOf` names, in place: a change of style
 * (territoryStyles.ts) and every card drawn in another style than the screen's go
 * through here, so it must not rebuild anything. Each line's stated colour follows,
 * so the key and the hover highlight read what is drawn. Returns whether anything changed.
 *
 * A batch whose lines share one colour holds it on the material, so they keep
 * sharing one: the first line's. That is exact while no two kinds of border share a
 * colour in any style, which territoryStyles.test.ts pins.
 */
export function recolourLineBatch(batch: LineSegments2, colourOf: (line: BatchedLine) => number): boolean {
  const data = lineBatchData(batch);
  if (!data || data.lines.length === 0) return false;
  const start = batch.geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute | undefined;
  let changed = false;
  if (!start) {
    const hex = colourOf(data.lines[0]);
    for (const line of data.lines) {
      if (line.color !== hex) changed = true;
      line.color = hex;
    }
    const material = batch.material as LineMaterial;
    if (material.color.getHex() !== hex) {
      material.color.setHex(hex);
      changed = true;
    }
    return changed;
  }
  const colours = start.data.array as Float32Array;
  const color = new THREE.Color();
  for (const line of data.lines) {
    const hex = colourOf(line);
    if (hex === line.color) continue;
    line.color = hex;
    color.setHex(hex);
    for (let s = line.start; s < line.start + line.count; s++) {
      const o = s * 6;
      colours[o] = colours[o + 3] = color.r;
      colours[o + 1] = colours[o + 4] = color.g;
      colours[o + 2] = colours[o + 5] = color.b;
    }
    changed = true;
  }
  if (changed) start.data.needsUpdate = true;
  return changed;
}
