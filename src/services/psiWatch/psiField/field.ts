/**
 * The ψ field (decision D-PW, PW57, PW78–PW80): the experiment's steady state, ported. The drive
 *   a = a0 + G + 0.45·G·F + 0.8·S
 * on the 2° grid, G Earth's structure (the mean of four 350 km bands: the geoid's persistence ridges and valleys, the
 * spreading ridges, the core's null-flux line for the year drawn, the coasts; over its largest), F the Moon's and the
 * Sun's tidal term at the moment, S an eclipse's centre line on its day. The drive smoothed over ξ = 300 km is ā, and
 * ψ = √(max(ā, 0)/b), the cells past 78° left at nought, as the experiment leaves them. Also ψ without the tides
 * (the same with F at nought), for the flow look.
 */
import type { IgrfCoefficients } from '../shield/igrfField';
import { band, cellLat, PSI_CELLS, PSI_GRID } from './grid';
import { coreBand } from './coreLine';
import { tidalTerm, type SubPoint } from './tides';
import { centralEclipseOn, type CentralEclipse } from './eclipse';
import { smooth } from './smooth';

/** The experiment's own weights (PW79). */
export const PSI_WEIGHTS = { a0: -0.35, G: 1, GF: 0.45, S: 0.8, b: 1 } as const;
export const PSI_BAND_KM = 350;
export const PSI_XI_KM = 300;
export const PSI_ECLIPSE_KM = 150;
export const PSI_POLAR_CAP = 78;
export const PSI_BASE_URL = '/data/psi-base.json';

/** `public/data/psi-base.json`: three of G's bands, baked (`npm run data:psi-base`), and the geoid's arcs. */
export interface PsiBase {
  sources: Array<{ name: string; url: string; licence: string }>;
  grid: typeof PSI_GRID;
  bandKm: number;
  bands: { geoid: number[]; spreading: number[]; coasts: number[] };
  arcs: { ridges: Array<[number, Array<[number, number]>]>; valleys: Array<[number, Array<[number, number]>]> };
}

export interface PsiFieldInputs { base: PsiBase; igrf: IgrfCoefficients }

export interface PsiFieldAt {
  timeMs: number;
  /** The year the core's line is drawn for. */
  year: number;
  /** ψ per cell, rows south to north. */
  psi: Float32Array;
  /** ψ with F at nought: the field without the tides. */
  calm: Float32Array;
  /**
   * ā per cell, the cells past the polar cap at −1: what the shell blends between cells, so ψ's edge follows ā's own
   * line through nought rather than the cells' (ψ itself is nought on whole cells, and blended it would step).
   */
  mean: Float32Array;
  /** The same without the tides. */
  calmMean: Float32Array;
  /** G per cell, 0 to 1. */
  structure: Float32Array;
  /** The core's null-flux lines for the year. */
  coreLines: Array<Array<[number, number]>>;
  moon: SubPoint;
  sun: SubPoint;
  /** The central eclipse on the moment's UTC day, if any. */
  eclipse: CentralEclipse | null;
}

/** G: the four bands' mean, over its largest. */
export function structureOf(bands: ReadonlyArray<ArrayLike<number>>): Float64Array {
  const G = new Float64Array(PSI_CELLS);
  for (const b of bands) for (let i = 0; i < PSI_CELLS; i++) G[i] += b[i] / bands.length;
  let most = 0;
  for (let i = 0; i < PSI_CELLS; i++) most = Math.max(most, G[i]);
  if (most > 0) for (let i = 0; i < PSI_CELLS; i++) G[i] /= most;
  return G;
}

/** ā: the drive smoothed over ξ, the cells past the polar cap at −1, so ψ is nought there however it is blended. */
export function meanDrive(drive: Float64Array, xiKm = PSI_XI_KM): Float32Array {
  const mean = Float32Array.from(smooth(drive, xiKm));
  for (let r = 0; r < PSI_GRID.rows; r++) {
    if (Math.abs(cellLat(r)) > PSI_POLAR_CAP) mean.fill(-1, r * PSI_GRID.cols, (r + 1) * PSI_GRID.cols);
  }
  return mean;
}

/** ψ from ā: √(max(ā, 0)/b). */
export function psiFrom(mean: ArrayLike<number>, b: number = PSI_WEIGHTS.b): Float32Array {
  return Float32Array.from(mean, (v) => Math.sqrt(Math.max(v, 0) / b));
}

/** ψ from a drive: smoothed over ξ, √(max(ā, 0)/b), nought past the polar cap. */
export function psiOf(drive: Float64Array, xiKm = PSI_XI_KM, b: number = PSI_WEIGHTS.b): Float32Array {
  return psiFrom(meanDrive(drive, xiKm), b);
}

/** ψ at a place, from ā blended between the cells round it, as the shell draws it. */
export const psiAt = (field: Pick<PsiFieldAt, 'mean'>, lat: number, lon: number, b: number = PSI_WEIGHTS.b): number =>
  Math.sqrt(Math.max(valueAt(field.mean, lat, lon), 0) / b);

const byYear = new Map<number, { G: Float64Array; lines: Array<Array<[number, number]>> }>();
const byDay = new Map<number, { eclipse: CentralEclipse | null; S: Float64Array | null }>();

/** Forgets what was computed (a test's fresh start). */
export function resetPsiFieldForTests(): void { byYear.clear(); byDay.clear(); }

function keep<K, V>(map: Map<K, V>, key: K, value: V, size: number): V {
  map.set(key, value);
  while (map.size > size) map.delete(map.keys().next().value as K);
  return value;
}

/** ψ at a moment, the core's line for a whole `year` (1900–2030), at mid-year as the magnetic shield draws it. */
export function psiFieldAt(inputs: PsiFieldInputs, timeMs: number, year: number): PsiFieldAt {
  const w = PSI_WEIGHTS;
  const { G, lines } = byYear.get(year) ?? keep(byYear, year, (() => {
    const core = coreBand(inputs.igrf, year + 0.5, PSI_BAND_KM);
    const { geoid, spreading, coasts } = inputs.base.bands;
    return { G: structureOf([geoid, spreading, core.band, coasts]), lines: core.lines };
  })(), 3);
  const day = Math.floor(timeMs / 86_400_000);
  const { eclipse, S } = byDay.get(day) ?? keep(byDay, day, (() => {
    const found = centralEclipseOn(timeMs);
    return { eclipse: found, S: found ? band(found.line, PSI_ECLIPSE_KM) : null };
  })(), 4);
  const { F, moon, sun } = tidalTerm(new Date(timeMs));
  const drive = new Float64Array(PSI_CELLS);
  const calmDrive = new Float64Array(PSI_CELLS);
  for (let i = 0; i < PSI_CELLS; i++) {
    const still = w.a0 + w.G * G[i] + (S ? w.S * S[i] : 0);
    calmDrive[i] = still;
    drive[i] = still + w.GF * G[i] * F[i];
  }
  const mean = meanDrive(drive);
  const calmMean = meanDrive(calmDrive);
  return {
    timeMs, year, psi: psiFrom(mean), calm: psiFrom(calmMean), mean, calmMean, structure: Float32Array.from(G),
    coreLines: lines, moon, sun, eclipse,
  };
}

/** A grid's value at a place, blended between the four cells round it, as the shell blends them; round the antimeridian. */
export function valueAt(values: ArrayLike<number>, lat: number, lon: number): number {
  const { lat0, lon0, step, rows, cols } = PSI_GRID;
  const y = Math.max(0, Math.min(rows - 1, (lat - lat0) / step));
  const x = (((lon - lon0) / step) % cols + cols) % cols;
  const r0 = Math.min(rows - 2, Math.floor(y));
  const c0 = Math.floor(x);
  const c1 = (c0 + 1) % cols;
  const ty = y - r0;
  const tx = x - c0;
  const at = (r: number, c: number) => values[r * cols + c];
  return (at(r0, c0) * (1 - tx) + at(r0, c1) * tx) * (1 - ty) + (at(r0 + 1, c0) * (1 - tx) + at(r0 + 1, c1) * tx) * ty;
}

/** The share of the globe's area where ψ is below a value, 0 to 1. */
export function areaBelow(psi: ArrayLike<number>, value: number): number {
  let below = 0;
  let total = 0;
  for (let r = 0; r < PSI_GRID.rows; r++) {
    const area = Math.cos((cellLat(r) * Math.PI) / 180);
    for (let c = 0; c < PSI_GRID.cols; c++) {
      total += area;
      if (psi[r * PSI_GRID.cols + c] < value) below += area;
    }
  }
  return below / total;
}
