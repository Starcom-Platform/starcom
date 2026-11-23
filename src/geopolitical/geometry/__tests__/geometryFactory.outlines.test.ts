/**
 * Outlines drawn as one anti-aliased batch that follows the globe (D-GV GV0.2).
 *
 * War & Conflict's edges and rings, the Watch modes' outlines, Missions, region marks, GDACS tracks and intel
 * outlines were a `THREE.Line` each: one device pixel wide, a draw call apiece, chords between their points.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { GeometryFactory, alongGreatCircles } from '../geometryFactory';

/** Great-circle angle between two [lng, lat] points, in degrees. */
function degreesBetween([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const r = Math.PI / 180;
  const c = Math.sin(lat1 * r) * Math.sin(lat2 * r) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) / r;
}

describe('alongGreatCircles', () => {
  it('splits a long leg so no piece spans more than the limit, and keeps the ends', () => {
    const out = alongGreatCircles([[0, 0], [30, 40]], 1);
    expect(out[0]).toEqual([0, 0]);
    expect(out.at(-1)).toEqual([30, 40]);
    for (let i = 1; i < out.length; i++) expect(degreesBetween(out[i - 1], out[i])).toBeLessThanOrEqual(1 + 1e-9);
    expect(out.length).toBeGreaterThan(45);
  });

  it('follows the great circle, not the latitude: a leg along 60°N bows toward the pole', () => {
    const out = alongGreatCircles([[-60, 60], [60, 60]], 1);
    const middle = out[Math.floor(out.length / 2)];
    expect(middle[1]).toBeGreaterThan(70);
  });

  it('keeps short legs as they are', () => {
    const path: [number, number][] = [[10, 10], [10.5, 10.2], [10.9, 10.4]];
    expect(alongGreatCircles(path, 1)).toEqual(path);
  });

  it('crosses the antimeridian the short way', () => {
    const out = alongGreatCircles([[179, 0], [-179, 0]], 1);
    expect(out).toHaveLength(3);
    expect(Math.abs(out[1][0])).toBeCloseTo(180, 6);
  });
});

describe('buildBorderLines', () => {
  const features = [
    { id: 'a', coordinates: [[0, 0], [20, 0]] as [number, number][] },
    { id: 'b', coordinates: [[30, 10], [31, 10], [32, 11]] as [number, number][] },
    { id: 'too-short', coordinates: [[5, 5]] as [number, number][] },
  ];

  it('draws every outline in one batch, its width in screen pixels', () => {
    const group = GeometryFactory.buildBorderLines(features, { color: 0xff0000, opacity: 0.5 });
    expect(group.children).toHaveLength(1);
    const batch = group.children[0] as LineSegments2;
    expect(batch).toBeInstanceOf(LineSegments2);
    const material = batch.material as LineMaterial;
    expect(material.linewidth).toBeGreaterThan(1);
    expect(material.opacity).toBe(0.5);
    expect(material.color.getHex()).toBe(0xff0000);
    expect(batch.userData.lines.map((l: { id: string }) => l.id)).toEqual(['a', 'b']);
  });

  it('puts every point on the sphere at its elevation, and splits the 20° leg', () => {
    const group = GeometryFactory.buildBorderLines([features[0]], { radius: 100, elevation: 0.5 });
    const start = (group.children[0] as LineSegments2).geometry.getAttribute('instanceStart') as THREE.InterleavedBufferAttribute;
    expect(start.count).toBe(20);
    for (let i = 0; i < start.count; i++) {
      expect(Math.hypot(start.getX(i), start.getY(i), start.getZ(i))).toBeCloseTo(100.5, 4);
    }
  });

  it('returns an empty group when no outline has two points, as GDACS checks for', () => {
    expect(GeometryFactory.buildBorderLines([features[2]]).children).toHaveLength(0);
  });
});
