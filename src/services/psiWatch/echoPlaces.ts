/**
 * Where an Echo's events stood (decision D-PW, PW47, PW54, PW69): every return's gathering of the events lane's set,
 * on the globe at once, each return a shade older, or the one isolated alone. Three of PW54's looks: each event a
 * dot; a heat of them all, each a soft spot about two and a half degrees wide summed on a two-degree grid; or each
 * Zone filled by how many fell in it. The fourth, the archetype glyphs, waits on the Glyph Lexicon's picks.
 */
import { echoReturns, type Echo } from './timestream/echoes';
import type { EventSet } from './timestream/eventSets';

export interface EchoPoint { lat: number; lon: number; /** 1 for the newest return, falling to 0.25 for the oldest. */ newness: number }

/** Every placed event the Echo gathers, isolated to one return where one is. */
export function echoPoints(echo: Echo, set: EventSet): EchoPoint[] {
  if (!set.lat || !set.lon) return [];
  const returns = echoReturns(echo, set).filter((r) => echo.isolated === null || r.ms === echo.isolated);
  const oldest = Math.max(1, ...returns.map((r) => r.rank));
  const out: EchoPoint[] = [];
  for (const r of returns) {
    const newness = echo.isolated !== null ? 1 : 1 - 0.75 * (r.rank / oldest);
    for (let i = r.from; i < r.until; i++) out.push({ lat: set.lat[i], lon: set.lon[i], newness });
  }
  return out;
}

/** The heat's grid: two degrees, 91 rows from the south pole up, 181 columns from 180° west. */
export const HEAT_STEP = 2;
export const HEAT_ROWS = 180 / HEAT_STEP + 1;
export const HEAT_COLS = 360 / HEAT_STEP + 1;
const SIGMA_DEG = 2.5;
const REACH = Math.ceil((3 * SIGMA_DEG) / HEAT_STEP);

/**
 * Each point a soft spot, weighed by its newness, summed on the grid and scaled so the warmest fiftieth of the warm
 * cells stands at 1: one crowded place would otherwise leave every other faint.
 */
export function heatGrid(points: readonly EchoPoint[]): Float32Array {
  const grid = new Float32Array(HEAT_ROWS * HEAT_COLS);
  for (const p of points) {
    const row0 = Math.round((p.lat + 90) / HEAT_STEP);
    const col0 = Math.round((p.lon + 180) / HEAT_STEP);
    for (let dr = -REACH; dr <= REACH; dr++) {
      const row = row0 + dr;
      if (row < 0 || row >= HEAT_ROWS) continue;
      const lat = row * HEAT_STEP - 90;
      // A degree of longitude narrows towards the poles.
      const shrink = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
      const reachCols = Math.min(HEAT_COLS, Math.ceil(REACH / shrink));
      for (let dc = -reachCols; dc <= reachCols; dc++) {
        const col = (((col0 + dc) % (HEAT_COLS - 1)) + (HEAT_COLS - 1)) % (HEAT_COLS - 1);
        const dLat = lat - p.lat;
        const dLon = (((col * HEAT_STEP - 180 - p.lon + 540) % 360) - 180) * shrink;
        const d2 = dLat * dLat + dLon * dLon;
        grid[row * HEAT_COLS + col] += p.newness * Math.exp(-d2 / (2 * SIGMA_DEG * SIGMA_DEG));
      }
    }
  }
  // The last column is the first again, 180° east being 180° west.
  for (let row = 0; row < HEAT_ROWS; row++) grid[row * HEAT_COLS + HEAT_COLS - 1] = grid[row * HEAT_COLS];
  const warm = [...grid].filter((v) => v > 1e-3).sort((a, b) => a - b);
  const top = warm.length ? warm[Math.min(warm.length - 1, Math.floor(warm.length * 0.98))] : 0;
  if (top > 0) for (let i = 0; i < grid.length; i++) grid[i] = Math.min(1, grid[i] / top);
  return grid;
}

/** How many of the Echo's events fell in each Zone, and the most any holds. */
export function zoneCounts(echo: Echo, set: EventSet): { counts: Map<string, number>; most: number } {
  const counts = new Map<string, number>();
  if (!set.zone) return { counts, most: 0 };
  for (const r of echoReturns(echo, set)) {
    if (echo.isolated !== null && r.ms !== echo.isolated) continue;
    for (let i = r.from; i < r.until; i++) {
      const z = set.zone[i];
      if (z < 0) continue;
      const code = set.zones[z];
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  let most = 0;
  for (const n of counts.values()) most = Math.max(most, n);
  return { counts, most };
}
