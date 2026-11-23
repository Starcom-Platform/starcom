/**
 * Isolines on a latitude–longitude grid by marching squares (decision D-PW, PW58): each cell's corners against a
 * level, each crossing placed by linear interpolation along its edge, the segments returned as pairs of places. The
 * grid wraps in longitude; an ambiguous saddle is split by the cell's mean, as is usual.
 */

export interface LatLonGrid {
  /** Rows south to north, columns west to east: `values[row * cols + col]`. */
  values: Float64Array;
  rows: number;
  cols: number;
  lat0: number;
  lon0: number;
  step: number;
}

export type Segment = [[number, number], [number, number]];

/** Every segment where the grid crosses `level`, as [lat, lon] pairs. */
export function isolines(grid: LatLonGrid, level: number): Segment[] {
  const { values, rows, cols, lat0, lon0, step } = grid;
  const at = (r: number, c: number) => values[r * cols + ((c + cols) % cols)];
  const place = (r: number, c: number): [number, number] => [lat0 + r * step, lon0 + c * step];
  const cross = (r0: number, c0: number, r1: number, c1: number): [number, number] => {
    const a = at(r0, c0);
    const b = at(r1, c1);
    const t = a === b ? 0.5 : (level - a) / (b - a);
    const [la, lo] = place(r0, c0);
    const [lb, lob] = place(r1, c1);
    return [la + (lb - la) * t, lo + (lob - lo) * t];
  };
  const out: Segment[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols; c++) {
      // Corners: 0 south-west, 1 south-east, 2 north-east, 3 north-west.
      const v = [at(r, c), at(r, c + 1), at(r + 1, c + 1), at(r + 1, c)];
      const code = (v[0] > level ? 1 : 0) | (v[1] > level ? 2 : 0) | (v[2] > level ? 4 : 0) | (v[3] > level ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const south = () => cross(r, c, r, c + 1);
      const east = () => cross(r, c + 1, r + 1, c + 1);
      const north = () => cross(r + 1, c, r + 1, c + 1);
      const west = () => cross(r, c, r + 1, c);
      const mean = (v[0] + v[1] + v[2] + v[3]) / 4;
      switch (code) {
        case 1: case 14: out.push([south(), west()]); break;
        case 2: case 13: out.push([south(), east()]); break;
        case 3: case 12: out.push([west(), east()]); break;
        case 4: case 11: out.push([east(), north()]); break;
        case 6: case 9: out.push([south(), north()]); break;
        case 7: case 8: out.push([west(), north()]); break;
        case 5: if (mean > level) out.push([south(), east()], [west(), north()]); else out.push([south(), west()], [east(), north()]); break;
        case 10: if (mean > level) out.push([south(), west()], [east(), north()]); else out.push([south(), east()], [west(), north()]); break;
        default: break;
      }
    }
  }
  return out;
}
