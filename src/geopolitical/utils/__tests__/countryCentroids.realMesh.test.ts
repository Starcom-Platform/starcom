/**
 * Every country's point, on the territory mesh the app actually ships (LOD0, the tier
 * getCountryCentroids reads), must lie on that country's own land.
 *
 * Five features place marks at these points — Diplomacy, Conflict, Resource Zones,
 * Cyber Threats and the header's country search. Measured 2026-09-11, before this
 * test: France's point was at 43.3°N 6.5°W, in the sea off Galicia, pulled ~800 km by
 * French Guiana; Malaysia's was in the South China Sea between its two halves.
 *
 * The inside test here is written independently of the implementation's: sign of
 * triple products against each spherical triangle, not a ray cast.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { computeCountryCentroids, type CentroidSourcePart } from '../countryCentroids';
import { latLonToVector3 } from '../latLonToVector3';

interface MeshPart extends CentroidSourcePart { name: string; qa?: { status?: string } }

const mesh = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../../../public/geopolitical/territories-baked/lod0/parts-mesh.json'), 'utf8',
)) as { parts: MeshPart[] };
// As getCountryCentroids does.
const parts = mesh.parts.filter((p) => p.qa?.status !== 'fail');

/** The baked direction of a lat/lng — the convention the bake uses (z negated). */
function bakedDirection(lat: number, lng: number): THREE.Vector3 {
  const v = latLonToVector3(lat, lng, { radius: 1, elevation: 0, invertX: false });
  return new THREE.Vector3(v.x, v.y, -v.z).normalize();
}

function onLand(code: string, lat: number, lng: number): boolean {
  const d = bakedDirection(lat, lng);
  const v = (p: MeshPart, i: number) => new THREE.Vector3(p.positions[i * 3], p.positions[i * 3 + 1], p.positions[i * 3 + 2]);
  const triple = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => a.dot(b.clone().cross(c));
  return parts.some((p) => {
    if (p.countryCode !== code) return false;
    for (let t = 0; t < p.indices.length; t += 3) {
      const a = v(p, p.indices[t]), b = v(p, p.indices[t + 1]), c = v(p, p.indices[t + 2]);
      const s1 = triple(a, b, d), s2 = triple(b, c, d), s3 = triple(c, a, d);
      // Same side of all three great circles, and the near side of the globe.
      if (((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) && d.dot(a) > 0) return true;
    }
    return false;
  });
}

describe('country points on the shipped territory mesh', () => {
  const centroids = computeCountryCentroids(parts);

  it('gives a point to every country the mesh has', () => {
    const codes = new Set(parts.map((p) => p.countryCode).filter(Boolean));
    expect(codes.size).toBeGreaterThan(200);
    expect([...codes].filter((c) => !centroids.has(c!))).toEqual([]);
  });

  it('puts every country\'s point on its own land', () => {
    const offLand = [...centroids].filter(([code, c]) => !onLand(code, c.lat, c.lng))
      .map(([code, c]) => `${code} ${c.lat.toFixed(1)},${c.lng.toFixed(1)}`);
    expect(offLand).toEqual([]);
  });

  it('puts France in metropolitan France, not in the Atlantic', () => {
    const fra = centroids.get('FRA')!;
    expect(fra.lat).toBeGreaterThan(42);
    expect(fra.lat).toBeLessThan(51.5);
    expect(fra.lng).toBeGreaterThan(-5);
    expect(fra.lng).toBeLessThan(8.5);
  });
});
