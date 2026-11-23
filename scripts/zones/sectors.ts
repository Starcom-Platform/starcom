/**
 * A Terra's Sectors on the 0.1° grid (decision D-ZR, ZR7): layered, each 50,000 to 500,000 km².
 *
 * 1. Drainage divides, from ETOPO 2022's relief: a flood from every outlet to the sea and every inland low, nearest
 *    first by height, each cell joining the low it is reached from; then the smallest basins merged over their lowest
 *    saddle until each is at least MIN_BASIN_KM2. Every edge left runs along a ridge or a saddle: a divide.
 * 2. Those basins cut by the Terra's Zones and its plates. Water within COAST_CELLS of the Zone's land goes with the
 *    land nearest it (a margin is its land's); the open sea beyond is its own pieces.
 * 3. A piece under SECTOR_MIN_KM2 joins the neighbour in its Zone it borders most, a basin's own neighbour first.
 * 4. A piece over SECTOR_MAX_KM2 is cut along RESOLVE's ecoregion edges, and what is still too big into equal areas.
 *
 * What each Sector's edges follow is read from what parts it from each neighbour (`edgesOf`).
 */
import { W, H, latOf, lonOf, cellKm2 } from './grid';

export const SECTOR_MIN_KM2 = 50_000;
export const SECTOR_MAX_KM2 = 500_000;
/**
 * The cut keeps 3% inside the limits: a Sector's area on the grid and its traced outline's on the sphere differ by
 * about a percent, and the checks measure the outline.
 */
const MERGE_BELOW_KM2 = SECTOR_MIN_KM2 * 1.03;
const SPLIT_ABOVE_KM2 = SECTOR_MAX_KM2 * 0.97;
/** Basins merged until each holds at least this much, so most land in a Sector is one drainage basin's. */
const MIN_BASIN_KM2 = 60_000;
/** Water this many cells (about 130 km) from a Zone's land goes with that land. */
const COAST_CELLS = 12;

export const neighbours = (c: number): number[] => {
  const j = Math.floor(c / W); const i = c - j * W;
  return [j > 0 ? c - W : -1, j < H - 1 ? c + W : -1, j * W + ((i + 1) % W), j * W + ((i + W - 1) % W)];
};
const areaOf = (c: number) => cellKm2(Math.floor(c / W));

/** A binary min-heap of (key, value) pairs in typed arrays. */
class Heap {
  private keys: Float64Array; private vals: Int32Array; size = 0;
  constructor(capacity: number) { this.keys = new Float64Array(capacity); this.vals = new Int32Array(capacity); }
  push(key: number, val: number): void {
    if (this.size === this.keys.length) {
      const k = new Float64Array(this.size * 2); k.set(this.keys); this.keys = k;
      const v = new Int32Array(this.size * 2); v.set(this.vals); this.vals = v;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.keys[i] = this.keys[p]; this.vals[i] = this.vals[p]; i = p;
    }
    this.keys[i] = key; this.vals[i] = val;
  }
  /** The smallest pair's value; its key is left in `lastKey`. */
  pop(): number {
    const val = this.vals[0]; this.lastKey = this.keys[0];
    const key = this.keys[--this.size]; const v = this.vals[this.size];
    let i = 0;
    for (;;) {
      let m = 2 * i + 1;
      if (m >= this.size) break;
      if (m + 1 < this.size && this.keys[m + 1] < this.keys[m]) m++;
      if (this.keys[m] >= key) break;
      this.keys[i] = this.keys[m]; this.vals[i] = this.vals[m]; i = m;
    }
    this.keys[i] = key; this.vals[i] = v;
    return val;
  }
  lastKey = 0;
}

/** Union–find over labels, with each root's area and its neighbours (the lowest saddle and the shared length). */
class Regions {
  parent: Int32Array; area: Float64Array; nb: Array<Map<number, { s: number; len: number }> | null>;
  constructor(n: number) {
    this.parent = Int32Array.from({ length: n + 1 }, (_, k) => k);
    this.area = new Float64Array(n + 1);
    this.nb = Array.from({ length: n + 1 }, () => new Map());
  }
  find(x: number): number { while (this.parent[x] !== x) { this.parent[x] = this.parent[this.parent[x]]; x = this.parent[x]; } return x; }
  touch(a: number, b: number, s: number): void {
    for (const [x, y] of [[a, b], [b, a]]) {
      const m = this.nb[x]!; const held = m.get(y);
      if (held) { held.s = Math.min(held.s, s); held.len++; } else m.set(y, { s, len: 1 });
    }
  }
  /** Merges `r` into `t`. */
  merge(r: number, t: number): void {
    this.parent[r] = t; this.area[t] += this.area[r];
    const mine = this.nb[r]!; const theirs = this.nb[t]!;
    theirs.delete(r);
    for (const [k, v] of mine) {
      if (k === t) continue;
      const held = theirs.get(k);
      const merged = held ? { s: Math.min(held.s, v.s), len: held.len + v.len } : { s: v.s, len: v.len };
      theirs.set(k, merged);
      const other = this.nb[k]!; other.delete(r); other.set(t, { ...merged });
    }
    this.nb[r] = null;
  }
}

/**
 * Merges every region under `min` km² into a neighbour, smallest first, by `choose` (which returns the neighbour, or
 * null to keep it as it is). Regions in `regions` must already hold their areas and neighbours.
 */
function mergeSmall(regions: Regions, labels: number, min: number, choose: (r: number, nb: Map<number, { s: number; len: number }>) => number | null): void {
  const heap = new Heap(labels + 16);
  for (let r = 1; r <= labels; r++) if (regions.find(r) === r && regions.area[r] > 0) heap.push(regions.area[r], r);
  while (heap.size) {
    const r = heap.pop(); const a = heap.lastKey;
    if (regions.find(r) !== r || regions.area[r] !== a) continue;
    if (a >= min) break;
    const nb = regions.nb[r]!;
    const t = nb.size ? choose(r, nb) : null;
    if (t === null) continue;
    regions.merge(r, t);
    heap.push(regions.area[t], t);
  }
}

export interface SectorPiece {
  zone: number;
  km2: number;
  /** The drainage basin most of its land lies in (0 for open sea). */
  basin: number;
  sea: boolean;
}

/** Cuts a Terra into Sectors. Returns each cell's Sector (1-based; 0 outside) and each Sector's facts. */
export function cutSectors(input: {
  zoneOf: Int32Array; land: Uint8Array; relief: Int16Array; plateOf: Uint8Array; ecoregionOf: Int32Array;
  say: (what: string) => void;
}): { sectorOf: Int32Array; pieces: SectorPiece[]; basinOf: Int32Array } {
  const { zoneOf, land, relief, plateOf, ecoregionOf, say } = input;
  const cells: number[] = []; for (let c = 0; c < W * H; c++) if (zoneOf[c]) cells.push(c);
  const isLand = (c: number) => zoneOf[c] > 0 && land[c] === 1;

  // 1. Drainage basins. Markers: every land cell beside water, and every inland low (a flat low one marker).
  const basin = new Int32Array(W * H); let labels = 0;
  const heap = new Heap(cells.length + 16);
  for (const c of cells) {
    if (!isLand(c)) continue;
    if (neighbours(c).some((n) => n >= 0 && !land[n])) { basin[c] = ++labels; heap.push(relief[c], c); }
  }
  for (const c of cells) {
    if (!isLand(c) || basin[c]) continue;
    if (neighbours(c).some((n) => n >= 0 && isLand(n) && relief[n] < relief[c])) continue;
    // A low, with every flat cell joined to it at its height.
    const label = ++labels; const stack = [c]; basin[c] = label;
    while (stack.length) {
      const x = stack.pop()!; heap.push(relief[x], x);
      for (const n of neighbours(x)) if (n >= 0 && isLand(n) && !basin[n] && relief[n] === relief[c]) { basin[n] = label; stack.push(n); }
    }
  }
  while (heap.size) {
    const c = heap.pop(); const key = heap.lastKey;
    for (const n of neighbours(c)) {
      if (n >= 0 && isLand(n) && !basin[n]) { basin[n] = basin[c]; heap.push(Math.max(relief[n], key), n); }
    }
  }
  const regions = new Regions(labels);
  for (const c of cells) {
    if (!isLand(c)) continue;
    regions.area[basin[c]] += areaOf(c);
    const j = Math.floor(c / W); const i = c - j * W;
    for (const n of [j < H - 1 ? c + W : -1, j * W + ((i + 1) % W)]) {
      if (n >= 0 && isLand(n) && basin[n] !== basin[c]) regions.touch(basin[c], basin[n], Math.max(relief[c], relief[n]));
    }
  }
  const raw = labels;
  // The lowest saddle, then the longest shared edge.
  mergeSmall(regions, labels, MIN_BASIN_KM2, (_r, nb) => {
    let best: number | null = null; let bs = Infinity; let bl = -1;
    for (const [k, v] of nb) if (v.s < bs || (v.s === bs && v.len > bl)) { best = k; bs = v.s; bl = v.len; }
    return best;
  });
  const basinOf = new Int32Array(W * H);
  let roots = 0; const rootSeen = new Set<number>();
  for (const c of cells) if (isLand(c)) { const r = regions.find(basin[c]); basinOf[c] = r; if (!rootSeen.has(r)) { rootSeen.add(r); roots++; } }
  say(`sectors: ${raw} basins from the relief, merged to ${roots} of at least ${MIN_BASIN_KM2 / 1000}k km² where they could be`);

  // 2. Pieces: Zone × plate × basin on land, each connected part its own; water near land with it, the open sea apart.
  const pieceOf = new Int32Array(W * H); let pieceCount = 0;
  const pieceZone: number[] = [0]; const pieceSea: boolean[] = [false];
  for (const c of cells) {
    if (!isLand(c) || pieceOf[c]) continue;
    const p = ++pieceCount; pieceZone.push(zoneOf[c]); pieceSea.push(false);
    const stack = [c]; pieceOf[c] = p;
    while (stack.length) {
      const x = stack.pop()!;
      for (const n of neighbours(x)) {
        if (n >= 0 && isLand(n) && !pieceOf[n] && zoneOf[n] === zoneOf[c] && plateOf[n] === plateOf[c] && basinOf[n] === basinOf[c]) { pieceOf[n] = p; stack.push(n); }
      }
    }
  }
  let front: number[] = cells.filter((c) => isLand(c));
  for (let step = 0; step < COAST_CELLS && front.length; step++) {
    const next: number[] = [];
    for (const c of front) for (const n of neighbours(c)) {
      if (n >= 0 && zoneOf[n] === zoneOf[c] && !land[n] && !pieceOf[n]) { pieceOf[n] = pieceOf[c]; next.push(n); }
    }
    front = next;
  }
  for (const c of cells) {
    if (pieceOf[c]) continue;
    const p = ++pieceCount; pieceZone.push(zoneOf[c]); pieceSea.push(true);
    const stack = [c]; pieceOf[c] = p;
    while (stack.length) {
      const x = stack.pop()!;
      for (const n of neighbours(x)) if (n >= 0 && zoneOf[n] === zoneOf[c] && !pieceOf[n]) { pieceOf[n] = p; stack.push(n); }
    }
  }
  say(`sectors: ${pieceCount} pieces cut by Zone, plate and basin`);

  // 3. Small pieces join the neighbour in their Zone they border most, their own basin's first.
  const pieces = new Regions(pieceCount);
  const pieceBasin = new Int32Array(pieceCount + 1);
  {
    const basinArea = new Map<number, Map<number, number>>();
    for (const c of cells) {
      const p = pieceOf[c]; pieces.area[p] += areaOf(c);
      if (basinOf[c]) { const m = basinArea.get(p) ?? new Map<number, number>(); m.set(basinOf[c], (m.get(basinOf[c]) ?? 0) + 1); basinArea.set(p, m); }
      const j = Math.floor(c / W); const i = c - j * W;
      for (const n of [j < H - 1 ? c + W : -1, j * W + ((i + 1) % W)]) {
        if (n >= 0 && zoneOf[n] === zoneOf[c] && pieceOf[n] !== p) pieces.touch(p, pieceOf[n], 0);
      }
    }
    for (const [p, m] of basinArea) pieceBasin[p] = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  mergeSmall(pieces, pieceCount, MERGE_BELOW_KM2, (r, nb) => {
    let best: number | null = null; let score = -1;
    for (const [k, v] of nb) {
      const s = v.len + (pieceBasin[k] && pieceBasin[k] === pieceBasin[r] ? 1e6 : 0);
      if (s > score) { best = k; score = s; }
    }
    return best;
  });
  for (const c of cells) pieceOf[c] = pieces.find(pieceOf[c]);

  // 4. Big pieces cut along ecoregion edges, then into equal areas.
  const byPiece = new Map<number, number[]>();
  for (const c of cells) { const m = byPiece.get(pieceOf[c]); if (m) m.push(c); else byPiece.set(pieceOf[c], [c]); }
  const sectorOf = new Int32Array(W * H);
  const out: SectorPiece[] = [];
  const emit = (members: number[], zone: number, sea: boolean) => {
    const id = out.length + 1; let km2 = 0; const b = new Map<number, number>();
    for (const c of members) { sectorOf[c] = id; km2 += areaOf(c); if (basinOf[c]) b.set(basinOf[c], (b.get(basinOf[c]) ?? 0) + 1); }
    out.push({ zone, km2, sea, basin: [...b.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0 });
  };
  let byEcoregion = 0; let byGrid = 0;
  for (const [p, members] of byPiece) {
    const zone = pieceZone[p]; const sea = pieceSea[p];
    if (pieces.area[p] <= SPLIT_ABOVE_KM2) { emit(members, zone, sea); continue; }
    for (const part of splitByEcoregion(members, ecoregionOf)) {
      const km2 = part.reduce((a, c) => a + areaOf(c), 0);
      if (km2 <= SPLIT_ABOVE_KM2) { emit(part, zone, sea); byEcoregion++; continue; }
      const n = Math.ceil(km2 / (SECTOR_MAX_KM2 * 0.9));
      for (const g of splitEqual(part, n)) { emit(g, zone, sea); byGrid++; }
    }
  }
  const rejoined = joinStrayParts(sectorOf, cells, zoneOf, out);
  say(`sectors: ${out.length} Sectors, ${byEcoregion} cut along ecoregion edges, ${byGrid} into equal areas; ${rejoined} stray cells rejoined`);
  return { sectorOf, pieces: out, basinOf };
}

/**
 * A Sector in more than one part (a straight cut through a winding piece) keeps its largest part; each other part joins
 * the Sector in its Zone it borders most. A part with no such neighbour (an island) stays.
 */
function joinStrayParts(sectorOf: Int32Array, cells: number[], zoneOf: Int32Array, out: SectorPiece[]): number {
  let moved = 0;
  const part = new Int32Array(W * H); let n = 0;
  const partSector: number[] = [0]; const partSize: number[] = [0];
  for (const c of cells) {
    if (part[c]) continue;
    const label = ++n; partSector.push(sectorOf[c]); partSize.push(0);
    const stack = [c]; part[c] = label;
    while (stack.length) {
      const x = stack.pop()!; partSize[label]++;
      for (const y of neighbours(x)) if (y >= 0 && !part[y] && sectorOf[y] === sectorOf[c]) { part[y] = label; stack.push(y); }
    }
  }
  const largest = new Map<number, number>();
  for (let k = 1; k <= n; k++) { const s = partSector[k]; const held = largest.get(s); if (!held || partSize[k] > partSize[held]) largest.set(s, k); }
  const border = new Map<number, Map<number, number>>();
  for (const c of cells) {
    const k = part[c]; if (largest.get(sectorOf[c]) === k) continue;
    for (const y of neighbours(c)) {
      if (y < 0 || !sectorOf[y] || sectorOf[y] === sectorOf[c] || zoneOf[y] !== zoneOf[c]) continue;
      const m = border.get(k) ?? new Map<number, number>(); m.set(sectorOf[y], (m.get(sectorOf[y]) ?? 0) + 1); border.set(k, m);
    }
  }
  const to = new Map<number, number>();
  for (const [k, m] of border) to.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  for (const c of cells) {
    const t = to.get(part[c]);
    if (t === undefined) continue;
    const km2 = areaOf(c);
    out[sectorOf[c] - 1].km2 -= km2; out[t - 1].km2 += km2;
    sectorOf[c] = t; moved++;
  }
  return moved;
}

/** One piece cut by ecoregion, each connected part its own, the parts under SECTOR_MIN_KM2 joined to the one they border most. */
function splitByEcoregion(members: number[], ecoregionOf: Int32Array): number[][] {
  const inPiece = new Set(members);
  const part = new Map<number, number>(); let n = 0;
  for (const c of members) {
    if (part.has(c)) continue;
    const label = ++n; const stack = [c]; part.set(c, label);
    while (stack.length) {
      const x = stack.pop()!;
      for (const y of neighbours(x)) if (y >= 0 && inPiece.has(y) && !part.has(y) && ecoregionOf[y] === ecoregionOf[c]) { part.set(y, label); stack.push(y); }
    }
  }
  const regions = new Regions(n);
  for (const c of members) {
    const p = part.get(c)!; regions.area[p] += areaOf(c);
    const j = Math.floor(c / W); const i = c - j * W;
    for (const y of [j < H - 1 ? c + W : -1, j * W + ((i + 1) % W)]) if (y >= 0 && inPiece.has(y) && part.get(y) !== p) regions.touch(p, part.get(y)!, 0);
  }
  mergeSmall(regions, n, MERGE_BELOW_KM2, (_r, nb) => {
    let best: number | null = null; let bl = -1;
    for (const [k, v] of nb) if (v.len > bl) { best = k; bl = v.len; }
    return best;
  });
  const groups = new Map<number, number[]>();
  for (const c of members) { const r = regions.find(part.get(c)!); const g = groups.get(r); if (g) g.push(c); else groups.set(r, [c]); }
  return [...groups.values()];
}

/** Cuts cells into `n` parts of about equal area, halving across the longer side each time (an equal-area grid). */
function splitEqual(members: number[], n: number): number[][] {
  if (n <= 1) return [members];
  const lat0 = members.reduce((a, c) => a + latOf(Math.floor(c / W)), 0) / members.length;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  // Longitudes about the piece's own middle, so a piece across ±180° is measured as one.
  const lon0 = lonOf(members[0] % W);
  const x = (c: number) => { let d = lonOf(c % W) - lon0; if (d > 180) d -= 360; if (d < -180) d += 360; return d * cos; };
  const y = (c: number) => latOf(Math.floor(c / W));
  const xs = members.map(x); const ys = members.map(y);
  // Spans by a loop: an ocean's piece holds millions of cells, too many to spread into Math.max.
  const span = (v: number[]) => { let lo = Infinity; let hi = -Infinity; for (const a of v) { if (a < lo) lo = a; if (a > hi) hi = a; } return hi - lo; };
  const spanX = span(xs); const spanY = span(ys);
  const along = spanX >= spanY ? xs : ys;
  const order = members.map((c, k) => k).sort((a, b) => along[a] - along[b]);
  const first = Math.floor(n / 2); const total = members.reduce((a, c) => a + areaOf(c), 0);
  const target = (total * first) / n;
  let acc = 0; let cut = 0;
  for (; cut < order.length; cut++) { acc += areaOf(members[order[cut]]); if (acc >= target) break; }
  const a = order.slice(0, cut + 1).map((k) => members[k]); const b = order.slice(cut + 1).map((k) => members[k]);
  return [...splitEqual(a, first), ...splitEqual(b, n - first)];
}
