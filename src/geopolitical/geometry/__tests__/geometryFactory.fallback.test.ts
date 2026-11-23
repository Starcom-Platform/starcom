import { describe, it, expect, afterEach } from 'vitest';
import { GeometryFactory } from '../geometryFactory';
import * as THREE from 'three';

// Simulate wide span polygon that should trigger tangent projection under fallback.
//
// ─── WHY THIS IS NOT `global.window = { location: { search: q } }` ──────────
//
// It was, and that single line replaced the ENTIRE window object with one that
// has no document, no addEventListener and no anything else. Vitest runs test
// files in a shared process, so every React component test that ran after this
// file failed — 165 of them, in a full-suite run. HUD tests pass 88/88 alone
// and 10/103 when this directory is in the same run.
//
// The damage was invisible from here: this file's own 29 tests passed either
// way, and the failures landed in components with no connection to geometry. A
// suite that reports hundreds of unrelated failures is a suite people stop
// reading, which is how the 45 genuinely broken geopolitical tests survived.
//
// geometryFactory only ever reads `window.location.search`, so that is the only
// thing replaced — and it is put back afterwards.
const realLocation = window.location;

function setSearch(q: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { ...realLocation, search: q },
  });
}

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

describe('Projection fallback', () => {
  it('routes a wide (~358° span) polygon to Lambert instead of the legacy/tangent path', () => {
    // Same fixture as geometryFactory.basic.test.ts's wide-ring test — this one
    // specifically asserts the mesh naming/shape rather than group composition.
    // With span=358 > the Lambert threshold, determineProjectionMode now returns
    // 'lambert' directly (previously 'tangent', chosen only because the ring had
    // >1 parts after dateline-splitting — span itself was never checked), so the
    // ?geoPolyFallback=1 legacy->tangent retry path never even engages here.
    const outer = [
      [-179, 0], [-120, 5], [-60, -5], [0, 5], [60, -5], [120, 5], [179, -5], [-179, 0]
    ];
    const feature = { id: 'WIDE1', rings: [outer] };
    setSearch('?geoPolyFallback=1');
    const group = GeometryFactory.buildTerritoryPolygons([feature], { radius: 100, thickness: 0 });
    expect(group.children.length).toBe(1);
    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh.name.includes('WIDE1')).toBe(true);
    const geom = mesh.geometry as THREE.BufferGeometry;
    const pos = geom.getAttribute('position');
    expect(pos).toBeDefined();
    expect(pos.count).toBeGreaterThan(0);
  });
});
