/**
 * How each debris cloud spread from its breakup, modelled (D-GV GV2, step 6; the owner chose a modelled spread,
 * 2026-10-24).
 *
 * Today's elements run back fifteen to nineteen years through SGP4 say nothing true: the drag each piece met over
 * those years is unknown. What can be said is how its orbit's plane has turned. The Earth's oblateness (J2) turns
 * every plane about the pole at a rate set by the orbit's size, shape and tilt, and the pieces of one breakup were
 * thrown into slightly different orbits, so their planes turned apart: one plane at the breakup, a shell today.
 *
 * So each piece is drawn where it is today, turned about the pole by how far its plane has turned since, relative to
 * its cloud's median: the cloud's common drift is set aside, and what is left is the spread. What is not modelled,
 * and is said beside the lapse: drag, which shrank the orbits and so changed the rates, and where each piece was
 * along its orbit.
 */

/** The Earth's second zonal harmonic: how oblate it is, as SGP4 takes it (WGS-72). */
export const J2 = 1.082616e-3;
export const EARTH_EQUATORIAL_RADIUS_KM = 6378.135;
export const MU_KM3_S2 = 398600.8;
const DAY_S = 86_400;
export const DAY_MS = DAY_S * 1000;

/**
 * How fast an orbit's node turns, in radians a day (eastward positive), from its mean motion in revolutions a day,
 * its eccentricity and its inclination: J2 alone. About −5° a day for the ISS; about +1° a day for a polar orbit
 * near 850 km, which is why such orbits keep their angle to the Sun.
 */
export function nodalRateRadPerDay(meanMotionRevPerDay: number, eccentricity: number, inclinationDeg: number): number {
  const n = (meanMotionRevPerDay * 2 * Math.PI) / DAY_S;
  const a = Math.cbrt(MU_KM3_S2 / (n * n));
  const p = a * (1 - eccentricity * eccentricity);
  return -1.5 * n * J2 * (EARTH_EQUATORIAL_RADIUS_KM / p) ** 2 * Math.cos((inclinationDeg * Math.PI) / 180) * DAY_S;
}

export interface SpreadPiece {
  /** Its place in the catalogue the snapshots hold. */
  index: number;
  /** Which cloud: its breakup is when the lapse first draws it. */
  cloud: string;
  meanMotionRevPerDay: number;
  eccentricity: number;
  inclinationDeg: number;
}

export interface SpreadTurn {
  index: number;
  /** How fast its plane turns against its cloud's median, in radians a day. */
  relRateRadPerDay: number;
  /** Its cloud's breakup, in ms since the epoch: before it, the piece did not exist. */
  bornMs: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Each readable piece's turn against its cloud's median; a piece whose elements do not read is left out. */
export function spreadOf(pieces: readonly SpreadPiece[], bornMsOf: (cloud: string) => number | undefined): SpreadTurn[] {
  const byCloud = new Map<string, Array<{ index: number; rate: number }>>();
  for (const piece of pieces) {
    const rate = nodalRateRadPerDay(piece.meanMotionRevPerDay, piece.eccentricity, piece.inclinationDeg);
    if (!Number.isFinite(rate) || bornMsOf(piece.cloud) === undefined) continue;
    const list = byCloud.get(piece.cloud) ?? [];
    list.push({ index: piece.index, rate });
    byCloud.set(piece.cloud, list);
  }
  const turns: SpreadTurn[] = [];
  for (const [cloud, list] of byCloud) {
    const common = median(list.map((piece) => piece.rate));
    const bornMs = bornMsOf(cloud) as number;
    for (const piece of list) turns.push({ index: piece.index, relRateRadPerDay: piece.rate - common, bornMs });
  }
  return turns;
}

/**
 * A piece's place `daysBack` before now, by its plane alone: today's position (x, y, z in the globe's scene frame,
 * y to the north pole) turned about the pole by how far its plane has turned since, written into `out` at `offset`.
 */
export function turnBack(
  x: number, y: number, z: number, relRateRadPerDay: number, daysBack: number, out: Float32Array, offset: number,
): void {
  // Its node then, against now: eastward positive, as longitude runs from z toward x in this frame.
  const turn = -relRateRadPerDay * daysBack;
  const c = Math.cos(turn), s = Math.sin(turn);
  out[offset] = x * c + z * s;
  out[offset + 1] = y;
  out[offset + 2] = z * c - x * s;
}
