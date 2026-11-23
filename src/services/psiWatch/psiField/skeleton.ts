/**
 * A field's persistence ridges and valleys on the sphere (decision D-PW, PW78), for the geoid's band in the ψ field.
 * The field is sampled on a Fibonacci sphere of 41,253 nodes, one per equatorial square degree, joined by their
 * Delaunay triangulation. Each maximum is paired with the saddle where its region merges into a higher one (union-find
 * down the sorted values); the pair's persistence is how far it stands above that saddle. From each saddle of a pair
 * over the floor, steepest ascent into its two highest separate lobes draws the ridge; valleys are the same of −Z.
 * Baked once (`scripts/psi/bake-psi-base.ts`), never run in the app.
 */
import Delaunator from 'delaunator';

export const MESH_NODES = 41253;
const DEG = 180 / Math.PI;

export interface SphereMesh {
  /** Each node as a unit vector, `[x, y, z]` per node. */
  units: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  /** Each node's neighbours, ascending. */
  neighbours: Int32Array[];
  /** The mean edge, degrees. */
  spacing: number;
  edges: number;
}

/**
 * Nodes on a Fibonacci sphere, and their Delaunay triangulation: projected stereographically from the last node, so
 * every triangle without it is the plane's Delaunay triangle, and its own neighbours are the plane's hull.
 */
export function fibonacciMesh(n = MESH_NODES): SphereMesh {
  const units = new Float64Array(n * 3);
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  const golden = Math.PI * (1 + Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - z * z);
    const th = golden * (i + 0.5);
    units[i * 3] = r * Math.cos(th);
    units[i * 3 + 1] = r * Math.sin(th);
    units[i * 3 + 2] = z;
    lat[i] = Math.asin(Math.max(-1, Math.min(1, z))) * DEG;
    lon[i] = Math.atan2(units[i * 3 + 1], units[i * 3]) * DEG;
  }
  // The frame turned so the last node stands at the south pole; projected from there, it alone goes to infinity.
  const pole = n - 1;
  const w = [-units[pole * 3], -units[pole * 3 + 1], -units[pole * 3 + 2]];
  const helper = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = cross(helper, w);
  normalise(u);
  const v = cross(w, u);
  const coords = new Float64Array((n - 1) * 2);
  for (let i = 0; i < n - 1; i++) {
    const p = [units[i * 3], units[i * 3 + 1], units[i * 3 + 2]];
    const zz = dot(p, w);
    coords[i * 2] = dot(p, u) / (1 + zz);
    coords[i * 2 + 1] = dot(p, v) / (1 + zz);
  }
  const d = new Delaunator(coords);
  const sets: Array<Set<number>> = Array.from({ length: n }, () => new Set<number>());
  const join = (a: number, b: number) => { sets[a].add(b); sets[b].add(a); };
  for (let t = 0; t < d.triangles.length; t += 3) {
    join(d.triangles[t], d.triangles[t + 1]);
    join(d.triangles[t + 1], d.triangles[t + 2]);
    join(d.triangles[t + 2], d.triangles[t]);
  }
  for (const h of d.hull) join(pole, h);
  const neighbours = sets.map((s) => Int32Array.from([...s].sort((a, b) => a - b)));
  let total = 0;
  let edges = 0;
  for (let a = 0; a < n; a++) {
    for (const b of neighbours[a]) {
      if (b <= a) continue;
      const c = units[a * 3] * units[b * 3] + units[a * 3 + 1] * units[b * 3 + 1] + units[a * 3 + 2] * units[b * 3 + 2];
      total += Math.acos(Math.max(-1, Math.min(1, c))) * DEG;
      edges++;
    }
  }
  return { units, lat, lon, neighbours, spacing: total / edges, edges };
}

/** Each maximum's persistence and the saddle where it merges; the highest maximum never merges (Infinity, −1). */
export function persistencePairs(Z: Float64Array, neighbours: Int32Array[]): Map<number, [number, number]> {
  const n = Z.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Z[b] - Z[a] || a - b);
  const parent = new Int32Array(n).fill(-1);
  const peak = new Int32Array(n);
  const find = (k: number): number => {
    while (parent[k] !== k) {
      parent[k] = parent[parent[k]];
      k = parent[k];
    }
    return k;
  };
  const out = new Map<number, [number, number]>();
  for (const k of order) {
    parent[k] = k;
    peak[k] = k;
    const roots = new Set<number>();
    for (const a of neighbours[k]) if (parent[a] >= 0) roots.add(find(a));
    if (!roots.size) continue;
    const sorted = [...roots].sort((a, b) => Z[peak[b]] - Z[peak[a]] || a - b);
    const keep = sorted[0];
    for (const r of sorted.slice(1)) {
      // The younger, lower peak dies here.
      out.set(peak[r], [Z[peak[r]] - Z[k], k]);
      parent[r] = keep;
    }
    parent[k] = keep;
  }
  out.set(peak[find(order[0])], [Infinity, -1]);
  return out;
}

/** Steepest ascent (sign 1) or descent (−1) from a node, until no neighbour is higher (lower). */
export function ascend(Z: Float64Array, neighbours: Int32Array[], start: number, sign = 1, steps = 4000): number[] {
  const path = [start];
  let k = start;
  for (let s = 0; s < steps; s++) {
    let best = -Infinity;
    let next = -1;
    for (const a of neighbours[k]) {
      const d = sign * (Z[a] - Z[k]);
      if (d > best) { best = d; next = a; }
    }
    if (best <= 0) break;
    k = next;
    path.push(k);
  }
  return path;
}

export interface SkeletonArc {
  persistence: number;
  /** From the saddle up (down) to the extremum, [lat, lon] to 0.01°. */
  points: Array<[number, number]>;
}

/**
 * The `top` most persistent pairs' arcs, two to a pair, most persistent first: ridges of Z (sign 1) or valleys (−1),
 * pairs at or under `floor` (the field's own noise) left out.
 */
export function skeleton(Z: Float64Array, mesh: SphereMesh, sign = 1, top = 30, floor = 0): SkeletonArc[] {
  const { units, lat, lon, neighbours, spacing } = mesh;
  const signed = sign === 1 ? Z : Z.map((v) => -v);
  const pairs = persistencePairs(signed, neighbours);
  const arcs: SkeletonArc[] = [];
  const round = (v: number) => Math.round(v * 100) / 100;
  const apart = (a: number, b: number) => {
    const c = units[a * 3] * units[b * 3] + units[a * 3 + 1] * units[b * 3 + 1] + units[a * 3 + 2] * units[b * 3 + 2];
    return Math.acos(Math.max(-1, Math.min(1, c))) * DEG;
  };
  for (const [, [persistence, saddle]] of pairs) {
    if (saddle < 0 || persistence <= floor) continue;
    // From the saddle, climb into its two highest separate lobes.
    const nb = [...neighbours[saddle]];
    const rise = nb.map((a) => sign * (Z[a] - Z[saddle]));
    const byRise = nb.map((_, j) => j).sort((a, b) => rise[b] - rise[a] || a - b);
    const branches: number[][] = [];
    for (const j of byRise) {
      if (rise[j] <= 0) break;
      const path = ascend(Z, neighbours, nb[j], sign);
      const end = path[path.length - 1];
      if (branches.every((q) => apart(end, q[q.length - 1]) > 2.5 * spacing)) branches.push(path);
      if (branches.length === 2) break;
    }
    for (const path of branches) {
      arcs.push({ persistence, points: [saddle, ...path].map((k) => [round(lat[k]), round(lon[k])]) });
    }
  }
  // A stable sort: a pair's two arcs stay together, in the order they were found.
  arcs.sort((a, b) => b.persistence - a.persistence);
  return arcs.slice(0, top * 2);
}

function cross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalise(a: number[]): void {
  const l = Math.hypot(a[0], a[1], a[2]);
  a[0] /= l; a[1] /= l; a[2] /= l;
}
