/**
 * The tail's current sheet drawn (space-weather-visualization.md, SW5): brighter with the lobes'
 * field, soft at its edges, a surface only where the sheet was found, in the globe's own frame.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cellsFromEdge, createTailSheetMesh, sheetBrightness } from '../tailSheetMesh';
import { gsmToScene } from '../fieldLines';
import { recalc } from '../../../../services/spaceWeather/geopack/geopack';

const N = NaN;
// Five columns down the tail, four rows across; one cell with no sheet.
const SHEET = {
  xs: [-8, -10, -12, -14, -16],
  ys: [-2, 0, 2, 4],
  z: new Float32Array([0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.3, 0, 0, 0.1, N, 0.3, 0, 0, 0, 0, 0, 0]),
  lobe: new Float32Array(20).fill(30),
};

describe('the sheet\'s brightness', () => {
  it('follows the lobes\' field, full from 30 nT, a glimmer at least', () => {
    expect(sheetBrightness(30)).toBe(1);
    expect(sheetBrightness(80)).toBe(1);
    expect(sheetBrightness(15)).toBe(0.5);
    expect(sheetBrightness(1)).toBe(0.15);
  });

  it('fades in from its edges: the grid\'s, and any cell with no sheet', () => {
    const d = cellsFromEdge(SHEET);
    expect(d[0]).toBe(0);
    // Next to the missing cell (column 2, row 2), but not on the grid's edge.
    expect(d[1 * 5 + 1]).toBe(0);
    expect(d[2 * 5 + 2]).toBe(0);
  });
});

describe('the sheet drawn', () => {
  it('is a surface only where all four corners of a cell have the sheet, placed in the globe\'s frame, as added light', () => {
    const frame = recalc(Date.UTC(2026, 9, 10, 12) / 1000);
    const sheet = createTailSheetMesh(SHEET, frame, '#D9D2FF');
    const geometry = sheet.object.geometry;
    // 4 x 3 cells, less the four round the missing point.
    expect(geometry.getIndex()!.count / 6).toBe(12 - 4);
    const p = geometry.getAttribute('position');
    const want = gsmToScene(frame, [-12, 0, 0.2]);
    expect(Math.hypot(p.getX(7) - want[0], p.getY(7) - want[1], p.getZ(7) - want[2])).toBeLessThan(1e-3);
    const material = sheet.object.material as THREE.ShaderMaterial;
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.side).toBe(THREE.DoubleSide);
    sheet.setTime(3700);
    expect(material.uniforms.time.value).toBe(100);
    sheet.dispose();
  });
});
