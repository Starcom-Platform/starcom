/**
 * A report placed only roughly is drawn with the area it could be in
 * (decision D-F, section 18, item 3).
 *
 * The area is surface geometry, so it scales with the camera: at a share card's
 * altitude a county is smaller than the 35 px glyph over it and stays hidden,
 * and it appears as a person zooms in — where a pin would otherwise claim a
 * precision nobody stated.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildPrecisionAreas, COARSE_PRECISION_M, INTEL_AREA_TYPE } from '../precisionAreas';

const RADIUS = 100;
const EARTH_M = 6_371_000;

describe('buildPrecisionAreas', () => {
  it('draws nothing for a report placed finer than the threshold, or with no stated precision', () => {
    expect(buildPrecisionAreas([
      { lat: 40, lng: -100, precisionM: COARSE_PRECISION_M - 1, color: '#8fa3b0' },
      { lat: 41, lng: -100, precisionM: null, color: '#8fa3b0' },
    ], RADIUS)).toBeNull();
  });

  it('draws one object for every coarse report, not one per report', () => {
    const areas = buildPrecisionAreas([
      { lat: 40, lng: -100, precisionM: 30_000, color: '#8fa3b0' },
      { lat: 35, lng: -90, precisionM: 250_000, color: '#ff4d4f' },
    ], RADIUS)!;
    expect(areas.userData.type).toBe(INTEL_AREA_TYPE);
    expect(areas.userData.areas).toBe(2);
    expect(areas.children.map((c) => c.type).sort()).toEqual(['LineSegments', 'Mesh']);
  });

  it('draws the area at its true size on the globe', () => {
    const areas = buildPrecisionAreas([{ lat: 0, lng: 0, precisionM: 100_000, color: '#8fa3b0' }], RADIUS)!;
    const outline = areas.children.find((c) => c.type === 'LineSegments') as THREE.LineSegments;
    const pos = outline.geometry.getAttribute('position');
    const centre = new THREE.Vector3(0, 0, 1);
    // Every edge vertex sits 100 km from the centre along the surface.
    for (let i = 0; i < pos.count; i += 7) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
      const surfaceM = Math.acos(Math.min(1, v.dot(centre))) * EARTH_M;
      expect(surfaceM).toBeGreaterThan(97_000);
      expect(surfaceM).toBeLessThan(103_000);
    }
  });

  it('is never a pick target, so a click goes to the glyph over it', () => {
    const areas = buildPrecisionAreas([{ lat: 0, lng: 0, precisionM: 50_000, color: '#8fa3b0' }], RADIUS)!;
    const hits: THREE.Intersection[] = [];
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 300), new THREE.Vector3(0, 0, -1));
    areas.traverse((o) => o.raycast(raycaster, hits));
    expect(hits).toHaveLength(0);
  });
});

import { setReplayMoment } from '../replayClock';

describe('precision areas in a replay', () => {
  it('hide while a replay runs, and come back after', () => {
    const areas = buildPrecisionAreas([{ lat: 0, lng: 0, precisionM: 50_000, color: '#8fa3b0' }], RADIUS)!;
    const draw = () => areas.traverse((o) => o.onBeforeRender(null as never, null as never, null as never, null as never, (o as THREE.Mesh).material as THREE.Material, null as never));
    const opacities = () => areas.children.map((c) => ((c as THREE.Mesh).material as THREE.Material).opacity);
    const shown = opacities();

    setReplayMoment({ atMs: 0, fadeMs: 1 });
    draw();
    expect(opacities()).toEqual([0, 0]);
    setReplayMoment(null);
    draw();
    expect(opacities()).toEqual(shown);
  });
});
