/**
 * A GRIB2 reader for one thing: NOAA GFS fields on the 1° grid, as NOAA Open
 * Data Dissemination serves them on AWS (decision D-W, WX5).
 *
 * Each field the weather layers draw arrives as one GRIB2 message, fetched by
 * byte range using the text index (`.idx`) that sits beside every GFS file.
 * Every such field was checked on 2026-10-05 and all share one form: a regular
 * latitude–longitude grid scanned west to east from the north (grid template
 * 3.0, scan 0), complex packing with second-order spatial differencing
 * (template 5.3), no bitmap, no missing values. So that is what this reads,
 * and everything else is refused by name. A reader that guessed at a form it
 * was never tested on would draw wrong temperatures without a word.
 *
 * The tests compare it with ECMWF's ecCodes on real messages.
 */

/** Where a field's values sit: a regular latitude–longitude grid, in degrees. */
export interface LatLonGrid {
  ni: number;
  nj: number;
  /** The first point's latitude and longitude (the first row is the northernmost). */
  la1: number;
  lo1: number;
  la2: number;
  lo2: number;
  di: number;
  dj: number;
}

export interface Grib2Field {
  /** WMO's discipline, category and number: what the values measure. */
  parameter: { discipline: number; category: number; number: number };
  /** When the model run started. */
  reference: Date;
  /** When the values hold: the moment, or the end of the window a mean or total covers. */
  valid: Date;
  /** For a mean or a total: the window it covers. */
  window?: { start: Date; end: Date };
  grid: LatLonGrid;
  /** Row by row from the north, west to east, in the field's own units. */
  values: Float32Array;
}

/** Reads bits most-significant first, as GRIB2 packs them. */
class BitReader {
  private pos: number;
  constructor(private readonly b: Uint8Array, byteOffset: number) {
    this.pos = byteOffset * 8;
  }
  read(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      v = v * 2 + ((this.b[this.pos >> 3] >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }
  /** Each list of group descriptors starts on a whole octet. */
  align(): void {
    this.pos = (this.pos + 7) & ~7;
  }
}

// GRIB2 writes signed integers as a sign bit and a magnitude, not two's complement.
const signed16 = (dv: DataView, o: number) => { const v = dv.getUint16(o); return v & 0x8000 ? -(v & 0x7fff) : v; };
const signed32 = (dv: DataView, o: number) => { const v = dv.getUint32(o); return v & 0x80000000 ? -(v & 0x7fffffff) : v; };
const signedN = (b: Uint8Array, o: number, n: number) => {
  let v = b[o] & 0x7f;
  for (let i = 1; i < n; i++) v = v * 256 + b[o + i];
  return b[o] & 0x80 ? -v : v;
};

const HOURS_PER_UNIT: Record<number, number> = { 0: 1 / 60, 1: 1, 2: 24, 10: 3, 11: 6, 12: 12, 13: 1 / 3600 };

/** Decodes one GFS message. Throws, naming what it met, on any form it does not read. */
export function decodeGrib2(input: Uint8Array): Grib2Field {
  const b = input;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 16 || String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'GRIB' || b[7] !== 2) {
    throw new Error('This is not a GRIB2 message.');
  }
  const total = Number(dv.getBigUint64(8));
  if (total > b.length) throw new Error(`The message is ${total} bytes; only ${b.length} arrived.`);
  const discipline = b[6];

  const at: Record<number, number> = {};
  for (let o = 16; o < total - 4;) {
    const len = dv.getUint32(o);
    if (len < 5) throw new Error(`A section at byte ${o} claims ${len} bytes.`);
    at[b[o + 4]] = o;
    o += len;
  }
  for (const n of [1, 3, 4, 5, 6, 7]) if (at[n] === undefined) throw new Error(`Section ${n} is missing.`);
  const s1 = at[1], s3 = at[3], s4 = at[4], s5 = at[5], s6 = at[6], s7 = at[7];

  const reference = utc(dv, b, s1 + 12);

  const gridTemplate = dv.getUint16(s3 + 12);
  if (gridTemplate !== 0) throw new Error(`Grid template 3.${gridTemplate} is not read; only 3.0 (latitude–longitude) is.`);
  if (b[s3 + 71] !== 0) throw new Error(`Scan mode ${b[s3 + 71]} is not read; only 0 (west to east, from the north) is.`);
  const grid: LatLonGrid = {
    ni: dv.getUint32(s3 + 30), nj: dv.getUint32(s3 + 34),
    la1: signed32(dv, s3 + 46) / 1e6, lo1: signed32(dv, s3 + 50) / 1e6,
    la2: signed32(dv, s3 + 55) / 1e6, lo2: signed32(dv, s3 + 59) / 1e6,
    di: dv.getUint32(s3 + 63) / 1e6, dj: dv.getUint32(s3 + 67) / 1e6,
  };

  const productTemplate = dv.getUint16(s4 + 7);
  const parameter = { discipline, category: b[s4 + 9], number: b[s4 + 10] };
  const hours = HOURS_PER_UNIT[b[s4 + 17]];
  if (hours === undefined) throw new Error(`Time unit ${b[s4 + 17]} is not read.`);
  const start = new Date(reference.getTime() + signed32(dv, s4 + 18) * hours * 3600e3);
  let valid = start;
  let window: Grib2Field['window'];
  if (productTemplate === 8) {
    // A mean or a total: octets 35–41 give the end of the window it covers.
    const end = utc(dv, b, s4 + 34);
    valid = end;
    window = { start, end };
  } else if (productTemplate !== 0) {
    throw new Error(`Product template 4.${productTemplate} is not read; only 4.0 and 4.8 are.`);
  }

  const n = dv.getUint32(s5 + 5);
  const packing = dv.getUint16(s5 + 9);
  if (packing !== 3) throw new Error(`Packing 5.${packing} is not read; only 5.3 (complex, spatially differenced) is.`);
  if (b[s6 + 5] !== 255) throw new Error('A bitmap is present; this reader takes only fields with a value at every point.');
  if (b[s5 + 22] !== 0) throw new Error('The field marks missing values; this reader takes only fields with none.');
  const order = b[s5 + 47];
  if (order !== 2) throw new Error(`Spatial differencing of order ${order} is not read; only order 2 is.`);
  if (n !== grid.ni * grid.nj) throw new Error(`${n} values for a ${grid.ni} × ${grid.nj} grid.`);

  const R = dv.getFloat32(s5 + 11);
  const E = signed16(dv, s5 + 15);
  const D = signed16(dv, s5 + 17);
  const refBits = b[s5 + 19];
  const groups = dv.getUint32(s5 + 31);
  const widthRef = b[s5 + 35], widthBits = b[s5 + 36];
  const lengthRef = dv.getUint32(s5 + 37), lengthInc = b[s5 + 41], lastLength = dv.getUint32(s5 + 42), lengthBits = b[s5 + 46];
  const octets = b[s5 + 48];

  // Section 7: the first two values and the smallest difference, then three
  // lists (each group's reference, width and length), then the packed values.
  let o = s7 + 5;
  const first = signedN(b, o, octets); o += octets;
  const second = signedN(b, o, octets); o += octets;
  const minimum = signedN(b, o, octets); o += octets;
  const bits = new BitReader(b, o);
  const groupRef = new Array<number>(groups);
  for (let g = 0; g < groups; g++) groupRef[g] = bits.read(refBits);
  bits.align();
  const groupWidth = new Array<number>(groups);
  for (let g = 0; g < groups; g++) groupWidth[g] = widthRef + bits.read(widthBits);
  bits.align();
  const groupLength = new Array<number>(groups);
  for (let g = 0; g < groups; g++) groupLength[g] = lengthRef + lengthInc * bits.read(lengthBits);
  bits.align();
  groupLength[groups - 1] = lastLength;

  const x = new Float64Array(n);
  let i = 0;
  for (let g = 0; g < groups; g++) {
    const w = groupWidth[g];
    for (let k = 0; k < groupLength[g]; k++, i++) x[i] = groupRef[g] + (w ? bits.read(w) : 0);
  }
  if (i !== n) throw new Error(`The groups hold ${i} values; the message says ${n}.`);

  // Undo the second-order differencing: each value was stored as the change
  // in its change, less the smallest such.
  x[0] = first;
  x[1] = second;
  for (let k = 2; k < n; k++) x[k] = x[k] + minimum + 2 * x[k - 1] - x[k - 2];

  const values = new Float32Array(n);
  const binary = 2 ** E, decimal = 10 ** -D;
  for (let k = 0; k < n; k++) values[k] = (R + x[k] * binary) * decimal;
  return { parameter, reference, valid, window, grid, values };
}

function utc(dv: DataView, b: Uint8Array, o: number): Date {
  return new Date(Date.UTC(dv.getUint16(o), b[o + 2] - 1, b[o + 3], b[o + 4], b[o + 5], b[o + 6]));
}

/** One line of a GFS index: a message, and the bytes it occupies in the file. */
export interface IdxRecord {
  n: string;
  start: number;
  /** The last byte, inclusive; null for the last message, which runs to the file's end. */
  end: number | null;
  name: string;
  level: string;
  forecast: string;
}

/** Reads a `.idx` file: `n:offset:d=run:NAME:level:forecast:`. */
export function parseIdx(text: string): IdxRecord[] {
  const rows = text.trim().split('\n').map((line) => line.split(':'));
  const starts = rows.map((r) => Number(r[1]));
  return rows.map((r, i) => {
    // Sub-messages share an offset: a record ends where the next distinct offset begins.
    let next = i + 1;
    while (next < rows.length && starts[next] === starts[i]) next++;
    return { n: r[0], start: starts[i], end: next < rows.length ? starts[next] - 1 : null, name: r[3], level: r[4], forecast: r[5] };
  });
}

/**
 * The first message with this name and level, and, when `forecast` is given,
 * whose forecast column matches it (a moment, "3 hour fcst", or a mean,
 * "0-3 hour ave fcst").
 */
export function findField(records: IdxRecord[], name: string, level: string, forecast?: RegExp): IdxRecord | undefined {
  return records.find((r) => r.name === name && r.level === level && (!forecast || forecast.test(r.forecast)));
}
