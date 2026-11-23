import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GeometryFactory } from '../geometry/geometryFactory';

describe('GeometryFactory basics', () => {
  it('buildBorderLines ignores segments with <2 coords', () => {
    const g = GeometryFactory.buildBorderLines([
      { id: 'valid', coordinates: [[0,0],[1,1]] },
      { id: 'short', coordinates: [[0,0]] } as any
    ]);
    // One batch for every outline (D-GV GV0.2), recording which lines it holds.
    expect(g.children.length).toBe(1);
    expect(g.children[0].userData.lines.map((l: { id: string }) => l.id)).toEqual(['valid']);
  });
  it('buildTerritoryPolygons builds mesh with hole', () => {
    const g = GeometryFactory.buildTerritoryPolygons([
      { id: 'poly', rings: [
        [[0,0],[2,0],[2,2],[0,2],[0,0]],
        [[0.5,0.5],[1,0.5],[1,1],[0.5,1],[0.5,0.5]]
      ] }
    ]);
    expect(g.children.length).toBe(1);
    expect(g.children[0] instanceof THREE.Mesh).toBe(true);
  });
});
