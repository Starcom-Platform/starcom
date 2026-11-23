import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { buildBorderLineBatches } from '../fatBorderLines';
import { batchedLines, lineBatchData, type LineLook } from '../lineBatches';
import type { LineFeature } from '../geometryFactory';

const look: LineLook = { opacity: 0.8, linewidth: 1, dashed: false, dashSize: 3, gapSize: 2, dashScale: 1, renderOrder: 100 };
const plain = () => ({ color: 0x00ff41, look });

describe('buildBorderLineBatches', () => {
  it('draws features sharing a look as one batch, keeping each feature\'s id and segments', () => {
    const features: LineFeature[] = [
      { id: 'A', coordinates: [[0, 0], [10, 10]] },
      { id: 'B', coordinates: [[20, 20], [30, 30], [40, 10]] }
    ];
    const group = buildBorderLineBatches(features, plain);

    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toBeInstanceOf(LineSegments2);
    expect(batchedLines(group).map((l) => [l.id, l.count])).toEqual([['A', 1], ['B', 2]]);
  });

  it('splits features into batches by look, each line keeping its classification', () => {
    const features = [
      { id: 'I', coordinates: [[0, 0], [1, 1]] as [number, number][], classification: 'international' },
      { id: 'D', coordinates: [[2, 0], [3, 1]] as [number, number][], classification: 'disputed' }
    ];
    const group = buildBorderLineBatches(features, (f) => ({
      color: 0xffffff,
      classification: f.classification,
      look: f.classification === 'disputed' ? { ...look, dashed: true, renderOrder: 103 } : look
    }));

    expect(group.children.map((c) => lineBatchData(c)!.look.dashed)).toEqual([false, true]);
    expect(batchedLines(group).map((l) => l.classification)).toEqual(['international', 'disputed']);
  });

  it('skips a feature with fewer than 2 coordinates instead of building a degenerate line', () => {
    const features: LineFeature[] = [
      { id: 'DEGENERATE', coordinates: [[0, 0]] },
      { id: 'VALID', coordinates: [[0, 0], [1, 1]] }
    ];
    expect(batchedLines(buildBorderLineBatches(features, plain)).map((l) => l.id)).toEqual(['VALID']);
  });

  it('skips a feature with a missing/non-array coordinates field', () => {
    const features = [
      { id: 'MISSING' } as unknown as LineFeature,
      { id: 'VALID', coordinates: [[0, 0], [1, 1]] }
    ] as LineFeature[];
    expect(batchedLines(buildBorderLineBatches(features, plain)).map((l) => l.id)).toEqual(['VALID']);
  });

  it('writes line distances (required for LineMaterial dashing to render correctly)', () => {
    const features: LineFeature[] = [{ id: 'A', coordinates: [[0, 0], [10, 10], [20, 0]] }];
    const batch = buildBorderLineBatches(features, plain).children[0] as LineSegments2;
    expect(batch.geometry.getAttribute('instanceDistanceStart')).toBeDefined();
  });

  it('projects coordinates onto the sphere using the given radius/elevation (not left at raw lng/lat)', () => {
    const features: LineFeature[] = [{ id: 'A', coordinates: [[0, 0], [90, 0]] }];
    const batch = buildBorderLineBatches(features, plain, { radius: 50, elevation: 0 }).children[0] as LineSegments2;
    // LineSegmentsGeometry stores positions as instanced start/end attributes,
    // not a plain "position" attribute.
    const posAttr = batch.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    const firstPoint = new THREE.Vector3(posAttr.getX(0), posAttr.getY(0), posAttr.getZ(0));
    // At radius 50, any on-sphere point must be ~50 units from the origin —
    // raw [lng,lat] values (0, 90) would not satisfy this.
    expect(firstPoint.length()).toBeCloseTo(50, 3);
  });
});
