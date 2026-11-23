/**
 * Reading a gridded field at any place on Earth (decision D-W, WX1).
 *
 * The heat map's shader blends the grid's values smoothly; the hover reads
 * the number under the pointer from the same grid, blended the same way,
 * so the colour and the number agree.
 */
import type { LatLonGrid } from './grib2';

export interface GriddedValues {
  grid: LatLonGrid;
  /** Row by row from the north, west to east. */
  values: Float32Array;
}

/**
 * The field's value at a place: the four grid points around it blended by
 * distance. Longitude wraps (359° blends into 0°; −60° is 300°); latitude
 * holds at the poles. Null for a place that is not a number.
 */
export function valueAt(field: GriddedValues, lat: number, lon: number): number | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const { ni, nj, la1, lo1, di, dj } = field.grid;
  const row = Math.min(Math.max((la1 - lat) / dj, 0), nj - 1);
  const col = ((((lon - lo1) / di) % ni) + ni) % ni;
  const j0 = Math.floor(row), j1 = Math.min(j0 + 1, nj - 1), fj = row - j0;
  const i0 = Math.floor(col), i1 = (i0 + 1) % ni, fi = col - i0;
  const v = field.values;
  const top = v[j0 * ni + i0] * (1 - fi) + v[j0 * ni + i1] * fi;
  const bottom = v[j1 * ni + i0] * (1 - fi) + v[j1 * ni + i1] * fi;
  return top * (1 - fj) + bottom * fj;
}
