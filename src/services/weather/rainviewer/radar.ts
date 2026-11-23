/**
 * Radar from RainViewer's tiles, read back to rain (decision D-W, WX4).
 *
 * RainViewer serves one colour scheme since 2026, Universal Blue, and
 * publishes its table: the colour of each reflectivity (dBZ, −32 to 95), for
 * rain and for snow (universalBlue.json). Every pixel of a tile is one of
 * them (checked on real tiles, 2026-10-06), so a pixel reads back to its dBZ
 * exactly; RainViewer's terms let an image be changed freely, so Starcom
 * draws it in its own rain scale. A colour the table does not hold is never
 * guessed at: a few pinks a tile (mixed precipitation, it seems, which
 * RainViewer colours but does not publish) leave their pixel to the model.
 *
 * Reflectivity becomes a rate by the standard relations: Marshall–Palmer,
 * Z = 200 R^1.6, for rain; Z = 2000 R^2 for snow, as liquid water.
 *
 * RainViewer's coverage tiles paint black where no radar reaches and leave
 * clear where one does (checked: clear over Philadelphia and Chicago, black
 * over the open Atlantic). Where radar reaches, it decides, rain or none;
 * elsewhere the model's rain stands.
 */
import table from './universalBlue.json';
import type { RgbaImage } from '../png';

export interface Echo { dbz: number; snow: boolean }

const ECHOES = new Map<string, Echo>();
for (const [snow, colours] of [[false, table.rain], [true, table.snow]] as const) {
  colours.forEach((colour, i) => {
    const key = colour.toLowerCase();
    // Transparent is no echo; a colour the table repeats keeps its lowest dBZ (rain before snow).
    if (key.endsWith('00') || ECHOES.has(key)) return;
    ECHOES.set(key, { dbz: table.firstDbz + i, snow });
  });
}

const hex2 = (v: number) => v.toString(16).padStart(2, '0');

/** The echo a pixel's colour means, or null for none (transparent, or a colour the table does not hold). */
export function echoOfColour(r: number, g: number, b: number, a: number): Echo | null {
  if (a === 0) return null;
  return ECHOES.get(`#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`) ?? null;
}

/** mm/h (liquid water for snow) from reflectivity. */
export function rainRateOfEcho(echo: Echo): number {
  const z = 10 ** (echo.dbz / 10);
  return echo.snow ? Math.sqrt(z / 2000) : (z / 200) ** (1 / 1.6);
}

/** The radar of one frame at one zoom, in Web Mercator pixels: rate, snow, and where radar reaches. */
export interface RadarMosaic {
  zoom: number;
  size: number;
  rate: Float32Array;
  snow: Uint8Array;
  covered: Uint8Array;
  /** Which pixels a radar tile was read for, and which a coverage tile was. */
  radarRead: Uint8Array;
  coverageRead: Uint8Array;
  /** Pixels coloured in a colour the table does not hold: radar saw something it does not say the strength of. */
  unread: Uint8Array;
}

export function emptyMosaic(zoom: number): RadarMosaic {
  const size = 256 * 2 ** zoom;
  const n = size * size;
  return { zoom, size, rate: new Float32Array(n), snow: new Uint8Array(n), covered: new Uint8Array(n), radarRead: new Uint8Array(n), coverageRead: new Uint8Array(n), unread: new Uint8Array(n) };
}

export function addRadarTile(m: RadarMosaic, tx: number, ty: number, tile: RgbaImage): void {
  for (let y = 0; y < tile.height; y++) for (let x = 0; x < tile.width; x++) {
    const k = (y * tile.width + x) * 4;
    const p = (ty * 256 + y) * m.size + tx * 256 + x;
    const echo = echoOfColour(tile.data[k], tile.data[k + 1], tile.data[k + 2], tile.data[k + 3]);
    m.rate[p] = echo ? rainRateOfEcho(echo) : 0;
    m.snow[p] = echo?.snow ? 1 : 0;
    m.unread[p] = !echo && tile.data[k + 3] > 0 ? 1 : 0;
    m.radarRead[p] = 1;
  }
}

export function addCoverageTile(m: RadarMosaic, tx: number, ty: number, tile: RgbaImage): void {
  for (let y = 0; y < tile.height; y++) for (let x = 0; x < tile.width; x++) {
    const p = (ty * 256 + y) * m.size + tx * 256 + x;
    m.covered[p] = tile.data[(y * tile.width + x) * 4 + 3] === 0 ? 1 : 0;
    m.coverageRead[p] = 1;
  }
}

/** Mercator's limit: RainViewer's tiles stop at about 85°. */
const MAX_LAT = 85.05112878;

/**
 * What radar says at a place: whether it reaches there, and if it does, the
 * rate (0 where it sees none) and whether it is snow. Null where no tile of
 * this frame was read, or beyond Mercator's reach.
 */
export function radarAt(m: RadarMosaic, lat: number, lng: number): { covered: boolean; rate: number; snow: boolean } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > MAX_LAT) return null;
  const X = ((((lng + 180) / 360) % 1) + 1) % 1;
  const s = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const Y = (1 - s / Math.PI) / 2;
  const p = Math.min(Math.floor(Y * m.size), m.size - 1) * m.size + Math.min(Math.floor(X * m.size), m.size - 1);
  if (!m.radarRead[p] && !m.coverageRead[p]) return null;
  // Radar saw something here it does not say the strength of: the model's rain stands.
  if (m.unread[p]) return { covered: false, rate: 0, snow: false };
  const covered = m.coverageRead[p] ? m.covered[p] === 1 : m.rate[p] > 0;
  return covered ? { covered, rate: m.rate[p], snow: m.snow[p] === 1 } : { covered, rate: 0, snow: false };
}
