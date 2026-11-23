/**
 * The ψ field's grid (decision D-PW, PW57, PW78): 2° cells, their centres from 89°S to 89°N and 179°W to 179°E, rows
 * south to north, `values[row * cols + col]`; places as unit vectors on a sphere of 6,371 km. A feature's band is
 * exp(−d²/2w²) of each cell's distance to the feature's nearest sample; a polyline is sampled every half degree.
 */

export const PSI_GRID = { lat0: -89, lon0: -179, step: 2, rows: 90, cols: 180 } as const;
export const PSI_CELLS = PSI_GRID.rows * PSI_GRID.cols;
export const EARTH_KM = 6371;

const RAD = Math.PI / 180;

export type LatLon = readonly [number, number];

/** A place as a unit vector: x toward 0°N 0°E, z toward the north pole. */
export function unit(lat: number, lon: number): [number, number, number] {
  const la = lat * RAD;
  const lo = lon * RAD;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

export const cellLat = (row: number): number => PSI_GRID.lat0 + row * PSI_GRID.step;
export const cellLon = (col: number): number => PSI_GRID.lon0 + col * PSI_GRID.step;

let units: Float64Array | null = null;

/** Every cell's centre as a unit vector, `[x, y, z]` per cell. */
export function gridUnits(): Float64Array {
  if (units) return units;
  units = new Float64Array(PSI_CELLS * 3);
  for (let r = 0; r < PSI_GRID.rows; r++) {
    for (let c = 0; c < PSI_GRID.cols; c++) {
      units.set(unit(cellLat(r), cellLon(c)), (r * PSI_GRID.cols + c) * 3);
    }
  }
  return units;
}

/** exp(−d²/2w²) at each cell, d its great-circle distance to the nearest of `points`; all zero when there are none. */
export function band(points: readonly LatLon[], wKm: number): Float64Array {
  const out = new Float64Array(PSI_CELLS);
  if (!points.length) return out;
  const p = new Float64Array(points.length * 3);
  points.forEach(([lat, lon], i) => p.set(unit(lat, lon), i * 3));
  const g = gridUnits();
  const twoW2 = 2 * wKm * wKm;
  for (let k = 0; k < PSI_CELLS; k++) {
    const x = g[k * 3];
    const y = g[k * 3 + 1];
    const z = g[k * 3 + 2];
    let best = -1;
    for (let i = 0; i < p.length; i += 3) {
      const dot = x * p[i] + y * p[i + 1] + z * p[i + 2];
      if (dot > best) best = dot;
    }
    const d = Math.acos(Math.max(-1, Math.min(1, best))) * EARTH_KM;
    out[k] = Math.exp(-(d * d) / twoW2);
  }
  return out;
}

/**
 * A polyline sampled every `stepDeg` along each leg, in latitude and longitude (the shorter way round), each leg's end
 * left to the next; the line's last place is not repeated.
 */
export function densify(polyline: readonly LatLon[], stepDeg = 0.5): LatLon[] {
  const out: LatLon[] = [];
  for (let i = 0; i + 1 < polyline.length; i++) {
    const [a, b] = polyline[i];
    const [c, d] = polyline[i + 1];
    const dLon = ((((d - b + 180) % 360) + 360) % 360) - 180;
    const n = Math.max(1, Math.floor(Math.max(Math.abs(c - a), Math.abs(dLon)) / stepDeg));
    for (let k = 0; k < n; k++) out.push([a + ((c - a) * k) / n, b + (dLon * k) / n]);
  }
  return out;
}
