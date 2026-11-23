/**
 * Does the outline layer put geometry in the scene, WHERE THE REPORT IS?
 *
 * Written after two live runs where the panel said "1 of 1 shape(s) drawn from
 * a simplified outline", the pin appeared, and no outline was anywhere on the
 * globe — including after raising it above the borders, which ruled out
 * elevation.
 *
 * ─── WHY THE FIRST TWO TESTS WERE NOT ENOUGH ───────────────────────────────
 *
 * They passed throughout. Geometry WAS in the scene the whole time; it was 90°
 * of longitude away, off the coast of Somalia, because the group inherited none
 * of the -90° turn three-globe puts between the globe mesh's frame — which is
 * what GeometryFactory builds in — and the scene's. "Something was drawn" is
 * not the claim this layer makes. "The publisher's shape is where they said"
 * is, and only the third test states it.
 *
 * It is checked against latLngToGlobeWorld, which is itself checked against
 * three-globe's own getCoords in globeCoordinates.test.ts, so this does not
 * grade the projection against a copy of itself — the mistake the note in
 * utils/globeCoordinates.ts records.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { useGlobeIntelOutlines } from '../useGlobeIntelOutlines';
import { latLngToGlobeWorld } from '../../../../utils/globeCoordinates';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

const marker = (): IntelReportOverlayMarker => ({
  pubkey: 'r1', title: 't', content: '', tags: [],
  latitude: 10, longitude: 8, timestamp: 0, author: 'a',
  outline: {
    kind: 'polygon',
    parts: [[[10, 8], [12, 9], [11, 12], [9, 11], [10, 8]] as Array<[number, number]>],
    sourceVertices: 120, keptVertices: 5,
  },
} as IntelReportOverlayMarker);

const drawnIn = (scene: THREE.Scene) => {
  let n = 0;
  scene.traverse((o) => { if ((o as THREE.Line).isLine || (o as THREE.Mesh).isMesh) n += 1; });
  return n;
};

describe('useGlobeIntelOutlines in a scene', () => {
  it('adds drawable geometry for a marker carrying an outline', () => {
    const scene = new THREE.Scene();
    const ref = { current: { scene: () => scene } } as never;
    renderHook(() => useGlobeIntelOutlines(ref, [marker()], true));
    expect(drawnIn(scene)).toBeGreaterThan(0);
  });

  it('draws nothing when hidden', () => {
    const scene = new THREE.Scene();
    const ref = { current: { scene: () => scene } } as never;
    renderHook(() => useGlobeIntelOutlines(ref, [marker()], false));
    expect(drawnIn(scene)).toBe(0);
  });

  it('puts the first vertex at the coordinate the publisher sent', () => {
    const scene = new THREE.Scene();
    const ref = { current: { scene: () => scene } } as never;
    renderHook(() => useGlobeIntelOutlines(ref, [marker()], true));

    // Outlines are one anti-aliased batch (D-GV GV0.2): each segment's start is its first point.
    let line: LineSegments2 | undefined;
    scene.traverse((o) => { if (!line && (o as LineSegments2).isLineSegments2) line = o as LineSegments2; });
    expect(line).toBeDefined();

    // World position, so the group's own turn is part of what is measured —
    // reading the raw attribute would pass with the layer 90° out, which is
    // exactly how this shipped.
    scene.updateMatrixWorld(true);
    const position = line!.geometry.getAttribute('instanceStart');
    const drawn = new THREE.Vector3(position.getX(0), position.getY(0), position.getZ(0))
      .applyMatrix4(line!.matrixWorld);

    // The outline's first vertex is [lat 10, lon 8]; OUTLINE_ELEVATION is 0.34
    // above the globe's radius of 100.
    const expected = latLngToGlobeWorld(10, 8, 100.34);
    expect(drawn.x).toBeCloseTo(expected.x, 3);
    expect(drawn.y).toBeCloseTo(expected.y, 3);
    expect(drawn.z).toBeCloseTo(expected.z, 3);
  });
});
