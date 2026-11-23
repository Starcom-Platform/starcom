/**
 * T96, Tsyganenko's 1996 model of the magnetosphere's own field (space-weather-visualization.md,
 * SW4, SW13), against the model it was ported from: geopack's t96.py at 330 places and conditions
 * (t96.reference.json, made by that file), 135 of them inside the boundary layer it blends its field
 * across, and the Fortran's value its own tests record.
 */
import { describe, expect, it } from 'vitest';
import { t96, type T96Drivers } from '../t96';
import reference from './t96.reference.json';

const driversOf = ([pdyn, dst, byImf, bzImf]: number[]): T96Drivers => ({ pdyn, dst, byImf, bzImf });

describe('T96', () => {
  it('gives geopack\'s field at every place and condition its reference holds, to a millionth', () => {
    let worst = 0;
    for (const v of reference.values) {
      const b = t96(driversOf(v.parmod), v.ps, v.gsm[0], v.gsm[1], v.gsm[2]);
      const size = Math.max(1, Math.hypot(...v.b));
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(b[k] - v.b[k]) / size);
    }
    expect(worst).toBeLessThan(1e-6);
    // Inside the boundary layer too, where the field inside is blended with the IMF outside.
    expect(reference.values.filter((v) => v.layer).length).toBeGreaterThan(100);
  });

  it('gives the Fortran\'s field at the point geopack\'s tests record, within 0.002 nT', () => {
    // 2001-01-01 02:03:04 UT, tilt -0.533585131 rad, at (-5.1, 0.3, 2.8) Re GSM: Fortran 61.1784935, -1.46160448, -40.4486618.
    const b = t96({ pdyn: 2, dst: -87, byImf: 2, bzImf: -5 }, -0.533585131, -5.1, 0.3, 2.8);
    expect(Math.abs(b[0] - 61.1784935)).toBeLessThan(0.002);
    expect(Math.abs(b[1] - -1.46160448)).toBeLessThan(0.002);
    expect(Math.abs(b[2] - -40.4486618)).toBeLessThan(0.002);
  });
});
