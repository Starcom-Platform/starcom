/**
 * The solar wind streaming past the magnetosphere (record
 * docs/missions/01-architecture-decisions/space-weather-visualization.md, SW6, SW17).
 *
 * Near the Earth the wind parts round the magnetosphere. Its flow is drawn as potential flow past a
 * Rankine half-body: a uniform stream from the Sun (along -x, GSM) and a point source at the Earth,
 * whose dividing surface stands off at T96's magnetopause nose and opens to twice that far down the
 * tail, near T96's own tail. The real flow is slowed and heated behind the bow shock; this one is not,
 * so between the bow shock (taken as the half-body 1.3 times as large) and the magnetopause the
 * particles are brightened to say they are in the magnetosheath. The flow's shape is a model; its speed
 * and the IMF's polarity are the wind measured now.
 *
 * Positions in Earth radii, GSM; velocities as a share of the free stream's.
 */

/** The free stream, and the source that stands the dividing surface off at `standoffRe`: m = 4π U a². */
function sourceStrength(standoffRe: number): number {
  return 4 * Math.PI * standoffRe * standoffRe;
}

/** The flow's velocity at a place, as a share of the free stream's: from the Sun (-x), parting round the half-body. */
export function flowVelocity([x, y, z]: readonly number[], standoffRe: number): [number, number, number] {
  const r2 = x * x + y * y + z * z;
  const r = Math.sqrt(r2);
  const k = sourceStrength(standoffRe) / (4 * Math.PI * r2 * r);
  return [-1 + k * x, k * y, k * z];
}

/**
 * The half-body's surface: its radius from the x axis at `x`, Re (none ahead of its nose). The dividing
 * stream surface of a uniform flow and a point source: ρ² = 2a² (1 + cos θ), with a the standoff and θ
 * measured from the downstream axis (-x), so cos θ = -x / r; solved for ρ at the given x.
 */
export function surfaceRadiusAt(x: number, standoffRe: number): number | null {
  if (x > standoffRe) return null;
  const a2 = standoffRe * standoffRe;
  // ρ² = 2a²(1 - x / sqrt(x² + ρ²)): bisect for ρ.
  let lo = 0, hi = 2 * standoffRe;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    const f = mid * mid - 2 * a2 * (1 - x / Math.sqrt(x * x + mid * mid));
    if (f > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Whether a place is inside the half-body scaled by `scale` (the magnetopause at 1, the bow shock at 1.3). */
export function insideHalfBody([x, y, z]: readonly number[], standoffRe: number, scale = 1): boolean {
  const rho = surfaceRadiusAt(x, standoffRe * scale);
  return rho !== null && Math.hypot(y, z) < rho;
}

/** How far upstream particles start, and how far down the tail and out they are followed, Re. */
export const FLOW_BOX = { upstream: 30, tail: -60, out: 45 };

/**
 * A streamline from `start`, a place every `stepRe` Earth radii of free-stream travel (midpoint
 * steps), until it leaves the box down the tail or out to the side.
 */
export function streamline(start: readonly number[], standoffRe: number, stepRe = 0.5): number[] {
  const points: number[] = [...start];
  let [x, y, z] = start;
  for (let k = 0; k < 400; k++) {
    const [vx, vy, vz] = flowVelocity([x, y, z], standoffRe);
    const [mx, my, mz] = flowVelocity([x + vx * stepRe / 2, y + vy * stepRe / 2, z + vz * stepRe / 2], standoffRe);
    x += mx * stepRe; y += my * stepRe; z += mz * stepRe;
    points.push(x, y, z);
    if (x < FLOW_BOX.tail || Math.hypot(y, z) > FLOW_BOX.out) break;
  }
  return points;
}

const hash = (n: number) => {
  const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** Starting places across the upstream disc, spread evenly, the same each time for the same count. */
export function flowStarts(count: number): number[][] {
  return Array.from({ length: count }, (_, k) => {
    const r = FLOW_BOX.out * 0.95 * Math.sqrt(hash(k));
    const a = 2 * Math.PI * hash(k + 0.37);
    return [FLOW_BOX.upstream, r * Math.cos(a), r * Math.sin(a)];
  });
}
