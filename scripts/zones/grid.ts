/**
 * The 0.1° grid ZSP 2.0 is drawn on (decision D-ZR, ZR18): 3,600 × 1,800 cells, row 0 the northernmost (centre
 * 89.95° N), column 0 from −180° (centre −179.95°), each cell decided at its centre; and what the builders share to
 * fill it, read sources into it, walk it and picture it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

export const W = 3600;
export const H = 1800;
export const CELL = 0.1;
export const lonOf = (i: number) => -180 + CELL / 2 + CELL * i;
export const latOf = (j: number) => 90 - CELL / 2 - CELL * j;
export const colOf = (lon: number) => Math.min(W - 1, Math.max(0, Math.floor((lon + 180) / CELL)));
export const rowOf = (lat: number) => Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / CELL)));
export const KM_PER_DEG = 111.195;

export type Ring = Array<[number, number]>;
export type Mask = Uint8Array;
export const newMask = (): Mask => new Uint8Array(W * H);
/** A cell's area in km² on row `j`. */
export const cellKm2 = (j: number): number => (CELL * KM_PER_DEG) ** 2 * Math.cos((latOf(j) * Math.PI) / 180);

/** Fills a polygon's rings (outer and holes, even–odd) into a mask, each cell by its centre. */
export function fillRings(mask: Mask | Int32Array | Uint32Array, rings: Ring[], value = 1): void {
  let minLat = 90; let maxLat = -90;
  for (const r of rings) for (const [, la] of r) { if (la < minLat) minLat = la; if (la > maxLat) maxLat = la; }
  const crossings: number[] = [];
  for (let j = rowOf(maxLat); j <= rowOf(minLat); j++) {
    const y = latOf(j);
    crossings.length = 0;
    for (const ring of rings) {
      for (let k = 0, n = ring.length; k < n; k++) {
        const [x1, y1] = ring[k];
        const [x2, y2] = ring[(k + 1) % n];
        if ((y1 > y) !== (y2 > y)) crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      // Cells whose centres lie between the two crossings.
      const from = Math.ceil((crossings[k] + 180 - CELL / 2) / CELL);
      const to = Math.floor((crossings[k + 1] + 180 - CELL / 2) / CELL);
      for (let i = Math.max(0, from); i <= Math.min(W - 1, to); i++) mask[j * W + i] = value;
    }
  }
}

export function polygonsOf(geometry: { type: string; coordinates: unknown }): Ring[][] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as Ring[]];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as Ring[][];
  return [];
}

export function fillGeoJson(path: string, mask: Mask = newMask()): Mask {
  const doc = JSON.parse(readFileSync(path, 'utf8')) as { features: Array<{ geometry: { type: string; coordinates: unknown } | null }> };
  for (const f of doc.features) if (f.geometry) for (const rings of polygonsOf(f.geometry)) fillRings(mask, rings);
  return mask;
}

/** A polygon shapefile's records, each with its rings and its attributes (dBase). */
export function readShapefile(base: string): Array<{ rings: Ring[]; attrs: Record<string, string> }> {
  const shp = readFileSync(`${base}.shp`);
  const dbf = readFileSync(`${base}.dbf`);
  const nrec = dbf.readUInt32LE(4); const hlen = dbf.readUInt16LE(8); const rlen = dbf.readUInt16LE(10);
  const fields: Array<{ name: string; len: number }> = [];
  for (let p = 32; dbf[p] !== 0x0d; p += 32) fields.push({ name: dbf.toString('latin1', p, p + 11).replace(/\0.*$/, ''), len: dbf[p + 16] });
  const attrs = (i: number) => {
    const out: Record<string, string> = {}; let pos = hlen + i * rlen + 1;
    for (const f of fields) { out[f.name] = dbf.toString('latin1', pos, pos + f.len).trim(); pos += f.len; }
    return out;
  };
  const records: Array<{ rings: Ring[]; attrs: Record<string, string> }> = [];
  let off = 100; let i = 0;
  while (off < shp.length) {
    const len = shp.readInt32BE(off + 4) * 2;
    const type = shp.readInt32LE(off + 8);
    if (type === 5) {
      const b = off + 12;
      const numParts = shp.readInt32LE(b + 32); const numPoints = shp.readInt32LE(b + 36);
      const parts = Array.from({ length: numParts }, (_, k) => shp.readInt32LE(b + 40 + 4 * k));
      const pts = b + 40 + 4 * numParts;
      const rings: Ring[] = parts.map((start, k) => {
        const end = k + 1 < numParts ? parts[k + 1] : numPoints;
        return Array.from({ length: end - start }, (_, n) => [shp.readDoubleLE(pts + 16 * (start + n)), shp.readDoubleLE(pts + 16 * (start + n) + 8)] as [number, number]);
      });
      records.push({ rings, attrs: attrs(i) });
    }
    off += 8 + len; i++;
  }
  return records;
}

/** Connected cells from seeds, 4-neighbours, the longitude wrapping; through `pass`. */
export function flood(pass: Mask, seeds: number[]): Mask {
  const out = newMask(); const stack: number[] = [];
  for (const s of seeds) if (pass[s] && !out[s]) { out[s] = 1; stack.push(s); }
  while (stack.length) {
    const c = stack.pop()!; const j = Math.floor(c / W); const i = c - j * W;
    const next = [j > 0 ? c - W : -1, j < H - 1 ? c + W : -1, j * W + ((i + 1) % W), j * W + ((i + W - 1) % W)];
    for (const n of next) if (n >= 0 && pass[n] && !out[n]) { out[n] = 1; stack.push(n); }
  }
  return out;
}

/** Labels each connected component of `set` (4-neighbours, wrapping); 0 is outside. */
export function components(set: Mask): Int32Array {
  const label = new Int32Array(W * H); let next = 0; const stack: number[] = [];
  for (let c = 0; c < W * H; c++) {
    if (!set[c] || label[c]) continue;
    next += 1; label[c] = next; stack.push(c);
    while (stack.length) {
      const x = stack.pop()!; const j = Math.floor(x / W); const i = x - j * W;
      const ns = [j > 0 ? x - W : -1, j < H - 1 ? x + W : -1, j * W + ((i + 1) % W), j * W + ((i + W - 1) % W)];
      for (const n of ns) if (n >= 0 && set[n] && !label[n]) { label[n] = next; stack.push(n); }
    }
  }
  return label;
}

/** Cells within `km` of any cell of `from` (stamped from its edge cells). */
export function within(from: Mask, km: number): Mask {
  const out = newMask();
  const dj = Math.ceil(km / (KM_PER_DEG * CELL));
  for (let c = 0; c < W * H; c++) {
    if (!from[c]) continue;
    out[c] = 1;
    const j = Math.floor(c / W); const i = c - j * W;
    // Only an edge cell can reach past its neighbours.
    const edge = (j > 0 && !from[c - W]) || (j < H - 1 && !from[c + W]) || !from[j * W + ((i + 1) % W)] || !from[j * W + ((i + W - 1) % W)];
    if (!edge) continue;
    for (let y = Math.max(0, j - dj); y <= Math.min(H - 1, j + dj); y++) {
      const dyKm = (y - j) * CELL * KM_PER_DEG;
      const rest = km * km - dyKm * dyKm;
      if (rest < 0) continue;
      const cos = Math.max(Math.cos((latOf(y) * Math.PI) / 180), 1e-3);
      const di = Math.min(W / 2, Math.floor(Math.sqrt(rest) / (CELL * KM_PER_DEG * cos)));
      for (let x = i - di; x <= i + di; x++) out[y * W + ((x % W) + W) % W] = 1;
    }
  }
  return out;
}

/** Marks the cells a polyline crosses, stepping finely, so a 4-neighbour flood cannot slip through it. */
export function drawLine(mask: Mask, points: Ring): void {
  for (let k = 0; k + 1 < points.length; k++) {
    const [x1, y1] = points[k]; const [x2, y2] = points[k + 1];
    if (!Number.isFinite(x1 + y1 + x2 + y2) || Math.abs(x2 - x1) > 180) continue;
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (CELL / 4)));
    let last = -1;
    for (let t = 0; t <= steps; t++) {
      const lon = x1 + ((x2 - x1) * t) / steps; const lat = y1 + ((y2 - y1) * t) / steps;
      const c = rowOf(lat) * W + colOf(lon);
      if (last >= 0 && c !== last) {
        // Fill the corner a diagonal step would leave, so the line is 4-connected.
        const lj = Math.floor(last / W); const li = last - lj * W; const cj = Math.floor(c / W); const ci = c - cj * W;
        if (lj !== cj && li !== ci) mask[lj * W + ci] = 1;
      }
      mask[c] = 1; last = c;
    }
  }
}

export function writePng(path: string, w: number, h: number, raw: Buffer): void {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

/**
 * A polygon shapefile's records one at a time, skipping any whose box misses `within` ([west, south, east, north])
 * before its points are read: RESOLVE's 243 MB is read once, never held as arrays.
 */
export function forEachShape(
  base: string,
  within: [number, number, number, number],
  each: (rings: Ring[], attrs: Record<string, string>) => void,
): void {
  const shp = readFileSync(`${base}.shp`);
  const dbf = readFileSync(`${base}.dbf`);
  const hlen = dbf.readUInt16LE(8); const rlen = dbf.readUInt16LE(10);
  const fields: Array<{ name: string; len: number }> = [];
  for (let p = 32; dbf[p] !== 0x0d; p += 32) fields.push({ name: dbf.toString('latin1', p, p + 11).replace(/\0.*$/, ''), len: dbf[p + 16] });
  const attrs = (i: number) => {
    const out: Record<string, string> = {}; let pos = hlen + i * rlen + 1;
    // dBase pads a field with spaces, or with NULs (Natural Earth's rivers): both are trimmed.
    for (const f of fields) { out[f.name] = dbf.toString('utf8', pos, pos + f.len).replace(/\0/g, '').trim(); pos += f.len; }
    return out;
  };
  const [ww, ws, we, wn] = within;
  let off = 100; let i = 0;
  while (off < shp.length) {
    const len = shp.readInt32BE(off + 4) * 2;
    const type = shp.readInt32LE(off + 8);
    if (type === 5) {
      const b = off + 12;
      const xmin = shp.readDoubleLE(b); const ymin = shp.readDoubleLE(b + 8); const xmax = shp.readDoubleLE(b + 16); const ymax = shp.readDoubleLE(b + 24);
      if (xmax >= ww && xmin <= we && ymax >= ws && ymin <= wn) {
        const numParts = shp.readInt32LE(b + 32); const numPoints = shp.readInt32LE(b + 36);
        const parts = Array.from({ length: numParts }, (_, k) => shp.readInt32LE(b + 40 + 4 * k));
        const pts = b + 40 + 4 * numParts;
        const rings: Ring[] = parts.map((start, k) => {
          const end = k + 1 < numParts ? parts[k + 1] : numPoints;
          return Array.from({ length: end - start }, (_, n) => [shp.readDoubleLE(pts + 16 * (start + n)), shp.readDoubleLE(pts + 16 * (start + n) + 8)] as [number, number]);
        });
        each(rings, attrs(i));
      }
    }
    off += 8 + len; i++;
  }
}
