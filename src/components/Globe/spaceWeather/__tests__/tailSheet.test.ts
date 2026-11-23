/**
 * The magnetotail's current sheet (space-weather-visualization.md, SW5): where T96's Bx turns from
 * earthward to tailward down the night side, inside its magnetopause, bent by the dipole's tilt.
 */
import { describe, expect, it } from 'vitest';
import { findSheetZ, insideMagnetopause, traceTailSheet, SHEET_GRID } from '../tailSheet';

const UT = Date.UTC(2026, 9, 10, 12) / 1000;
const DRIVERS = { pdyn: 2, dst: -20, byImf: 0, bzImf: -2 };
const at = (sheet: ReturnType<typeof traceTailSheet>, x: number, y: number) => {
  const i = sheet.xs.indexOf(x), j = sheet.ys.indexOf(y);
  return { z: sheet.z[j * sheet.xs.length + i], lobe: sheet.lobe[j * sheet.xs.length + i] };
};

describe('finding the sheet in a column', () => {
  it('is where Bx turns from tailward below to earthward above, and nowhere where it does not turn', () => {
    expect(findSheetZ((z) => z - 1.5)).toBeCloseTo(1.5, 3);
    expect(findSheetZ(() => 5)).toBeNull();
    expect(findSheetZ(() => -5)).toBeNull();
    // Turning the other way, earthward below: not the tail's sheet.
    expect(findSheetZ((z) => 1.5 - z)).toBeNull();
  });
});

describe('the tail\'s current sheet', () => {
  const flat = traceTailSheet({ ut: UT, drivers: DRIVERS, psi: 0 });

  it('lies on a grid down the tail and across it', () => {
    expect(flat.xs[0]).toBe(SHEET_GRID.x.from);
    expect(flat.xs[flat.xs.length - 1]).toBe(SHEET_GRID.x.to);
    expect(flat.ys).toHaveLength(17);
    expect(flat.z).toHaveLength(flat.xs.length * flat.ys.length);
  });

  it('crosses midnight on the equator when the dipole is not tilted', () => {
    expect(Math.abs(at(flat, -20, 0).z)).toBeLessThan(0.3);
    expect(Math.abs(at(flat, -40, 0).z)).toBeLessThan(0.3);
  });

  it('is bent one way by a tilt and the other by the opposite tilt', () => {
    const toward = traceTailSheet({ ut: UT, drivers: DRIVERS, psi: 0.4 });
    const away = traceTailSheet({ ut: UT, drivers: DRIVERS, psi: -0.4 });
    const z1 = at(toward, -30, 0).z, z2 = at(away, -30, 0).z;
    expect(Math.abs(z1)).toBeGreaterThan(1);
    expect(Math.sign(z1)).toBe(-Math.sign(z2));
    expect(Math.abs(z1 + z2)).toBeLessThan(0.3);
  });

  it('carries more current near the Earth, where the lobes\' field is stronger', () => {
    expect(at(flat, -10, 0).lobe).toBeGreaterThan(at(flat, -40, 0).lobe);
    expect(at(flat, -40, 0).lobe).toBeGreaterThan(5);
  });

  it('is none outside the magnetopause', () => {
    expect(insideMagnetopause(2, -20, 0, 0)).toBe(true);
    expect(insideMagnetopause(2, -20, 40, 0)).toBe(false);
    // At 10 nPa the magnetopause is pressed in to about 22 Re across the tail at 30 Re back.
    expect(insideMagnetopause(10, -30, 0, 21)).toBe(true);
    expect(insideMagnetopause(10, -30, 0, 26)).toBe(false);
  });
});
