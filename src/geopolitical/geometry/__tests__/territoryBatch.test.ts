import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createPartMotion,
  easeTerritoryParts,
  mergeTerritoryParts,
  setTerritoryPartTargets,
  territoryPartAt,
  territoryPartGeometry,
  type TerritoryPartSource,
} from '../territoryBatch';

// Two unit triangles side by side in the z = 0 plane, and a square of two triangles.
const left: TerritoryPartSource = { id: 'AAA:0-0', countryCode: 'AAA', name: 'Aland', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] };
const right: TerritoryPartSource = {
  id: 'BBB:0-0', countryCode: 'BBB', positions: [3, 0, 0, 4, 0, 0, 4, 1, 0, 3, 1, 0], indices: [0, 1, 2, 0, 2, 3],
  qa: { status: 'warn' },
};
const colours: Record<string, number> = { AAA: 0x00ff41, BBB: 0x0094ff };
const look = {
  colorOf: (p: TerritoryPartSource) => colours[p.countryCode!],
  tintOf: (p: TerritoryPartSource) => (p.qa?.status === 'warn' ? { color: 0xffcc00, strength: 0.5 } : null),
};

function batchMesh(sources: TerritoryPartSource[]) {
  const { geometry, parts } = mergeTerritoryParts(sources, look);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.userData = { parts, motion: createPartMotion(parts.length) };
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('mergeTerritoryParts', () => {
  it('puts every part in one geometry, with each part\'s indices moved to its own vertices', () => {
    const { geometry, parts } = mergeTerritoryParts([left, right], look);
    expect(geometry.getAttribute('position').count).toBe(7);
    expect(Array.from(geometry.index!.array)).toEqual([0, 1, 2, 3, 4, 5, 3, 5, 6]);
    expect(parts.map(({ id, vertexStart, vertexCount }) => ({ id, vertexStart, vertexCount }))).toEqual([
      { id: 'AAA:0-0', vertexStart: 0, vertexCount: 3 },
      { id: 'BBB:0-0', vertexStart: 3, vertexCount: 4 },
    ]);
    expect(parts[0]).toMatchObject({ countryCode: 'AAA', name: 'Aland' });
  });

  it('marks every vertex with its part, its part\'s colour and its part\'s QA tint', () => {
    const { geometry } = mergeTerritoryParts([left, right], look);
    const part = geometry.getAttribute('aPart');
    const base = geometry.getAttribute('aBaseColor');
    const tint = geometry.getAttribute('aQaTint');
    expect(Array.from({ length: 7 }, (_, v) => part.getX(v))).toEqual([0, 0, 0, 1, 1, 1, 1]);
    const blue = new THREE.Color(0x0094ff);
    expect([base.getX(4), base.getY(4), base.getZ(4)]).toEqual(Array.from(new Float32Array([blue.r, blue.g, blue.b])));
    expect(tint.getW(0)).toBe(0);
    expect(tint.getW(6)).toBe(0.5);
  });

  it('skips a part with no triangles instead of misnumbering the parts after it', () => {
    const empty: TerritoryPartSource = { id: 'NUL:0-0', positions: [], indices: [] };
    const { parts, geometry } = mergeTerritoryParts([empty, right], look);
    expect(parts.map((p) => p.id)).toEqual(['BBB:0-0']);
    expect(geometry.getAttribute('aPart').getX(0)).toBe(0);
  });
});

describe('finding a part', () => {
  const rayAt = (x: number, y: number) => new THREE.Raycaster(new THREE.Vector3(x, y, 5), new THREE.Vector3(0, 0, -1));

  it('names the part a real raycast struck', () => {
    const mesh = batchMesh([left, right]);
    expect(territoryPartAt(rayAt(0.2, 0.2).intersectObject(mesh)[0])).toBe(0);
    expect(territoryPartAt(rayAt(3.8, 0.6).intersectObject(mesh)[0])).toBe(1);
    expect(territoryPartAt(rayAt(2, 0.5).intersectObject(mesh)[0])).toBeNull();
  });

  it('copies out one part\'s triangles, even after the index buffer has been reordered', () => {
    const mesh = batchMesh([left, right]);
    // What three-mesh-bvh does when it builds its tree: the same triangles, in another order.
    mesh.geometry.index!.array.set([3, 5, 6, 0, 1, 2, 3, 4, 5]);
    const copy = territoryPartGeometry(mesh, 1)!;
    expect(copy.getAttribute('position').count).toBe(4);
    expect(Array.from(copy.index!.array)).toEqual([0, 2, 3, 0, 1, 2]);
    expect(copy.getAttribute('position').getX(1)).toBe(4);
    expect(territoryPartGeometry(mesh, 9)).toBeNull();
  });
});

describe('hover, selection and dimming per part', () => {
  it('selecting a part dims every other part', () => {
    const motion = createPartMotion(3);
    setTerritoryPartTargets(motion, 0, 2);
    expect(Array.from(motion.targetHover)).toEqual([1, 0, 0]);
    expect(Array.from(motion.targetSelect)).toEqual([0, 0, 1]);
    expect(Array.from(motion.targetDim)).toEqual([1, 1, 0]);
    setTerritoryPartTargets(motion, null, null);
    expect(Array.from(motion.targetDim)).toEqual([0, 0, 0]);
  });

  it('eases toward the targets, writes each part\'s texel, and reports when nothing changed', () => {
    const motion = createPartMotion(2);
    const texels = motion.texture.image.data as Uint8Array;
    setTerritoryPartTargets(motion, 1, null);

    expect(easeTerritoryParts(motion, 0.5)).toBe(true);
    expect(motion.hover[1]).toBeCloseTo(0.5);
    expect(texels[4]).toBe(128);

    expect(easeTerritoryParts(motion, 1)).toBe(true);
    expect([texels[4], texels[5], texels[6]]).toEqual([255, 0, 0]);
    expect(easeTerritoryParts(motion, 1)).toBe(false);
  });

  it('lays parts out across texture rows, so a large globe still gets one texel each', () => {
    const motion = createPartMotion(2500);
    expect(motion.texture.image.width).toBe(1024);
    expect(motion.texture.image.height).toBe(3);
    setTerritoryPartTargets(motion, 2499, null);
    easeTerritoryParts(motion, 1);
    expect((motion.texture.image.data as Uint8Array)[2499 * 4]).toBe(255);
  });
});
