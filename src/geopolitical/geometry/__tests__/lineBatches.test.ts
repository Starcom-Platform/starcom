import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import {
  buildLineBatch,
  buildLineBatches,
  batchedLines,
  batchedLinePositions,
  buildLineHighlight,
  findBatchedLine,
  lineBatchData,
  recolourLineBatch,
  type LineLook,
} from '../lineBatches';

const solid: LineLook = { opacity: 0.8, linewidth: 1, dashed: false, dashSize: 3, gapSize: 2, dashScale: 1, renderOrder: 100 };
const dashed: LineLook = { ...solid, opacity: 0.9, dashed: true, renderOrder: 103 };

// Three points along x, then two along y: 2 segments and 1 segment.
const A = { id: 'A', positions: [0, 0, 0, 1, 0, 0, 3, 0, 0], color: 0xff0000 };
const B = { id: 'B', positions: [0, 0, 0, 0, 2, 0], color: 0x0000ff };

const segmentValue = (batch: LineSegments2, name: string, segment: number) => {
  const attr = batch.geometry.getAttribute(name) as THREE.InterleavedBufferAttribute;
  return [attr.getX(segment), attr.getY(segment), attr.getZ(segment)];
};

describe('buildLineBatch', () => {
  it('draws every path in one object and records where each path\'s segments sit', () => {
    const batch = buildLineBatch([A, B], solid)!;
    expect(batch).toBeInstanceOf(LineSegments2);
    expect((batch.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(3);
    expect(lineBatchData(batch)!.lines.map(({ id, start, count }) => ({ id, start, count }))).toEqual([
      { id: 'A', start: 0, count: 2 },
      { id: 'B', start: 2, count: 1 },
    ]);
  });

  it('gives each segment its own line\'s colour, over a white material', () => {
    const batch = buildLineBatch([A, B], solid)!;
    const red = new THREE.Color(0xff0000);
    const blue = new THREE.Color(0x0000ff);
    expect(segmentValue(batch, 'instanceColorStart', 1)).toEqual(Array.from(new Float32Array([red.r, red.g, red.b])));
    expect(segmentValue(batch, 'instanceColorEnd', 2)).toEqual(Array.from(new Float32Array([blue.r, blue.g, blue.b])));
    const material = batch.material as LineMaterial;
    expect(material.vertexColors).toBe(true);
    expect(material.color.getHex()).toBe(0xffffff);
  });

  it('puts a colour every path shares on the material, with no colour per segment', () => {
    const batch = buildLineBatch([A, { ...B, color: 0xff0000 }], solid)!;
    const material = batch.material as LineMaterial;
    expect(material.vertexColors).toBe(false);
    expect(material.color.getHex()).toBe(0xff0000);
    expect(batch.geometry.getAttribute('instanceColorStart')).toBeUndefined();
  });

  it('carries the look: opacity, width, dashing, draw order, and no depth writes', () => {
    const batch = buildLineBatch([A], dashed)!;
    const material = batch.material as LineMaterial;
    expect(material.opacity).toBeCloseTo(0.9);
    expect(material.dashed).toBe(true);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(batch.renderOrder).toBe(103);
  });

  it('restarts dash distance at the start of each path, so a pattern begins where its line begins', () => {
    const batch = buildLineBatch([A, B], dashed)!;
    const start = batch.geometry.getAttribute('instanceDistanceStart') as THREE.InterleavedBufferAttribute;
    const end = batch.geometry.getAttribute('instanceDistanceEnd') as THREE.InterleavedBufferAttribute;
    expect([start.getX(0), end.getX(0), start.getX(1), end.getX(1)]).toEqual([0, 1, 1, 3]);
    expect([start.getX(2), end.getX(2)]).toEqual([0, 2]);
  });

  it('skips a path with fewer than two points, and returns null when none has two', () => {
    const single = { id: 'S', positions: [5, 5, 5], color: 0xffffff };
    expect(lineBatchData(buildLineBatch([single, B], solid))!.lines.map((l) => l.id)).toEqual(['B']);
    expect(buildLineBatch([single], solid)).toBeNull();
    expect(buildLineBatch([], solid)).toBeNull();
  });
});

describe('buildLineBatches', () => {
  it('makes one batch per look, drawn in renderOrder', () => {
    const group = buildLineBatches([
      { ...B, look: dashed },
      { ...A, look: solid },
      { id: 'C', positions: [0, 0, 0, 0, 0, 4], color: 0x00ff00, look: { ...solid } },
    ]);
    expect(group.children).toHaveLength(2);
    expect(group.children.map((c) => c.renderOrder)).toEqual([100, 103]);
    expect(batchedLines(group).map((l) => l.id)).toEqual(['A', 'C', 'B']);
  });
});

describe('finding and highlighting one line', () => {
  it('finds a line by id across several groups and copies out only its segments', () => {
    const land = buildLineBatches([{ ...A, look: solid }]);
    const sea = buildLineBatches([{ ...B, look: dashed }]);
    const found = findBatchedLine([land, null, sea], 'B')!;
    expect(found.batch.parent).toBe(sea);
    expect(Array.from(batchedLinePositions(found.batch, found.line))).toEqual([0, 0, 0, 0, 2, 0]);
    expect(findBatchedLine([land, sea], 'missing')).toBeNull();
  });

  it('draws the highlight as its own object above the batch, with the batch\'s dashing', () => {
    const batch = buildLineBatch([A, B], dashed)!;
    const line = lineBatchData(batch)!.lines[0];
    const highlight = buildLineHighlight(batch, line, { color: 0xffe066, opacity: 1, linewidth: 2 });
    const material = highlight.material as LineMaterial;
    expect((highlight.geometry as THREE.InstancedBufferGeometry).instanceCount).toBe(2);
    expect(highlight.renderOrder).toBe(104);
    expect(material.color.getHex()).toBe(0xffe066);
    expect(material.dashed).toBe(true);
    expect(material.vertexColors).toBe(false);

    highlight.geometry.dispose();
    expect(batch.geometry.getAttribute('instanceStart')).toBeDefined();
    expect(highlight.geometry).not.toBe(batch.geometry);
  });
});

describe('recolourLineBatch', () => {
  const hexOfSegment = (batch: LineSegments2, segment: number) =>
    new THREE.Color().setRGB(...(segmentValue(batch, 'instanceColorStart', segment) as [number, number, number])).getHex();

  it('repaints each line of a mixed batch in place, every segment of it, and says what it now is', () => {
    const batch = buildLineBatch([A, B], solid)!;
    const geometry = batch.geometry;
    const colours = (batch.geometry.getAttribute('instanceColorStart') as THREE.InterleavedBufferAttribute).data;
    const uploaded = colours.version;
    expect(recolourLineBatch(batch, (line) => (line.id === 'A' ? 0x00ff00 : 0x0000ff))).toBe(true);
    expect(batch.geometry).toBe(geometry);
    // Marked for upload, or the GPU would keep drawing the old colours.
    expect(colours.version).toBeGreaterThan(uploaded);
    expect([hexOfSegment(batch, 0), hexOfSegment(batch, 1), hexOfSegment(batch, 2)]).toEqual([0x00ff00, 0x00ff00, 0x0000ff]);
    expect(lineBatchData(batch)!.lines.map((l) => l.color)).toEqual([0x00ff00, 0x0000ff]);
  });

  it('repaints a batch of one colour on its material', () => {
    const batch = buildLineBatch([A, { ...B, color: A.color }], solid)!;
    expect(recolourLineBatch(batch, () => 0x123456)).toBe(true);
    expect((batch.material as LineMaterial).color.getHex()).toBe(0x123456);
    expect(lineBatchData(batch)!.lines.every((l) => l.color === 0x123456)).toBe(true);
  });

  it('changes nothing, and says so, when every line already has its colour', () => {
    const mixed = buildLineBatch([A, B], solid)!;
    expect(recolourLineBatch(mixed, (line) => line.color)).toBe(false);
    const shared = buildLineBatch([A], solid)!;
    expect(recolourLineBatch(shared, () => A.color)).toBe(false);
  });
});
