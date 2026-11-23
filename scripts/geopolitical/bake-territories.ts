import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
  ensureDir,
  parseArgs,
  readJson,
  writeJson,
  type LOD
} from './shared';
import { normalizeOuterRingDetailed, validateRing, ringLongitudeSpan } from '../../src/geopolitical/geometry/polygonNormalize';
import { latLonToVector3 } from '../../src/geopolitical/utils/latLonToVector3';
import { projectToTangentPlane } from '../../src/geopolitical/geometry/projections/tangentPlane';
import { projectPolarLambert } from '../../src/geopolitical/geometry/projections/polarLambert';
import { constrainedDelaunayTriangulate, type Point2D } from '../../src/geopolitical/geometry/constrainedTriangulation';
import { subdivideToSphere, maxTriangleSag } from '../../src/geopolitical/geometry/sphereFitSubdivision';
import { BASE_MAP } from '../../src/components/Globe/globeAltitudes';

interface GeoJsonFeature {
  id?: string;
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown };
}

interface GeoJsonCollection {
  type: string;
  features: GeoJsonFeature[];
}

interface LODSummary {
  parts: number;
  vertices: number;
  triangles: number;
  chunkCount: number;
  failedParts: number;
  warnParts: number;
  bytes: {
    index: number;
    mesh: number;
    chunks: number;
  };
  sourceFeatures: number;
  sourceFile: string;
  outputFile: string;
  meshFile: string;
  chunksIndexFile: string;
}

type LngLat = [number, number];

interface BakedPart {
  id: string;
  countryCode: string;
  name: string;
  lod: LOD;
  ringCount: number;
  pointCount: number;
  vertexCount: number;
  triangleCount: number;
  indexFormat: 'uint16' | 'uint32';
  quantizationScale: number;
  positions: number[];
  positionsQuantized: number[];
  indices: number[];
  estimatedBytes: {
    positionsFloat32: number;
    positionsQuantizedInt16: number;
    indices: number;
  };
  qa: {
    maxEdgeToMedianEdgeRatio: number;
    minTriangleArea: number;
    droppedDegenerateFaces: number;
    droppedPathologicalFaces: number;
    // Whether this part was actually triangulated via constrained Delaunay
    // (either because pointCount >= 800, or because plain ear-clipping
    // produced pathological triangles and a Delaunay retry improved on it —
    // see bakePolygonPart). Downstream consumers (qa-territories.ts) that
    // need to know which ratio-threshold class applies should read this
    // directly rather than re-deriving it from pointCount alone, which
    // would miss the retry case and misjudge a genuinely-improved part as
    // failing the stricter normal-part threshold.
    usedLargePartTriangulation: boolean;
    status: 'pass' | 'warn' | 'fail';
    // Only set when status === 'fail'. Lets consumers (e.g. the runtime
    // integrity fallback in NationalTerritoriesService) react specifically to
    // triangulation-quality failures ('ratio') rather than any failure reason —
    // a part that only fails on minTriangleArea ('area') or has an empty index
    // buffer ('empty') isn't something re-triangulating at runtime can fix,
    // since the runtime path uses the identical algorithm on identical data.
    failureReason?: 'ratio' | 'area' | 'empty' | 'sag';
    // The deepest any triangle of the SHIPPED mesh sags below the sphere, after sphere
    // fitting, in scene units. maxEdgeToMedianEdgeRatio above describes the 2D
    // triangulation before fitting — its job is catching pathological triangulations —
    // while this describes what is actually drawn. At or past the fills' clearance the
    // part fails with reason 'sag'.
    maxSurfaceSag: number;
    // How many points sphere fitting added to follow the curve.
    sphereFitAddedVertices: number;
  };
}

interface LODChunk {
  id: string;
  partIds: string[];
  partCount: number;
  vertexCount: number;
  triangleCount: number;
}

interface BakeContract {
  manifestVersion: string;
  packageId: string;
  topologyGraphHash: string | null;
}

const POSITION_QUANTIZATION_SCALE = 256;

/** The sphere every baked vertex sits on: radius plus elevation, recorded in each header. */
const BAKE_RADIUS = 100;
const BAKE_ELEVATION = 0.5;
const BAKE_SURFACE_RADIUS = BAKE_RADIUS + BAKE_ELEVATION;

/**
 * How far above the globe the fills sit at runtime, in scene units: globeAltitudes'
 * BASE_MAP. A triangle whose flat interior sags this far passes under the planet's own
 * surface. (At runtime the group is scaled from 100.5 to 100.2, which shrinks a sag by
 * 0.3% — this bake-units figure is the conservative one.)
 */
const SURFACE_CLEARANCE_UNITS = Number(((BASE_MAP - 1) * BAKE_RADIUS).toFixed(6));

/**
 * The most any baked edge may sag below the sphere — a quarter of the clearance.
 *
 * Every triangle is flat and only its corners are on the sphere, so without this the
 * shipped LOD0 fills sagged up to 3.9 units and a tenth of their triangles more than
 * 0.19: under the globe. A quarter of the clearance keeps a whole triangle within
 * 4/3 of it (sphereFitSubdivision's stated bound), a third of the clearance. Measured
 * when chosen, on this dataset: 0.05 units costs LOD0 1.8x the vertices and LOD2
 * 1.2x; 0.02 would triple LOD0 for margin depth testing does not need.
 */
const SPHERE_FIT_TOLERANCE_UNITS = SURFACE_CLEARANCE_UNITS / 4;
const CHUNK_TRIANGLE_BUDGET = 1800;
// See the matching constant/comment in
// src/geopolitical/geometry/pipeline/stages/projectionStage.ts — projectToTangentPlane
// is a naive orthographic projection, only safe well under a hemisphere from its
// center. Wide-span rings (e.g. Russia's ~153°-wide mainland part, avgLat 59.5 —
// previously routed to tangent because avgLat<=60) must go through the Lambert
// azimuthal projection instead, which stays well-behaved up to the antipode. Using
// the same span-based criterion (not latitude) as the runtime pipeline keeps both
// triangulation paths in agreement instead of drifting independently.
const WIDE_SPAN_LAMBERT_THRESHOLD_DEG = 90;

function quantizePosition(value: number, scale: number): number {
  const quantized = Math.round(value * scale);
  if (quantized > 32767) return 32767;
  if (quantized < -32768) return -32768;
  return quantized;
}

function isClosedRing(ring: LngLat[]): boolean {
  if (ring.length < 2) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function openRing(ring: LngLat[]): LngLat[] {
  if (!isClosedRing(ring)) return ring.slice();
  return ring.slice(0, ring.length - 1);
}

function unwrapRing(ring: LngLat[]): LngLat[] {
  if (!ring.length) return [];
  const result: LngLat[] = [];
  let prevLng = ring[0][0];
  let offset = 0;
  result.push([prevLng, ring[0][1]]);
  for (let i = 1; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    const delta = lng - prevLng;
    if (delta > 180) offset -= 360;
    else if (delta < -180) offset += 360;
    result.push([lng + offset, lat]);
    prevLng = lng;
  }
  return result;
}

function sanitizeRing(ring: LngLat[]): LngLat[] {
  if (ring.length < 3) return [];
  const validated = validateRing(ring).ring;
  const open = openRing(validated);
  if (open.length < 3) return [];
  return unwrapRing(open);
}

function ringCentroid(ring: LngLat[]): LngLat {
  let lng = 0;
  let lat = 0;
  for (let i = 0; i < ring.length; i++) {
    lng += ring[i][0];
    lat += ring[i][1];
  }
  return [lng / ring.length, lat / ring.length];
}

function ringBounds(ring: LngLat[]): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, maxLng, minLat, maxLat };
}

function pointInRing(x: number, y: number, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function alignRingDomainToCenter(ring: LngLat[], centerLng: number): LngLat[] {
  return ring.map(([lng, lat]) => {
    const candidates = [lng - 360, lng, lng + 360];
    let best = candidates[0];
    let bestDist = Math.abs(candidates[0] - centerLng);
    for (let i = 1; i < candidates.length; i++) {
      const dist = Math.abs(candidates[i] - centerLng);
      if (dist < bestDist) {
        best = candidates[i];
        bestDist = dist;
      }
    }
    return [best, lat];
  });
}

function assignHolesToParts(outerParts: LngLat[][], holes: LngLat[][]): LngLat[][][] {
  const perPart: LngLat[][][] = outerParts.map(() => []);
  if (!holes.length || outerParts.length === 1) {
    if (outerParts.length === 1) perPart[0] = holes;
    return perPart;
  }

  const partData = outerParts.map((part) => {
    const bounds = ringBounds(part);
    const center = (bounds.minLng + bounds.maxLng) / 2;
    return { part, bounds, center };
  });

  for (let h = 0; h < holes.length; h++) {
    const hole = holes[h];
    if (hole.length < 3) continue;
    const [holeLng, holeLat] = ringCentroid(hole);

    let bestPart = -1;
    let bestScore = -Infinity;

    for (let p = 0; p < partData.length; p++) {
      const part = partData[p];
      const alignedLng = alignRingDomainToCenter([[holeLng, holeLat]], part.center)[0][0];
      const inBounds = alignedLng >= part.bounds.minLng - 1
        && alignedLng <= part.bounds.maxLng + 1
        && holeLat >= part.bounds.minLat - 1
        && holeLat <= part.bounds.maxLat + 1;
      if (!inBounds) continue;

      const contains = pointInRing(alignedLng, holeLat, part.part);
      const centerDelta = Math.abs(alignedLng - part.center);
      const score = (contains ? 1000 : 0) - centerDelta;
      if (score > bestScore) {
        bestScore = score;
        bestPart = p;
      }
    }

    if (bestPart >= 0) {
      const alignedHole = alignRingDomainToCenter(hole, partData[bestPart].center);
      perPart[bestPart].push(alignedHole);
    }
  }

  return perPart;
}

function isDegenerateFace(tri: number[], vertices: THREE.Vector2[], epsilon = 1e-12): boolean {
  const a = vertices[tri[0]];
  const b = vertices[tri[1]];
  const c = vertices[tri[2]];
  if (!a || !b || !c) return true;
  const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  return area2 < epsilon;
}

function computeEdgeStats(faces: number[][], vertices: THREE.Vector2[]): { median: number; max: number } {
  const lengths: number[] = [];
  for (let i = 0; i < faces.length; i++) {
    const tri = faces[i];
    const a = vertices[tri[0]];
    const b = vertices[tri[1]];
    const c = vertices[tri[2]];
    if (!a || !b || !c) continue;
    lengths.push(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
  }
  if (!lengths.length) return { median: 1, max: 1 };
  lengths.sort((x, y) => x - y);
  const median = lengths[Math.floor(lengths.length / 2)] || 1;
  const max = lengths[lengths.length - 1] || median;
  return { median, max };
}

function triangleArea3D(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  const ab = b.clone().sub(a);
  const ac = c.clone().sub(a);
  return ab.cross(ac).length() * 0.5;
}

// Constrained Delaunay (via Constrainautor) can throw for genuinely degenerate
// or self-intersecting input — e.g. "Edge intersects already constrained edge",
// "Constraining edge exited the hull" — which real-world coastline/hole data
// can trigger (near-duplicate points, a hole touching the outer boundary,
// simplification artifacts). Ear-clipping has no such failure mode, so it's
// the fallback: one malformed "large complex part" shouldn't abort the whole
// bake.
function triangulateLargeComplexPart(id: string, outer2D: THREE.Vector2[], hole2D: THREE.Vector2[][]): number[][] {
  try {
    return constrainedDelaunayTriangulate(
      outer2D.map((v): Point2D => [v.x, v.y]),
      hole2D.map((ring) => ring.map((v): Point2D => [v.x, v.y]))
    );
  } catch (err) {
    console.warn(`[bake-territories] constrained Delaunay triangulation failed for part ${id}, falling back to ear-clipping:`, (err as Error).message);
    return THREE.ShapeUtils.triangulateShape(outer2D, hole2D);
  }
}

function bakePolygonPart(
  id: string,
  countryCode: string,
  name: string,
  lod: LOD,
  outer: LngLat[],
  holes: LngLat[][],
  ringCount: number,
  pointCount: number
): BakedPart {
  const allPoints: Array<{ lon: number; lat: number }> = [];
  outer.forEach(([lng, lat]) => allPoints.push({ lon: lng, lat }));
  const holeStarts: number[] = [];
  holes.forEach((ring) => {
    holeStarts.push(allPoints.length);
    ring.forEach(([lng, lat]) => allPoints.push({ lon: lng, lat }));
  });

  const avgLat = outer.reduce((sum, p) => sum + p[1], 0) / outer.length;
  const span = ringLongitudeSpan(outer);
  const projection = (Math.abs(avgLat) > 60 || span > WIDE_SPAN_LAMBERT_THRESHOLD_DEG)
    ? projectPolarLambert(allPoints)
    : projectToTangentPlane(allPoints);

  const outer2D = outer.map((_, index) => {
    const p = projection.points2D[index];
    return new THREE.Vector2(p.x, p.y);
  });
  const hole2D = holes.map((ring, holeIndex) => {
    const start = holeStarts[holeIndex];
    return ring.map((_, ringIndex) => {
      const p = projection.points2D[start + ringIndex];
      return new THREE.Vector2(p.x, p.y);
    });
  });
  const all2DVertices: THREE.Vector2[] = [...outer2D, ...hole2D.flat()];

  const isLargeComplexPart = pointCount >= 800;
  // Ear-clipping (THREE.ShapeUtils.triangulateShape / bundled Earcut) guarantees a
  // valid triangulation of any simple polygon, but no quality guarantee — for an
  // exceptionally large, irregular ring it can choose an "ear" that bridges two
  // distant, sparsely-connected parts of the shape with one very long, thin
  // triangle (confirmed: this is exactly what was happening to Russia's mainland
  // part). Constrained Delaunay triangulation avoids that failure mode by
  // construction (it maximizes the minimum angle across all triangles), so it's
  // used here for the same "large complex part" bucket that used to need the
  // pathological-face-dropping workaround below. Verified against Russia's real
  // ring: max-edge/median-edge ratio dropped from ~76 (ear-clipping) to ~34
  // (constrained Delaunay) — the remaining ratio reflects real point-density
  // variation along the coastline, not a triangulation defect.
  let faces = isLargeComplexPart
    ? triangulateLargeComplexPart(id, outer2D, hole2D)
    : THREE.ShapeUtils.triangulateShape(outer2D, hole2D);
  let nonDegenerate = faces.filter((tri) => !isDegenerateFace(tri, all2DVertices));
  let droppedDegenerateFaces = faces.length - nonDegenerate.length;

  let preFilterEdgeStats = computeEdgeStats(nonDegenerate, all2DVertices);
  let maxAllowedEdge = preFilterEdgeStats.median * 16;
  let pathologicalCandidates = nonDegenerate.filter((tri) => {
    const a = all2DVertices[tri[0]];
    const b = all2DVertices[tri[1]];
    const c = all2DVertices[tri[2]];
    const maxEdge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
    return maxEdge > maxAllowedEdge;
  });

  // The 800-point "large complex part" cutoff was chosen for one known
  // outlier (Russia) and never validated against the rest of the dataset —
  // plenty of large, complex countries under that cutoff (confirmed via
  // existing QA history: e.g. Chile) hit the exact same ear-clipping
  // failure mode (a long "bridge" triangle spanning two sparse regions of
  // an irregular ring) without ever getting the fix. Rather than guess a
  // new cutoff, retry pathological parts with the same already-proven
  // constrained Delaunay triangulation used for large parts above,
  // regardless of point count, and keep the retry's result only if it's
  // actually better.
  let usedDelaunayRetry = false;
  if (!isLargeComplexPart && pathologicalCandidates.length > 0) {
    const retryFaces = triangulateLargeComplexPart(id, outer2D, hole2D);
    const retryNonDegenerate = retryFaces.filter((tri) => !isDegenerateFace(tri, all2DVertices));
    const retryEdgeStats = computeEdgeStats(retryNonDegenerate, all2DVertices);
    const retryMaxAllowedEdge = retryEdgeStats.median * 16;
    const retryPathological = retryNonDegenerate.filter((tri) => {
      const a = all2DVertices[tri[0]];
      const b = all2DVertices[tri[1]];
      const c = all2DVertices[tri[2]];
      const maxEdge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
      return maxEdge > retryMaxAllowedEdge;
    });
    if (retryPathological.length < pathologicalCandidates.length) {
      faces = retryFaces;
      nonDegenerate = retryNonDegenerate;
      droppedDegenerateFaces = retryFaces.length - retryNonDegenerate.length;
      preFilterEdgeStats = retryEdgeStats;
      maxAllowedEdge = retryMaxAllowedEdge;
      pathologicalCandidates = retryPathological;
      usedDelaunayRetry = true;
    }
  }

  // For very large contiguous parts (including any part that just retried
  // into Delaunay above), dropping long-edge triangles can carve visible
  // interior voids. Keep those triangles for visual continuity and rely on
  // QA ratio thresholds tuned for large parts. Dropping-without-repair is
  // now true defense-in-depth: only reachable when even a Delaunay retry
  // didn't fully resolve the pathological triangles (or wasn't attempted
  // because there were none to begin with).
  const shouldDropPathologicalFaces = !isLargeComplexPart && !usedDelaunayRetry;
  const filteredFaces = shouldDropPathologicalFaces
    ? nonDegenerate.filter((tri) => {
        const a = all2DVertices[tri[0]];
        const b = all2DVertices[tri[1]];
        const c = all2DVertices[tri[2]];
        const maxEdge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
        return maxEdge <= maxAllowedEdge;
      })
    : nonDegenerate;
  const droppedPathologicalFaces = shouldDropPathologicalFaces
    ? pathologicalCandidates.length
    : 0;
  const finalEdgeStats = computeEdgeStats(filteredFaces, all2DVertices);

  const ringVertices: LngLat[] = [...outer, ...holes.flat()];
  const ringPositions: number[] = [];
  for (let i = 0; i < ringVertices.length; i++) {
    const [lng, lat] = ringVertices[i];
    const vec = latLonToVector3(lat, lng, { radius: BAKE_RADIUS, elevation: BAKE_ELEVATION, invertX: false });
    ringPositions.push(vec.x, vec.y, -vec.z);
  }

  const ringIndices: number[] = [];
  for (let i = 0; i < filteredFaces.length; i++) {
    ringIndices.push(filteredFaces[i][0], filteredFaces[i][1], filteredFaces[i][2]);
  }

  /*
   * Fit the flat triangulation onto the sphere before anything is rounded or measured,
   * so the QA figures below describe the mesh that ships. See SPHERE_FIT_TOLERANCE_UNITS.
   */
  const fitted = subdivideToSphere(ringPositions, ringIndices, BAKE_SURFACE_RADIUS, SPHERE_FIT_TOLERANCE_UNITS);
  const positions = fitted.positions.map((v) => Number(v.toFixed(6)));
  const indices = fitted.indices;
  const positionsQuantized = positions.map((v) => quantizePosition(v, POSITION_QUANTIZATION_SCALE));
  const vertexCount = positions.length / 3;
  const maxSurfaceSag = maxTriangleSag(positions, indices, BAKE_SURFACE_RADIUS);

  let minTriangleArea = Number.POSITIVE_INFINITY;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;
    a.set(positions[i0], positions[i0 + 1], positions[i0 + 2]);
    b.set(positions[i1], positions[i1 + 1], positions[i1 + 2]);
    c.set(positions[i2], positions[i2 + 1], positions[i2 + 2]);
    minTriangleArea = Math.min(minTriangleArea, triangleArea3D(a, b, c));
  }
  if (!Number.isFinite(minTriangleArea)) minTriangleArea = 0;

  const ratio = finalEdgeStats.max / (finalEdgeStats.median || 1);
  // The fail threshold for "large complex parts" was 80 — chosen without reference
  // to what large-part ratios actually look like in practice. As of this dataset
  // there is exactly one part in that >=800-point bucket at any LOD (RUS:1-0,
  // Russia's mainland), and its ratio (~76 at LOD2) is 4-6x every other country's
  // worst normal-part ratio (~12-17) — a genuine outlier, not ordinary coastline
  // complexity, that the old threshold let through as merely 'warn'. 40 leaves
  // real headroom above the normal-part range while still catching this case.
  // Whichever triangulation strategy was actually used determines which
  // threshold class applies — a part that retried into Delaunay above
  // should be judged by the same thresholds as the isLargeComplexPart
  // bucket it borrowed the strategy from, not the plain-ear-clipping
  // thresholds it would otherwise fall under by point count alone.
  const usedLargePartTriangulation = isLargeComplexPart || usedDelaunayRetry;
  const failRatioThreshold = usedLargePartTriangulation ? 40 : 20;
  const warnRatioThreshold = usedLargePartTriangulation ? 20 : 12;
  let status: 'pass' | 'warn' | 'fail' = 'pass';
  let failureReason: 'ratio' | 'area' | 'empty' | 'sag' | undefined;
  if (indices.length === 0) { status = 'fail'; failureReason = 'empty'; }
  else if (ratio > failRatioThreshold) { status = 'fail'; failureReason = 'ratio'; }
  else if (minTriangleArea < 1e-7) { status = 'fail'; failureReason = 'area'; }
  // A part that still passes under the globe after fitting would bring the black
  // patches back the moment the fills are depth tested; it does not ship as a pass.
  else if (maxSurfaceSag >= SURFACE_CLEARANCE_UNITS) { status = 'fail'; failureReason = 'sag'; }
  else if (ratio > warnRatioThreshold || minTriangleArea < 1e-6 || droppedPathologicalFaces > 0) status = 'warn';

  return {
    id,
    countryCode,
    name,
    lod,
    ringCount,
    pointCount,
    vertexCount,
    triangleCount: indices.length / 3,
    indexFormat: vertexCount <= 65535 ? 'uint16' : 'uint32',
    quantizationScale: POSITION_QUANTIZATION_SCALE,
    positions,
    positionsQuantized,
    indices,
    estimatedBytes: {
      positionsFloat32: positions.length * 4,
      positionsQuantizedInt16: positionsQuantized.length * 2,
      indices: indices.length * (vertexCount <= 65535 ? 2 : 4)
    },
    qa: {
      maxEdgeToMedianEdgeRatio: Number(ratio.toFixed(4)),
      minTriangleArea: Number(minTriangleArea.toFixed(8)),
      droppedDegenerateFaces,
      droppedPathologicalFaces,
      usedLargePartTriangulation,
      maxSurfaceSag: Number(maxSurfaceSag.toFixed(6)),
      sphereFitAddedVertices: fitted.addedVertices,
      status,
      ...(failureReason ? { failureReason } : {})
    }
  };
}

function buildChunks(parts: BakedPart[]): LODChunk[] {
  const chunks: LODChunk[] = [];
  let currentParts: BakedPart[] = [];
  let currentTriangles = 0;
  let currentVertices = 0;

  const flush = () => {
    if (!currentParts.length) return;
    chunks.push({
      id: `chunk-${String(chunks.length).padStart(3, '0')}`,
      partIds: currentParts.map((part) => part.id),
      partCount: currentParts.length,
      vertexCount: currentVertices,
      triangleCount: currentTriangles
    });
    currentParts = [];
    currentTriangles = 0;
    currentVertices = 0;
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const exceedsBudget = currentTriangles > 0 && (currentTriangles + part.triangleCount > CHUNK_TRIANGLE_BUDGET);
    if (exceedsBudget) flush();
    currentParts.push(part);
    currentTriangles += part.triangleCount;
    currentVertices += part.vertexCount;
  }
  flush();

  return chunks;
}

function bakeFeatureParts(feature: GeoJsonFeature, lod: LOD): BakedPart[] {
  const geometry = feature.geometry;
  const baseId = String(feature.id ?? feature.properties?.ADM0_A3 ?? 'UNKNOWN');
  const countryCode = String(feature.properties?.ADM0_A3 ?? baseId.split(':')[0]);
  const name = String(feature.properties?.NAME ?? feature.properties?.ADMIN ?? baseId);
  if (!geometry || !geometry.type || !geometry.coordinates) return [];

  const polygons: number[][][][] = geometry.type === 'Polygon'
    ? [geometry.coordinates as number[][][]]
    : geometry.type === 'MultiPolygon'
      ? (geometry.coordinates as number[][][][])
      : [];

  const baked: BakedPart[] = [];

  for (let polyIndex = 0; polyIndex < polygons.length; polyIndex++) {
    const polygon = polygons[polyIndex];
    const outerRaw = (polygon[0] || []).map(([lng, lat]) => [lng, lat] as LngLat);
    const holesRaw = polygon.slice(1).map((ring) => ring.map(([lng, lat]) => [lng, lat] as LngLat));
    if (outerRaw.length < 3) continue;

    const normalized = normalizeOuterRingDetailed(outerRaw);
    const outerParts = normalized.parts
      .map((ring) => sanitizeRing(ring as LngLat[]))
      .filter((ring) => ring.length >= 3);

    const holesSanitized = holesRaw
      .map((ring) => sanitizeRing(ring))
      .filter((ring) => ring.length >= 3);

    if (!outerParts.length) continue;
    const holesPerPart = assignHolesToParts(outerParts, holesSanitized);

    for (let partIndex = 0; partIndex < outerParts.length; partIndex++) {
      const outer = outerParts[partIndex];
      const holes = holesPerPart[partIndex] || [];
      const id = geometry.type === 'Polygon' && outerParts.length === 1
        ? baseId
        : `${baseId}:${polyIndex}-${partIndex}`;
      const ringCount = 1 + holes.length;
      const pointCount = outer.length + holes.reduce((sum, ring) => sum + ring.length, 0);
      baked.push(bakePolygonPart(id, countryCode, name, lod, outer, holes, ringCount, pointCount));
    }
  }

  return baked;
}

function flattenFeatureParts(feature: GeoJsonFeature): Array<{ id: string; name: string; ringCount: number; pointCount: number }> {
  const geometry = feature.geometry;
  const baseId = String(feature.id ?? feature.properties?.ADM0_A3 ?? 'UNKNOWN');
  const name = String(feature.properties?.NAME ?? feature.properties?.ADMIN ?? baseId);

  if (!geometry || !geometry.type || !geometry.coordinates) return [];

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as number[][][];
    return [{
      id: baseId,
      name,
      ringCount: rings.length,
      pointCount: rings.reduce((sum, ring) => sum + ring.length, 0)
    }];
  }

  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as number[][][][];
    return polys.map((poly, index) => ({
      id: `${baseId}:${index}`,
      name,
      ringCount: poly.length,
      pointCount: poly.reduce((sum, ring) => sum + ring.length, 0)
    }));
  }

  return [];
}

function bakeLod(lod: LOD, sourceDir: string, generatedDir: string, contract: BakeContract): LODSummary {
  const sourceFile = path.join(sourceDir, `world-territories-lod${lod}.geojson`);
  const outputDir = path.join(generatedDir, `lod${lod}`);
  const outputFile = path.join(outputDir, 'parts-index.json');
  const meshFile = path.join(outputDir, 'parts-mesh.json');
  const chunksIndexFile = path.join(outputDir, 'chunks-index.json');
  const chunksDir = path.join(outputDir, 'chunks');

  const geo = readJson<GeoJsonCollection>(sourceFile);
  const parts = geo.features.flatMap((feature) => bakeFeatureParts(feature, lod));
  const chunks = buildChunks(parts);

  ensureDir(outputDir);
  ensureDir(chunksDir);
  writeJson(meshFile, {
    lod,
    generatedAt: new Date().toISOString(),
    contract,
    sourceFile,
    projectionDomain: 'lonlat-unwrapped-per-part',
    triangulation: 'three-shapeutils-with-pathological-filter+sphere-fit',
    sphereFitToleranceUnits: SPHERE_FIT_TOLERANCE_UNITS,
    radius: BAKE_RADIUS,
    elevation: BAKE_ELEVATION,
    parts
  });

  writeJson(outputFile, {
    lod,
    generatedAt: new Date().toISOString(),
    contract,
    sourceFile,
    projectionDomain: 'lonlat-unwrapped-per-part',
    triangulation: 'three-shapeutils-with-pathological-filter+sphere-fit',
    sphereFitToleranceUnits: SPHERE_FIT_TOLERANCE_UNITS,
    parts: parts.map((part) => ({
      id: part.id,
      countryCode: part.countryCode,
      name: part.name,
      ringCount: part.ringCount,
      pointCount: part.pointCount,
      vertexCount: part.vertexCount,
      triangleCount: part.triangleCount,
      indexFormat: part.indexFormat,
      quantizationScale: part.quantizationScale,
      estimatedBytes: part.estimatedBytes,
      qa: part.qa
    }))
  });

  let chunkBytes = 0;
  writeJson(chunksIndexFile, {
    lod,
    generatedAt: new Date().toISOString(),
    contract,
    chunkTriangleBudget: CHUNK_TRIANGLE_BUDGET,
    chunks
  });
  chunkBytes += fs.statSync(chunksIndexFile).size;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkParts = parts.filter((part) => chunk.partIds.includes(part.id));
    const chunkFile = path.join(chunksDir, `${chunk.id}.json`);
    writeJson(chunkFile, {
      lod,
      contract,
      chunk,
      parts: chunkParts
    });
    chunkBytes += fs.statSync(chunkFile).size;
  }

  const vertices = parts.reduce((sum, part) => sum + part.vertexCount, 0);
  const triangles = parts.reduce((sum, part) => sum + part.triangleCount, 0);
  const failedParts = parts.filter((part) => part.qa.status === 'fail').length;
  const warnParts = parts.filter((part) => part.qa.status === 'warn').length;
  const indexBytes = fs.statSync(outputFile).size;
  const meshBytes = fs.statSync(meshFile).size;

  return {
    parts: parts.length,
    vertices,
    triangles,
    chunkCount: chunks.length,
    failedParts,
    warnParts,
    bytes: {
      index: indexBytes,
      mesh: meshBytes,
      chunks: chunkBytes
    },
    sourceFeatures: geo.features.length,
    sourceFile,
    outputFile,
    meshFile,
    chunksIndexFile
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const summaries: Record<string, LODSummary> = {};
  const generatedAt = new Date().toISOString();
  const packageId = `territories-bake-${generatedAt}`;
  const sourceValidationPath = path.join(args.generatedDir, 'source-validation.json');
  const topologyReportPath = path.join(args.generatedDir, 'topology', 'territories-topology-report.json');

  const sourceValidation = (() => {
    try {
      return readJson<Record<string, unknown>>(sourceValidationPath);
    } catch {
      return null;
    }
  })();

  const topologyReport = (() => {
    try {
      return readJson<Record<string, unknown>>(topologyReportPath);
    } catch {
      return null;
    }
  })();

  const contract: BakeContract = {
    manifestVersion: 'territories-bake-v1',
    packageId,
    topologyGraphHash: (topologyReport?.topologyGraphHash as string | undefined) ?? null
  };

  for (const lod of args.lods) {
    summaries[String(lod)] = bakeLod(lod, args.sourceDir, args.generatedDir, contract);
  }

  const failedParts = Object.values(summaries).reduce((sum, lod) => sum + lod.failedParts, 0);
  const warnParts = Object.values(summaries).reduce((sum, lod) => sum + lod.warnParts, 0);

  writeJson(path.join(args.generatedDir, 'manifest.json'), {
    version: 'territories-bake-v1',
    generatedAt,
    packageId,
    source: {
      dataset: 'world-territories-lod*.geojson',
      sourceDir: args.sourceDir,
      validationReport: sourceValidationPath,
      provider: sourceValidation?.provider ?? 'unknown',
      status: sourceValidation?.status ?? 'unknown'
    },
    topology: topologyReport
      ? {
          report: topologyReportPath,
          topologyGraphHash: topologyReport.topologyGraphHash ?? null,
          quantizationScale: topologyReport.quantizationScale ?? null
        }
      : null,
    lods: summaries,
    qaSummary: {
      status: failedParts > 0 ? 'fail' : warnParts > 0 ? 'warn' : 'pass',
      failedParts,
      warnParts
    }
  });

  console.log(`[geo:bake] Generated baked geometry artifacts in ${args.generatedDir}`);
}

main();
