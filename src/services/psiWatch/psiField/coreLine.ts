/**
 * The core's null-flux line for the ψ field (decision D-PW, PW78, PW80): where the radial field Br changes sign at the
 * core's surface, 3,485 km from the centre, for the year drawn, from IGRF-14 (as the magnetic shield takes it). Traced
 * on a 1° grid of cell centres, the crossings chained into lines and the pieces of eight places or fewer left out, as
 * the experiment does; its band, 350 km wide, is the fourth of G's.
 */
import { coefficientsAt, radialGrid, type IgrfCoefficients } from '../shield/igrfField';
import { isolines } from '../shield/isolines';
import { band, densify, type LatLon } from './grid';

export const CORE_KM = 3485;
const CORE_GRID = { lat0: -89.5, lon0: -179.5, step: 1, rows: 180, cols: 360 } as const;
const MIN_PLACES = 9;

/** Each null-flux line, [lat, lon] in order, for a year (1900–2030). */
export function nullFluxLines(igrf: IgrfCoefficients, year: number): Array<Array<[number, number]>> {
  const br = radialGrid(coefficientsAt(igrf, year), CORE_KM, CORE_GRID);
  return chain(isolines({ values: br, ...CORE_GRID }, 0)).filter((line) => line.length >= MIN_PLACES);
}

/** The null-flux lines' band on the ψ grid, and the lines themselves. */
export function coreBand(igrf: IgrfCoefficients, year: number, wKm: number): { band: Float64Array; lines: Array<Array<[number, number]>> } {
  const lines = nullFluxLines(igrf, year);
  return { band: band(lines.flatMap((line) => densify(line)), wKm), lines };
}

const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;
const key = ([lat, lon]: LatLon) => `${lat.toFixed(5)},${wrap(lon).toFixed(5)}`;

/** Marching squares' segments joined end to end into lines (closed ones end where they began), longitudes wrapped. */
export function chain(segments: ReadonlyArray<readonly [LatLon, LatLon]>): Array<Array<[number, number]>> {
  const at = new Map<string, number[]>();
  segments.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const k = key(p);
      const list = at.get(k);
      if (list) list.push(i); else at.set(k, [i]);
    }
  });
  const used = new Uint8Array(segments.length);
  const other = (i: number, p: LatLon): LatLon => (key(segments[i][0]) === key(p) ? segments[i][1] : segments[i][0]);
  const walk = (from: LatLon): LatLon[] => {
    const out: LatLon[] = [];
    let p = from;
    for (;;) {
      const next = at.get(key(p))?.find((i) => !used[i]);
      if (next === undefined) return out;
      used[next] = 1;
      p = other(next, p);
      out.push(p);
    }
  };
  const lines: Array<Array<[number, number]>> = [];
  segments.forEach(([a, b], i) => {
    if (used[i]) return;
    used[i] = 1;
    const forward = walk(b);
    const backward = walk(a).reverse();
    lines.push([...backward, a, b, ...forward].map(([lat, lon]) => [lat, wrap(lon)]));
  });
  return lines;
}
