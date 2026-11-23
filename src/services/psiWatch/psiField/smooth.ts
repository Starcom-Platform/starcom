/**
 * The ψ field's smoothing over its coherence length ξ (decision D-PW, PW78): each cell the mean of the drive around it,
 * weighted by exp(−(1 − cos γ)/(ξ/R)²), nearly a Gaussian of ξ in distance, times each cell's area (cos lat). A
 * row's weights depend only on the other row and the columns between, so they are found once per row; weights under
 * exp(−12.5), about four millionths, beyond some 1,500 km, are left out.
 */
import { cellLat, EARTH_KM, PSI_CELLS, PSI_GRID, unit } from './grid';

const CUT = 12.5;
const RAD = Math.PI / 180;

interface RowKernel { rows: Int32Array; cols: Int32Array; weights: Float64Array }

const kernels = new Map<number, RowKernel[]>();

function rowKernels(xiKm: number): RowKernel[] {
  const cached = kernels.get(xiKm);
  if (cached) return cached;
  const k2 = (xiKm / EARTH_KM) ** 2;
  const { rows: R, cols: C, step } = PSI_GRID;
  const out: RowKernel[] = [];
  for (let r = 0; r < R; r++) {
    const [x0, , z0] = unit(cellLat(r), 0);
    const rows: number[] = [];
    const cols: number[] = [];
    const weights: number[] = [];
    let total = 0;
    for (let r2 = 0; r2 < R; r2++) {
      const lat2 = cellLat(r2) * RAD;
      for (let dc = -C / 2; dc < C / 2; dc++) {
        const lon2 = dc * step * RAD;
        const cos = x0 * Math.cos(lat2) * Math.cos(lon2) + z0 * Math.sin(lat2);
        const e = (1 - cos) / k2;
        if (e > CUT) continue;
        const w = Math.exp(-e) * Math.cos(lat2);
        rows.push(r2);
        cols.push(dc);
        weights.push(w);
        total += w;
      }
    }
    out.push({ rows: Int32Array.from(rows), cols: Int32Array.from(cols), weights: Float64Array.from(weights, (w) => w / total) });
  }
  kernels.set(xiKm, out);
  return out;
}

/** The field smoothed over `xiKm`. */
export function smooth(field: Float64Array, xiKm: number): Float64Array {
  const { rows: R, cols: C } = PSI_GRID;
  const kernel = rowKernels(xiKm);
  const out = new Float64Array(PSI_CELLS);
  for (let r = 0; r < R; r++) {
    const { rows, cols, weights } = kernel[r];
    for (let c = 0; c < C; c++) {
      let sum = 0;
      for (let k = 0; k < weights.length; k++) sum += weights[k] * field[rows[k] * C + ((c + cols[k] + C) % C)];
      out[r * C + c] = sum;
    }
  }
  return out;
}
