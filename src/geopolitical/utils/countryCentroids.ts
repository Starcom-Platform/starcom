// countryCentroids.ts — derives a representative lat/lng per country from
// already-loaded baked territory geometry, rather than storing centroids in
// the bake pipeline. No lat/lng field exists on any baked part today
// (checked parts-index.json), and adding one would mean extending
// bake-territories.ts, a rebake, and a republish just for this — computing it
// client-side from data already in memory avoids all of that and needs no
// pipeline changes.
//
// Area-weighted, not a plain vertex average: each triangle's flat 3D area (same
// ab.cross(ac).length()*0.5 technique already used in bake-territories.ts's
// triangleArea3D) is its weight in its part's centroid, re-normalized onto the
// unit sphere before converting back to lat/lng. Which part, and what happens
// when a centroid falls outside its own land, is computeCountryCentroids' rule.
import * as THREE from 'three';
import { vector3ToLatLon } from './vector3ToLatLon';

export interface CountryCentroid {
  lat: number;
  lng: number;
}

export interface CentroidSourcePart {
  countryCode?: string;
  positions: number[];
  indices: number[];
}

function triangleAreaAndCentroid(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): { area: number; centroid: THREE.Vector3 } {
  const ab = b.clone().sub(a);
  const ac = c.clone().sub(a);
  const area = ab.cross(ac).length() * 0.5;
  const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
  return { area, centroid };
}

function computePartAreaWeightedCentroid(part: CentroidSourcePart): { centroid: THREE.Vector3; area: number } | null {
  const { positions, indices } = part;
  if (positions.length < 9 || indices.length < 3) return null;
  const v = (i: number) => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);

  let totalArea = 0;
  const weighted = new THREE.Vector3();
  for (let t = 0; t < indices.length; t += 3) {
    const a = v(indices[t]);
    const b = v(indices[t + 1]);
    const c = v(indices[t + 2]);
    const { area, centroid } = triangleAreaAndCentroid(a, b, c);
    if (!(area > 0) || !Number.isFinite(area)) continue; // skip degenerate/zero-area triangles
    weighted.addScaledVector(centroid, area);
    totalArea += area;
  }
  if (!(totalArea > 0)) return null;
  return { centroid: weighted.multiplyScalar(1 / totalArea), area: totalArea };
}

/**
 * `direction` if the part covers it; otherwise the direction of the centre of the
 * part's triangle nearest it — inside the part by construction. Unit vectors.
 */
function pointOnPart(part: CentroidSourcePart, direction: THREE.Vector3): THREE.Vector3 | null {
  const { positions, indices } = part;
  const ray = new THREE.Ray(new THREE.Vector3(), direction);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let nearest: THREE.Vector3 | null = null;
  let nearestDistSq = Infinity;
  for (let t = 0; t < indices.length; t += 3) {
    a.fromArray(positions, indices[t] * 3);
    b.fromArray(positions, indices[t + 1] * 3);
    c.fromArray(positions, indices[t + 2] * 3);
    if (ray.intersectTriangle(a, b, c, false, hit)) return direction;
    if (!(triangleAreaAndCentroid(a, b, c).area > 0)) continue;
    const centre = a.clone().add(b).add(c).normalize();
    const distSq = centre.distanceToSquared(direction);
    if (distSq < nearestDistSq) {
      nearestDistSq = distSq;
      nearest = centre;
    }
  }
  return nearest;
}

/**
 * One point per country, on that country's own land:
 *
 *   1. from its LARGEST part — the mainland — not an average across all its parts.
 *      An average of disjoint parts can land in none of them: measured on the shipped
 *      mesh, France's fell in the sea off Galicia (pulled ~800 km by French Guiana),
 *      Malaysia's in the South China Sea between its halves, and Japan's, Indonesia's,
 *      the Philippines', Norway's and Fiji's offshore.
 *   2. the part's area-weighted centroid — unless the part's shape puts that outside
 *      it (Croatia's C put its point in Bosnia; Vietnam's S, in Laos), in which case
 *      the nearest point that is inside it.
 *
 * Five features place marks here (Diplomacy, Conflict, Resource Zones, Cyber Threats,
 * the header's country search), so a point off its country misplaces all of them.
 * Parts with no countryCode, degenerate geometry (no triangles, zero total area), or
 * an unresolvable centroid are silently skipped — missing a centroid for one country
 * doesn't invalidate the rest.
 */
export function computeCountryCentroids(parts: CentroidSourcePart[]): Map<string, CountryCentroid> {
  const largest = new Map<string, { part: CentroidSourcePart; centroid: THREE.Vector3; area: number }>();

  for (const part of parts) {
    const code = part.countryCode;
    if (!code) continue;
    const result = computePartAreaWeightedCentroid(part);
    if (!result) continue;
    const current = largest.get(code);
    if (!current || result.area > current.area) largest.set(code, { part, ...result });
  }

  const centroids = new Map<string, CountryCentroid>();
  largest.forEach(({ part, centroid }, code) => {
    const centre = centroid.clone().normalize();
    if (!Number.isFinite(centre.x) || centre.lengthSq() === 0) return;
    const direction = pointOnPart(part, centre);
    if (!direction) return;
    // flipZ:true recovers the original (lat,lon): baked positions are built
    // via latLonToVector3(lat, lon, {invertX:false}) and then z is negated
    // when written into the position buffer (see geometryFactory.ts's
    // writeVertex / NationalTerritoriesService's buildTerritoriesFromBaked) —
    // the same round-trip convention already used for ray-sphere hit points
    // in useNationalTerritories3D.ts's border-hover picking.
    const { lat, lon } = vector3ToLatLon(direction, { flipZ: true });
    centroids.set(code, { lat, lng: lon });
  });

  return centroids;
}
