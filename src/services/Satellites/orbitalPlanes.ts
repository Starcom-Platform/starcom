/**
 * The planes a constellation flies in (D-GV GV2: "faint shells at the Starlink and GPS heights, one ring per orbital
 * plane rather than per satellite").
 *
 * Satellites of one plane share an inclination and a right ascension of the ascending node, so they are grouped by
 * those, a node more than a gap apart starting a new plane. Each plane's ring is then taken from its members' own
 * motion, not from the elements: each one's position crossed with its velocity points along the plane's normal, so
 * the average of those, over a step of the catalogue's snapshots, places the ring as the satellites fly it now,
 * precession and all, in the globe's scene frame.
 *
 * That frame turns with the Earth, so a velocity read from two of its snapshots is short of the Earth's own eastward
 * motion at the point, and a plane taken from it tilts toward the pole: by about 1.5° for Starlink, and by about 12°
 * for GPS, whose satellites move slowly against a large radius. Found 24 Oct, the day the rings were drawn, by
 * running the debris lapse's model back to a breakup (debrisSpread.ts); the Earth's motion is added back here.
 */

/** How fast the Earth turns, in radians a second (sidereal). */
export const EARTH_TURN_RAD_PER_S = 7.2921159e-5;

export interface PlaneMember {
  /** Its place in the catalogue the snapshots hold. */
  index: number;
  inclinationDeg: number;
  raanDeg: number;
}

export interface PlaneGrouping {
  /** Inclinations within this share a plane, in degrees. */
  inclinationStepDeg: number;
  /** A gap in the node wider than this, in degrees, starts another plane. */
  raanGapDeg: number;
  /** A group smaller than this is not drawn: a few satellites make no plane worth a ring. */
  minMembers: number;
}

/** The catalogue's indices, one list per plane. */
export function groupPlanes(members: readonly PlaneMember[], grouping: PlaneGrouping): number[][] {
  const byInclination = new Map<number, PlaneMember[]>();
  for (const m of members) {
    if (!Number.isFinite(m.inclinationDeg) || !Number.isFinite(m.raanDeg)) continue;
    const key = Math.round(m.inclinationDeg / grouping.inclinationStepDeg);
    const list = byInclination.get(key) ?? [];
    list.push(m);
    byInclination.set(key, list);
  }
  const planes: number[][] = [];
  for (const list of byInclination.values()) {
    const sorted = [...list].sort((a, b) => a.raanDeg - b.raanDeg);
    // The node is an angle: start the walk after the widest gap, so a plane at 359° and 1° is one plane.
    const n = sorted.length;
    let start = 0;
    let widest = -1;
    for (let i = 0; i < n; i += 1) {
      const gap = n === 1 ? 360 : (sorted[(i + 1) % n].raanDeg - sorted[i].raanDeg + 360) % 360;
      if (gap > widest) { widest = gap; start = (i + 1) % n; }
    }
    let current: number[] = [];
    for (let k = 0; k < sorted.length; k += 1) {
      const m = sorted[(start + k) % sorted.length];
      const previous = k === 0 ? null : sorted[(start + k - 1) % sorted.length];
      const gap = previous ? ((m.raanDeg - previous.raanDeg) + 360) % 360 : 0;
      if (previous && gap > grouping.raanGapDeg) {
        if (current.length >= grouping.minMembers) planes.push(current);
        current = [];
      }
      current.push(m.index);
    }
    if (current.length >= grouping.minMembers) planes.push(current);
  }
  return planes;
}

/**
 * A plane's ring, `steps` points round it and back to the first, x, y, z each, from its members' positions in two
 * snapshots a step apart (x, y, z per catalogue index); null when its members do not say where it is. `frameTurnRad`
 * is how far the frame the snapshots are in turned eastward about its y axis between them: the Earth's turn over the
 * step for the globe's scene frame, 0 for a frame that does not turn.
 */
export function ringOf(
  members: readonly number[], from: ArrayLike<number>, to: ArrayLike<number>, frameTurnRad: number, steps = 128,
): number[] | null {
  let nx = 0, ny = 0, nz = 0, radius = 0, counted = 0;
  for (const i of members) {
    const px = from[i * 3], py = from[i * 3 + 1], pz = from[i * 3 + 2];
    // Its motion in space: as the snapshots have it, with the frame's own turn at the point added back (east is from
    // z toward x).
    const vx = to[i * 3] - px + frameTurnRad * pz, vy = to[i * 3 + 1] - py, vz = to[i * 3 + 2] - pz - frameTurnRad * px;
    const r = Math.hypot(px, py, pz);
    // Not propagated (put at the centre), or not moving: it says nothing of the plane.
    if (r < 1 || Math.hypot(vx, vy, vz) === 0) continue;
    const cx = py * vz - pz * vy, cy = pz * vx - px * vz, cz = px * vy - py * vx;
    const c = Math.hypot(cx, cy, cz);
    nx += cx / c; ny += cy / c; nz += cz / c;
    radius += r;
    counted += 1;
  }
  const n = Math.hypot(nx, ny, nz);
  if (counted === 0 || n === 0) return null;
  nx /= n; ny /= n; nz /= n;
  radius /= counted;
  // Two directions in the plane: any one across the normal, and the normal crossed with it.
  const ax = Math.abs(nx) < 0.9 ? 1 : 0, ay = ax ? 0 : 1;
  let ux = ny * 0 - nz * ay, uy = nz * ax - nx * 0, uz = nx * ay - ny * ax;
  const u = Math.hypot(ux, uy, uz);
  ux /= u; uy /= u; uz /= u;
  const wx = ny * uz - nz * uy, wy = nz * ux - nx * uz, wz = nx * uy - ny * ux;
  const points: number[] = [];
  for (let s = 0; s <= steps; s += 1) {
    const t = (s / steps) * Math.PI * 2;
    const c = Math.cos(t) * radius, sn = Math.sin(t) * radius;
    points.push(ux * c + wx * sn, uy * c + wy * sn, uz * c + wz * sn);
  }
  return points;
}
