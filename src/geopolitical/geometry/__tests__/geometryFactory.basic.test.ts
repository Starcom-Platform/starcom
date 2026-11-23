import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GeometryFactory, type PolygonFeature } from '../geometryFactory';

// Utility to count side wall quads for outer ring (approx) for extruded forms
function triangleCount(geom: THREE.BufferGeometry): number {
  const idx = geom.getIndex();
  return idx ? idx.count / 3 : 0;
}

describe('GeometryFactory basic polygon builds', () => {
  it('builds flat legacy polygon', () => {
    const feature: PolygonFeature = {
      id: 'TEST1',
      rings: [
        [ [-10,0], [0,10], [10,0], [0,-10], [-10,0] ]
      ]
    } as any;
    const group = GeometryFactory.buildTerritoryPolygons([feature], { radius: 100, thickness: 0, elevation: 5 });
    expect(group.children.length).toBe(1);
    const mesh = group.children[0] as THREE.Mesh;
    const geom = mesh.geometry as THREE.BufferGeometry;
    expect(triangleCount(geom)).toBeGreaterThan(0);
  });

  it('builds extruded polygon with hole side walls', () => {
    // Square outer (4 pts) with a small square hole (4 pts): top cap = 8 triangles
    // (earcut on a "picture frame" shape), bottom cap = 8 (mirrored), outer wall =
    // 4 edges x 2 = 8, hole wall = 4 edges x 2 = 8. Total = 32. Previously this was
    // 22 (no hole wall at all — buildSphericalExtrudedShape only walled the outer
    // contour) and briefly 28/30 mid-fix once hole walls existed but the wall-loop's
    // "last point duplicates first" assumption silently dropped one closing edge
    // for the hole (shape.getPoints() vs. an unclosed hole Path.getPoints() differ).
    const feature: PolygonFeature = {
      id: 'EXTRUDE1',
      rings: [
        [ [0,0],[4,0],[4,4],[0,4],[0,0] ],
        [ [1,1],[1,2],[2,2],[2,1],[1,1] ]
      ]
    } as any;
    const group = GeometryFactory.buildTerritoryPolygons([feature], { radius: 100, thickness: 2, elevation: 5 });
    const mesh = group.children[0] as THREE.Mesh;
    const geom = mesh.geometry as THREE.BufferGeometry;
    const tri = triangleCount(geom);
    expect(tri).toBe(32);
  });

  it('routes a near-360°-spanning ring to the Lambert projection and never emits a degenerate empty mesh', () => {
    // This ring is adversarial: it hops the dateline multiple times and spans ~358°
    // of longitude. It used to be routed to the orthographic tangent-plane
    // projection (only valid well under a hemisphere from its center) purely
    // because it happened to have >1 parts after dateline-splitting — the actual
    // wide span was never checked. It's also a regression check for a real bug:
    // the dateline split can produce a degenerate 1-point sliver part, which
    // previously reached mesh construction and was added to the group with no
    // position attribute at all (group.children.length === 2, second mesh empty).
    (globalThis as any).window = { location: { search: '?geoPolyFallback=1' } };
    const feature: PolygonFeature = { id: 'WIDE', rings: [ [ [-179,0],[-120,5],[-60,-5],[0,5],[60,-5],[120,5],[179,-5],[-179,0] ] ] } as any;
    const group = GeometryFactory.buildTerritoryPolygons([feature], { radius: 100, thickness: 0 });

    expect(group.children.length).toBe(1);
    const mesh = group.children[0] as THREE.Mesh;
    const geom = mesh.geometry as THREE.BufferGeometry;
    const pos = geom.getAttribute('position');
    expect(pos).toBeDefined();
    expect(pos!.count).toBeGreaterThan(0);
  });
});
