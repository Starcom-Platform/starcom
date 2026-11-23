/**
 * geopack's frames, the Earth's own field and field-line tracing (space-weather-visualization.md,
 * SW4, SW13), against the values geopack's own tests record (tsssss/geopack, test_geopack1.py): at
 * 2001-01-01 02:03:04 UT, at (-5.1, 0.3, 2.8) Re GSM.
 */
import { describe, expect, it } from 'vitest';
import { dipole, geoToGsm, gsmToGeo, igrfGsm, recalc, sun, trace } from '../geopack';

const UT = Date.UTC(2001, 0, 1, 2, 3, 4) / 1000;
const R_GSM: [number, number, number] = [-5.1, 0.3, 2.8];
const close = (got: readonly number[], want: readonly number[], tolerance: number) => {
  want.forEach((w, k) => expect(Math.abs(got[k] - w), `component ${k}: ${got[k]} vs ${w}`).toBeLessThan(tolerance));
};

describe('the Sun and the frames', () => {
  it('places the Sun as geopack does: sidereal time, ecliptic longitude, right ascension, declination, obliquity', () => {
    const s = sun(UT);
    close([s.gmst, s.slong, s.srasn, s.sdec, s.obliq], [2.296253490174557, 4.899558241818756, 4.915948604659666, -0.40152585209539443, 0.4090854263337441], 1e-12);
  });

  // Within 1e-8 (6 cm at an Earth radius): the values were recorded with an earlier geopack and IGRF, and differ by 1e-9.
  it('tilts the dipole as geopack does, from IGRF for the moment', () => {
    expect(Math.abs(recalc(UT).psi - -0.53356312486214)).toBeLessThan(1e-8);
  });

  it('points the dipole\'s northern axis at the geomagnetic north pole: IGRF-14 puts it near 80.8°N 72.6°W in 2025', () => {
    const [x, y, z] = recalc(Date.UTC(2025, 0, 1) / 1000).axis;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
    expect((Math.asin(z) * 180) / Math.PI).toBeCloseTo(80.8, 0);
    expect((Math.atan2(y, x) * 180) / Math.PI).toBeCloseTo(-72.6, 0);
  });

  it('turns geographic places into GSM and back', () => {
    const frame = recalc(UT);
    close(gsmToGeo(frame, R_GSM), [2.8011944117533565, -2.4048913761357267, 4.5066403602406275], 1e-8);
    close(geoToGsm(frame, [2.8011944117533565, -2.4048913761357267, 4.5066403602406275]), R_GSM, 1e-8);
  });
});

describe('the Earth\'s own field', () => {
  it('is IGRF\'s, as geopack gives it', () => {
    close(igrfGsm(recalc(UT), ...R_GSM), [262.8292494578462, -19.305779063359893, -50.34573331501855], 1e-5);
  });

  it('is made from IGRF-14\'s coefficients read as 32-bit numbers, as geopack and the Fortran read them', () => {
    // At an epoch the coefficient is the file's: g(1,0) for 2000 is -29619.4, as a 32-bit number.
    const g10 = recalc(Date.UTC(2000, 0, 1) / 1000).g[1];
    expect(g10).toBe(Math.fround(-29619.4));
    expect(g10).not.toBe(-29619.4);
  });

  it('is the dipole\'s, for the dipole alone', () => {
    close(dipole(recalc(UT), ...R_GSM), [266.04028284777775, -20.204186166677108, -57.492114467356956], 1e-5);
  });
});

describe('a field line', () => {
  it('runs down to the ground where geopack\'s does, under T96 and IGRF', () => {
    const frame = recalc(UT);
    const line = trace(frame, R_GSM, -1, { drivers: { pdyn: 2, dst: -87, byImf: 2, bzImf: -5 }, rlim: 10, r0: 1.1 });
    // geopack's Python -0.72892109, 0.03535486, 0.82305751; its IDL DLM -0.72891962, 0.035352710, 0.82305917.
    close(line.end, [-0.7289210907095749, 0.035354863396548725, 0.8230575125223648], 1e-4);
    expect(line.reason).toBe('ground');
    // Every point it passed through, from where it started to where it ended.
    close(line.points.slice(0, 3), R_GSM, 1e-12);
    close(line.points.slice(-3), line.end, 1e-12);
  });

  it('ends on the ground, between its last two points, not inside it, as the Fortran does', () => {
    const line = trace(recalc(UT), R_GSM, -1, { drivers: { pdyn: 2, dst: -87, byImf: 2, bzImf: -5 }, rlim: 10, r0: 1.1 });
    expect(Math.abs(Math.hypot(...line.end) - 1.1)).toBeLessThan(1e-6);
  });

  it('lengthens its step after an easy one, as the Fortran does: a tail line from 10 Re to the ground in under 150 points', () => {
    const line = trace(recalc(UT), [-10, 0, 1], 1, { drivers: { pdyn: 2, dst: -87, byImf: 2, bzImf: -5 }, rlim: 60, r0: 1 });
    expect(line.reason).toBe('ground');
    expect(line.points.length / 3).toBeLessThan(150);
  });
});
