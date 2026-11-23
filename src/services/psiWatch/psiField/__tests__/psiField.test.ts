/**
 * The ψ field's parts (decision D-PW, PW78–PW80): a feature's band is exp(−d²/2w²), e^−½ at w; a polyline is sampled
 * every half degree the short way round; a homogeneous drive a gives √(a/b), nought past 78° and where a is under
 * nought; G peaks at 1; F runs from −½ to 1 under a new moon; an eclipse's centre line on its day only; the core's
 * null-flux line traced and chained; the looks kept, never all off.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { band, cellLat, densify, PSI_CELLS, PSI_GRID } from '../grid';
import { areaBelow, meanDrive, psiAt, psiOf, structureOf, valueAt } from '../field';
import { subPoint, tidalTerm } from '../tides';
import { centralEclipseOn } from '../eclipse';
import { chain, nullFluxLines } from '../coreLine';
import { getPsiFieldLooks, resetPsiFieldLooksForTests, setPsiFieldLook } from '../psiFieldLooks';
import type { IgrfCoefficients } from '../../shield/igrfField';

const IGRF = JSON.parse(readFileSync(resolve(__dirname, '../../../../../public/data/psi-igrf14.json'), 'utf8')) as IgrfCoefficients;
const cell = (lat: number, lon: number) => ((lat - PSI_GRID.lat0) / PSI_GRID.step) * PSI_GRID.cols + (lon - PSI_GRID.lon0) / PSI_GRID.step;
const KM_PER_DEG = (6371 * Math.PI) / 180;

describe('the ψ field', () => {
  it('bands a feature as exp(−d²/2w²): 1 on it, e^−½ at w', () => {
    const w = 350;
    expect(band([[1, 1]], w)[cell(1, 1)]).toBeCloseTo(1, 6);
    // A point w due north of the cell at 1°N 31°E.
    expect(band([[1 + w / KM_PER_DEG, 31]], w)[cell(1, 31)]).toBeCloseTo(Math.exp(-0.5), 4);
    expect(band([], w).every((v) => v === 0)).toBe(true);
  });

  it('samples a polyline every half degree, the short way across the antimeridian', () => {
    expect(densify([[0, 0], [0, 2]])).toEqual([[0, 0], [0, 0.5], [0, 1], [0, 1.5]]);
    const across = densify([[10, 179], [10, -179]]);
    expect(across.map(([, lon]) => lon)).toEqual([179, 179.5, 180, 180.5]);
  });

  it('gives √(a/b) for a homogeneous drive, nought past 78° and where the drive is under nought', () => {
    const psi = psiOf(new Float64Array(PSI_CELLS).fill(0.49));
    for (let r = 0; r < PSI_GRID.rows; r++) {
      const v = psi[r * PSI_GRID.cols + 7];
      if (Math.abs(cellLat(r)) > 78) expect(v).toBe(0);
      else expect(v).toBeCloseTo(0.7, 5);
    }
    expect(psiOf(new Float64Array(PSI_CELLS).fill(-0.35)).every((v) => v === 0)).toBe(true);
    expect(psiOf(new Float64Array(PSI_CELLS).fill(0.36), undefined, 4)[cell(1, 1)]).toBeCloseTo(0.3, 5);
  });

  it('blends ā, not ψ, so the veins\' edges follow its line through nought; the cap held at −1', () => {
    const drive = new Float64Array(PSI_CELLS).fill(-0.1);
    for (let c = 0; c < PSI_GRID.cols; c++) drive[45 * PSI_GRID.cols + c] = 0.3;
    const mean = meanDrive(drive);
    expect(mean[0]).toBe(-1);
    expect(mean[89 * PSI_GRID.cols + 3]).toBe(-1);
    // A place a quarter of the way into the cell below the lit row is lit, if faintly; ψ itself would be nought there.
    const lat = cellLat(45) - 0.5;
    expect(psiAt({ mean }, lat, 0)).toBeGreaterThan(0);
    expect(psiAt({ mean }, cellLat(43), 0)).toBe(0);
  });

  it("makes G the four bands' mean over its largest", () => {
    const one = new Float64Array(PSI_CELLS);
    one[5] = 1;
    const half = new Float64Array(PSI_CELLS);
    half[5] = 0.5;
    half[6] = 0.5;
    const G = structureOf([one, half, new Float64Array(PSI_CELLS), new Float64Array(PSI_CELLS)]);
    expect(G[5]).toBe(1);
    expect(G[6]).toBeCloseTo(1 / 3, 10);
  });

  it('runs F from −½ to 1 under a new moon, with the Moon and the Sun overhead together', () => {
    // The 8 April 2024 total eclipse's greatest moment.
    const { F, moon, sun } = tidalTerm(new Date(Date.UTC(2024, 3, 8, 18, 17, 16)));
    expect(Math.max(...F)).toBeCloseTo(1, 2);
    expect(Math.min(...F)).toBeGreaterThan(-0.51);
    expect(Math.min(...F)).toBeLessThan(-0.48);
    expect(Math.hypot(moon.lat - sun.lat, moon.lon - sun.lon)).toBeLessThan(1.5);
    expect(moon.distanceKm).toBeGreaterThan(356_000);
    expect(moon.distanceKm).toBeLessThan(407_000);
  });

  it("puts the Sun overhead at the Tropic of Cancer at the June solstice's noon at Greenwich", () => {
    const sun = subPoint('Sun', new Date(Date.UTC(2026, 5, 21, 12)));
    expect(sun.lat).toBeCloseTo(23.4, 0);
    expect(Math.abs(sun.lon)).toBeLessThan(1);
  });

  it("finds a central eclipse's centre line on its day only", () => {
    const e = centralEclipseOn(Date.UTC(2024, 3, 8, 6));
    expect(e?.kind).toBe('total');
    expect(new Date(e!.peakMs).toISOString().slice(0, 16)).toBe('2024-04-08T18:17');
    // It crossed Mexico's Pacific coast near Mazatlán, 23.2°N 106.4°W.
    expect(e!.line.some(([lat, lon]) => Math.abs(lat - 23.2) < 0.6 && Math.abs(lon + 106.4) < 0.6)).toBe(true);
    expect(centralEclipseOn(Date.UTC(2024, 3, 9, 6))).toBeNull();
    // 25 March 2024's was penumbral, of the Moon; no Sun's eclipse that day.
    expect(centralEclipseOn(Date.UTC(2024, 2, 25, 6))).toBeNull();
  });

  it("chains marching squares' segments into lines, closed ones ending where they began, across the antimeridian", () => {
    const loop = chain([[[0, 0], [0, 1]], [[1, 1], [1, 0]], [[0, 1], [1, 1]], [[1, 0], [0, 0]]]);
    expect(loop).toHaveLength(1);
    expect(loop[0]).toHaveLength(5);
    expect(loop[0][0]).toEqual(loop[0][4]);
    const open = chain([[[5, 179.5], [5, 180.5]], [[5, -179.5], [6, -179]]]);
    expect(open).toEqual([[[5, 179.5], [5, -179.5], [6, -179]]]);
  });

  it("traces the core's null-flux lines at 3,485 km, its long line round the core and no piece under nine places", () => {
    const lines = nullFluxLines(IGRF as never, 2025.5);
    expect(lines.length).toBeGreaterThan(3);
    expect(Math.max(...lines.map((l) => l.length))).toBeGreaterThan(1000);
    expect(lines.every((l) => l.length >= 9)).toBe(true);
  });

  it('reads a value at a place between cells and round the antimeridian, and the share of the globe below it', () => {
    const grid = new Float32Array(PSI_CELLS);
    grid[cell(1, 179)] = 1;
    expect(valueAt(grid, 1, 179)).toBeCloseTo(1, 6);
    expect(valueAt(grid, 1, 180)).toBeCloseTo(0.5, 6);
    expect(valueAt(grid, 2, 179)).toBeCloseTo(0.5, 6);
    expect(areaBelow(new Float32Array(PSI_CELLS).fill(0.2), 0.3)).toBeCloseTo(1, 10);
    expect(areaBelow(new Float32Array(PSI_CELLS).fill(0.2), 0.1)).toBe(0);
  });
});

describe('the looks', () => {
  beforeEach(() => { localStorage.clear(); resetPsiFieldLooksForTests(); });

  it('starts with heat and contours, keeps a choice, and never turns the last one off', () => {
    expect(getPsiFieldLooks()).toEqual({ heat: true, contours: true, relief: false, flow: false });
    setPsiFieldLook('relief', true);
    setPsiFieldLook('heat', false);
    setPsiFieldLook('contours', false);
    expect(getPsiFieldLooks()).toEqual({ heat: false, contours: false, relief: true, flow: false });
    setPsiFieldLook('relief', false);
    expect(getPsiFieldLooks().relief).toBe(true);
    resetPsiFieldLooksForTests();
    expect(getPsiFieldLooks()).toEqual({ heat: false, contours: false, relief: true, flow: false });
  });
});
