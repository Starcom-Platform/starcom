/**
 * A label grid traced into outlines that share every edge (decision D-ZR, ZR9): the cell edges between two labels are
 * walked into arcs from junction to junction, each arc simplified once, and every level's rings (Sectors, their Zones,
 * the container) are made of those same arcs, so neighbours meet vertex for vertex at every level.
 *
 * The tolerance is under half a cell, so two arcs a cell apart stay apart: no ring crosses another, or itself.
 * Rings are wound as RFC 7946 asks, outer rings counter-clockwise, and holes go in the outer ring that holds them.
 */
import { W, H, CELL } from './grid';

type LngLat = [number, number];
export type Geometry = { type: 'Polygon'; coordinates: LngLat[][] } | { type: 'MultiPolygon'; coordinates: LngLat[][][] };

/** Simplification: within this many degrees of the traced edge (under half a 0.1° cell, so no two arcs can cross). */
export const TOLERANCE = 0.04;
/**
 * Coarser simplification, about 8 km, so the whole set fits its size: lines inside Zones (ZR21), then every edge
 * (ZR24). Each arc so simplified is checked against every arc near it, and kept fine where it would cross one.
 */
export const COARSE_TOLERANCE = 0.08;
const VW = W + 1;
const lonOfVertex = (v: number) => -180 + (v % VW) * CELL;
const latOfVertex = (v: number) => 90 - Math.floor(v / VW) * CELL;
const round = (x: number) => Math.round(x * 1000) / 1000;
/** The map's corners, where the date line meets a pole: kept by every simplification, or an edge cuts across one. */
const isCorner = ([x, y]: LngLat) => Math.abs(x) === 180 && Math.abs(y) === 90;

export interface Arc { left: number; right: number; points: LngLat[]; from: number; to: number }

/**
 * The arcs between labels, each simplified once: to `toleranceOf(left, right)` degrees, where that is coarser than
 * TOLERANCE only if the arc then crosses no other. `label` is 0 outside what is traced.
 */
export function traceArcs(label: Int32Array, toleranceOf: (left: number, right: number) => number = () => TOLERANCE): { arcs: Arc[]; coarse: number; keptFine: number } {
  // Every cell edge between two labels, as (from vertex, to vertex, left, right): east along a row, south down a column.
  const from: number[] = []; const to: number[] = []; const left: number[] = []; const right: number[] = [];
  const at = new Map<number, number[]>();
  const add = (a: number, b: number, l: number, r: number) => {
    const e = from.length; from.push(a); to.push(b); left.push(l); right.push(r);
    for (const v of [a, b]) { const m = at.get(v); if (m) m.push(e); else at.set(v, [e]); }
  };
  const cell = (j: number, i: number) => (j < 0 || j >= H || i < 0 || i >= W ? 0 : label[j * W + i]);
  for (let j = 0; j <= H; j++) {
    for (let i = 0; i < W; i++) {
      // Between the cell above (north, on the left going east) and the cell below.
      const n = cell(j - 1, i); const s = cell(j, i);
      if (n !== s) add(j * VW + i, j * VW + i + 1, n, s);
    }
  }
  for (let j = 0; j < H; j++) {
    for (let i = 0; i <= W; i++) {
      // Between the cell west and the cell east (on the left going south).
      const w = cell(j, i - 1); const e = cell(j, i);
      if (w !== e) add(j * VW + i, (j + 1) * VW + i, e, w);
    }
  }
  const used = new Uint8Array(from.length);
  const junction = (v: number) => (at.get(v)?.length ?? 0) !== 2;
  const arcs: Arc[] = [];
  const raw: LngLat[][] = [];
  const walk = (start: number, e0: number) => {
    const verts = [start]; let v = start; let e = e0;
    // Which side is left, in the direction walked.
    const forward = from[e0] === start;
    const l = forward ? left[e0] : right[e0]; const r = forward ? right[e0] : left[e0];
    for (;;) {
      used[e] = 1;
      v = from[e] === v ? to[e] : from[e];
      verts.push(v);
      if (junction(v) || v === start) break;
      const next = at.get(v)!.find((x) => !used[x]);
      if (next === undefined) break;
      e = next;
    }
    const points = verts.map((x) => [lonOfVertex(x), latOfVertex(x)] as LngLat);
    raw.push(points);
    arcs.push({ left: l, right: r, from: start, to: v, points: simplifyPinned(points, Math.min(TOLERANCE, toleranceOf(l, r))) });
  };
  for (const [v, edges] of at) if (edges.length !== 2) for (const e of edges) if (!used[e]) walk(v, e);
  for (let e = 0; e < from.length; e++) if (!used[e]) walk(from[e], e);
  // Coarser where allowed, then fine again wherever the coarse line crosses another arc or itself.
  const wanted = arcs.map((a) => toleranceOf(a.left, a.right));
  const coarseIdx = arcs.map((_, k) => k).filter((k) => wanted[k] > TOLERANCE);
  for (const k of coarseIdx) arcs[k].points = simplifyPinned(raw[k], wanted[k]);
  let keptFine = 0;
  for (let round = 0; round < 3; round++) {
    const crossing = crossingArcs(arcs, coarseIdx.filter((k) => wanted[k] > TOLERANCE));
    if (!crossing.size) break;
    for (const k of crossing) { arcs[k].points = simplifyPinned(raw[k], TOLERANCE); wanted[k] = TOLERANCE; keptFine++; }
  }
  return { arcs, coarse: coarseIdx.length - keptFine, keptFine };
}

/** Which of the arcs `check` cross another arc, or themselves, anywhere but at a shared vertex. */
function crossingArcs(arcs: Arc[], check: number[]): Set<number> {
  const BIN = 0.5;
  const bins = new Map<string, Array<[number, number]>>();
  const key = (x: number, y: number) => `${Math.floor(x / BIN)},${Math.floor(y / BIN)}`;
  arcs.forEach((a, k) => {
    for (let s = 0; s + 1 < a.points.length; s++) {
      const [x1, y1] = a.points[s]; const [x2, y2] = a.points[s + 1];
      const seen = new Set<string>();
      for (let x = Math.floor(Math.min(x1, x2) / BIN); x <= Math.floor(Math.max(x1, x2) / BIN); x++) {
        for (let y = Math.floor(Math.min(y1, y2) / BIN); y <= Math.floor(Math.max(y1, y2) / BIN); y++) {
          const b = `${x},${y}`; if (seen.has(b)) continue; seen.add(b);
          const m = bins.get(b); if (m) m.push([k, s]); else bins.set(b, [[k, s]]);
        }
      }
    }
  });
  const out = new Set<number>();
  const same = (p: LngLat, q: LngLat) => p[0] === q[0] && p[1] === q[1];
  for (const k of check) {
    const a = arcs[k];
    for (let s = 0; s + 1 < a.points.length && !out.has(k); s++) {
      const p1 = a.points[s]; const p2 = a.points[s + 1];
      const near = new Set<string>();
      for (const [x, y] of [p1, p2]) near.add(key(x, y));
      for (const b of near) for (const [k2, s2] of bins.get(b) ?? []) {
        if (k2 === k && Math.abs(s2 - s) <= 1) continue;
        const q1 = arcs[k2].points[s2]; const q2 = arcs[k2].points[s2 + 1];
        if (same(p1, q1) || same(p1, q2) || same(p2, q1) || same(p2, q2)) continue;
        if (segmentsCross(p1, p2, q1, q2)) { out.add(k); out.add(k2); break; }
      }
    }
  }
  return out;
}

function segmentsCross(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  const o = (p: LngLat, q: LngLat, r: LngLat) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const o1 = o(a, b, c); const o2 = o(a, b, d); const o3 = o(c, d, a); const o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  // Touching or overlapping along a line counts too: two arcs must meet only at their shared vertices.
  const on = (p: LngLat, q: LngLat, r: LngLat) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  return (o1 === 0 && on(a, b, c)) || (o2 === 0 && on(a, b, d)) || (o3 === 0 && on(c, d, a)) || (o4 === 0 && on(c, d, b));
}

/** Douglas–Peucker that never drops one of the map's corners: the arc is simplified piece by piece between them. */
function simplifyPinned(points: LngLat[], tolerance: number): LngLat[] {
  const pins = points.flatMap((p, k) => (k > 0 && k < points.length - 1 && isCorner(p) ? [k] : []));
  if (!pins.length) return simplify(points, tolerance);
  const cuts = [0, ...pins, points.length - 1];
  return cuts.slice(1).flatMap((end, c) => {
    const piece = simplify(points.slice(cuts[c], end + 1), tolerance);
    return c === 0 ? piece : piece.slice(1);
  });
}

/** Douglas–Peucker, the ends kept; a closed arc is first split at its farthest point from its start. */
function simplify(points: LngLat[], tolerance: number = TOLERANCE): LngLat[] {
  if (points.length <= 2) return points;
  const closed = points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1];
  if (closed) {
    let far = 1; let best = -1;
    for (let k = 1; k < points.length - 1; k++) {
      const d = (points[k][0] - points[0][0]) ** 2 + (points[k][1] - points[0][1]) ** 2;
      if (d > best) { best = d; far = k; }
    }
    const a = simplify(points.slice(0, far + 1), tolerance); const b = simplify(points.slice(far), tolerance);
    const ring = [...a, ...b.slice(1)];
    // A ring needs three corners: a small island is kept finer rather than lost.
    if (ring.length >= 4) return ring;
    return tolerance > TOLERANCE ? simplify(points, TOLERANCE) : points;
  }
  const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [x1, y1] = points[a]; const [x2, y2] = points[b];
    const dx = x2 - x1; const dy = y2 - y1; const len = Math.hypot(dx, dy) || 1e-12;
    let far = -1; let best = tolerance;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs(dy * (points[k][0] - x1) - dx * (points[k][1] - y1)) / len;
      if (d > best) { best = d; far = k; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return points.filter((_, k) => keep[k]);
}

const signedArea = (ring: LngLat[]) => {
  let a = 0;
  for (let k = 0; k + 1 < ring.length; k++) a += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
  return a / 2;
};
function inside([x, y]: LngLat, ring: LngLat[]): boolean {
  let c = false;
  for (let k = 0, m = ring.length - 1; k < ring.length; m = k++) {
    const [x1, y1] = ring[k]; const [x2, y2] = ring[m];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c;
  }
  return c;
}

/**
 * Each region's outline, from the arcs: `regionOf` maps a label to its region at this level (0 for none), so arcs
 * inside one region drop out. Returns region → geometry.
 */
export function outlines(arcs: Arc[], regionOf: (label: number) => number): Map<number, Geometry> {
  // Each arc that parts two regions, once for each side, walked with that region on its left.
  const byRegion = new Map<number, Array<{ points: LngLat[]; from: number; to: number }>>();
  for (const a of arcs) {
    const l = regionOf(a.left); const r = regionOf(a.right);
    if (l === r) continue;
    if (l) { const m = byRegion.get(l) ?? []; m.push({ points: a.points, from: a.from, to: a.to }); byRegion.set(l, m); }
    if (r) { const m = byRegion.get(r) ?? []; m.push({ points: [...a.points].reverse(), from: a.to, to: a.from }); byRegion.set(r, m); }
  }
  const out = new Map<number, Geometry>();
  for (const [region, pieces] of byRegion) {
    const starting = new Map<number, number[]>();
    pieces.forEach((p, k) => { const m = starting.get(p.from); if (m) m.push(k); else starting.set(p.from, [k]); });
    const used = new Uint8Array(pieces.length);
    const rings: LngLat[][] = [];
    for (let k0 = 0; k0 < pieces.length; k0++) {
      if (used[k0]) continue;
      const ring: LngLat[] = [...pieces[k0].points]; used[k0] = 1;
      let k = k0;
      while (pieces[k].to !== pieces[k0].from) {
        const end = pieces[k].to;
        const choices = (starting.get(end) ?? []).filter((x) => !used[x]);
        if (!choices.length) throw new Error(`region ${region}: its outline breaks off at a vertex`);
        // Where the region pinches at a corner, keep to it: the sharpest turn to the left.
        const [px, py] = ring[ring.length - 2]; const [vx, vy] = ring[ring.length - 1];
        const din = [vx - px, vy - py];
        let next = choices[0]; let bestTurn = -Infinity;
        for (const x of choices) {
          const [qx, qy] = pieces[x].points[1];
          const dout = [qx - vx, qy - vy];
          const turn = Math.atan2(din[0] * dout[1] - din[1] * dout[0], din[0] * dout[0] + din[1] * dout[1]);
          if (turn > bestTurn) { bestTurn = turn; next = x; }
        }
        used[next] = 1; k = next;
        ring.push(...pieces[k].points.slice(1));
      }
      rings.push(ring.map(([x, y]) => [round(x), round(y)] as LngLat));
    }
    const outer = rings.filter((r) => signedArea(r) > 0); const holes = rings.filter((r) => signedArea(r) < 0);
    const polygons: LngLat[][][] = outer.map((r) => [r]);
    for (const h of holes) {
      const probe: LngLat = [(h[0][0] + h[1][0]) / 2, (h[0][1] + h[1][1]) / 2];
      const holder = polygons.filter((p) => inside(probe, p[0])).sort((a, b) => signedArea(a[0]) - signedArea(b[0]))[0];
      if (holder) holder.push(h);
    }
    out.set(region, polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons });
  }
  return out;
}
