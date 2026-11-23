/**
 * Psi Watch's magnetic shield (decision D-PW, PW7, PW58): IGRF-14 as baked, read the way the file says; the field
 * synthesised as IGRF's own program does it; the dip poles where NOAA puts them; the South Atlantic Anomaly where it
 * lies; the isolines drawn around the grid and across the antimeridian; the cursor held to IGRF-14's span.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coefficientsAt, fieldAt, readCoefficients, strengthAndDip } from '../shield/igrfField';
import { isolines, type LatLonGrid } from '../shield/isolines';
import { ANOMALY_NT, decimalYear, poleAt, poleSpeedKm, shieldAt, type PoleTrack, type ShieldData } from '../shield/shield';
import { shieldYear } from '../shield/useShield';
import { IGRF14, IGRF14_EPOCHS } from '../../spaceWeather/geopack/igrf14';

const DATA: ShieldData = JSON.parse(readFileSync(resolve(__dirname, '../../../../public/data/psi-igrf14.json'), 'utf8'));
const horizontal = (year: number, lat: number, lon: number) => {
  const f = fieldAt(coefficientsAt(DATA, year), lat, lon);
  return Math.hypot(f.x, f.y);
};

describe('IGRF-14 as baked', () => {
  it('holds every epoch from 1900 to 2025 and all 195 terms to degree 13', () => {
    expect(DATA.epochs).toEqual(Array.from({ length: 26 }, (_, i) => 1900 + 5 * i));
    expect(DATA.terms).toHaveLength(195);
  });

  it("agrees with geopack's own table, term for term, from 2000", () => {
    const from = DATA.epochs.indexOf(IGRF14_EPOCHS[0]);
    for (const [gh, n, m, values, sv] of IGRF14) {
      const term = DATA.terms.find(([g, nn, mm]) => g === gh && nn === n && mm === m)!;
      expect(term[3].slice(from)).toEqual([...values]);
      expect(term[4]).toBe(sv);
    }
  });

  it("reads the file's header and refuses another", () => {
    const text = 'c/s deg ord IGRF IGRF SV\ng/h n m 2020.0 2025.0 2025-30\ng 1 0 -29403.4 -29350.0 12.6\nh 1 1 4653.4 4545.5 -21.5\n';
    expect(readCoefficients(text)).toEqual({ epochs: [2020, 2025], terms: [['g', 1, 0, [-29403.4, -29350], 12.6], ['h', 1, 1, [4653.4, 4545.5], -21.5]] });
    expect(() => readCoefficients('nothing here')).toThrow(/g\/h n m/);
  });
});

describe('the field', () => {
  it('stands near 22,000 nT at its weakest, over South America, and near 66,000 nT south of Australia (2025)', () => {
    const c = coefficientsAt(DATA, 2025);
    expect(strengthAndDip(fieldAt(c, -26.3, -60.1)).total).toBeGreaterThan(21_500);
    expect(strengthAndDip(fieldAt(c, -26.3, -60.1)).total).toBeLessThan(22_500);
    expect(strengthAndDip(fieldAt(c, -64, 138)).total).toBeGreaterThan(62_000);
  });

  it('dips down in the north and up in the south', () => {
    const c = coefficientsAt(DATA, 2025);
    expect(strengthAndDip(fieldAt(c, 50, 0)).dip).toBeGreaterThan(60);
    expect(strengthAndDip(fieldAt(c, -50, 140)).dip).toBeLessThan(-60);
  });

  it('carries on past 2025 by the secular variation, and holds at 2030', () => {
    const g10 = (year: number) => coefficientsAt(DATA, year).g[1][0];
    expect(g10(2027)).toBeCloseTo(-29350 + 12.6 * 2, 6);
    expect(g10(2035)).toBeCloseTo(g10(2030), 6);
  });
});

describe('the dip poles', () => {
  // NOAA's published positions for 2025 (WMM2025), a sibling model: IGRF-14 agrees to a few hundredths of a degree
  // of latitude, a little more of longitude this close to the poles.
  it('stand where NOAA puts them in 2025', () => {
    const north = poleAt(DATA.poles.north, 2025);
    const south = poleAt(DATA.poles.south, 2025);
    expect(Math.abs(north.lat - 85.762)).toBeLessThan(0.1);
    expect(Math.abs(north.lon - 139.298)).toBeLessThan(1.5);
    expect(Math.abs(south.lat - -63.851)).toBeLessThan(0.1);
    expect(Math.abs(south.lon - 135.756)).toBeLessThan(1.5);
  });

  it('are where the field stands vertical, every year of both tracks', () => {
    for (const track of [DATA.poles.north, DATA.poles.south]) {
      expect(track).toHaveLength(131);
      for (const [year, lat, lon] of track) expect(horizontal(year, lat, lon)).toBeLessThan(5);
    }
  });

  it('began in the Canadian Arctic in 1900 and has crossed toward Siberia, fastest around 2000', () => {
    const [, lat1900, lon1900] = DATA.poles.north[0];
    expect(lat1900).toBeCloseTo(70.5, 0);
    expect(lon1900).toBeCloseTo(-96.2, 0);
    expect(poleAt(DATA.poles.north, 2025).lon).toBeGreaterThan(100);
    expect(poleSpeedKm(DATA.poles.north, 2000)).toBeGreaterThan(45);
    expect(poleSpeedKm(DATA.poles.north, 1920)).toBeLessThan(15);
  });

  it('move between their yearly points the short way across the antimeridian', () => {
    const track: PoleTrack = [[2000, 80, 175], [2001, 81, -175]];
    const half = poleAt(track, 2000.5);
    expect(half.lat).toBe(80.5);
    expect(Math.abs(half.lon)).toBe(180);
    expect(poleAt(track, 1990)).toEqual({ lat: 80, lon: 175 });
    expect(poleAt(track, 2010)).toEqual({ lat: 81, lon: -175 });
  });
});

describe('the shield at a year', () => {
  const shield = shieldAt(DATA, 2025.5);

  it('finds the weakest field inside the South Atlantic Anomaly, over Paraguay', () => {
    expect(shield.weakest.lat).toBeGreaterThan(-30);
    expect(shield.weakest.lat).toBeLessThan(-22);
    expect(shield.weakest.lon).toBeGreaterThan(-65);
    expect(shield.weakest.lon).toBeLessThan(-55);
    expect(shield.weakest.total).toBeLessThan(ANOMALY_NT);
  });

  it("outlines the anomaly from the Pacific off Chile to Africa, and draws the dip equator round the world", () => {
    const lons = shield.anomaly.flat().map(([, lon]) => lon);
    expect(Math.min(...lons)).toBeLessThan(-90);
    expect(Math.max(...lons)).toBeGreaterThan(10);
    const equatorLats = shield.dipEquator.flat().map(([lat]) => lat);
    expect(Math.max(...equatorLats.map(Math.abs))).toBeLessThan(20);
    expect(new Set(shield.dipEquator.flat().map(([, lon]) => Math.floor(((lon + 180) % 360) / 30))).size).toBe(12);
  });

  it('draws every strength level the field reaches, and none it does not', () => {
    for (const { level, segments } of shield.strength) expect(segments.length > 0).toBe(level > shield.weakest.total && level < 67_000);
  });
});

describe('isolines', () => {
  const grid = (f: (lat: number, lon: number) => number, step = 2): LatLonGrid => {
    const rows = 89;
    const cols = 180;
    const values = new Float64Array(rows * cols);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) values[r * cols + c] = f(-88 + r * step, -180 + c * step);
    return { values, rows, cols, lat0: -88, lon0: -180, step };
  };

  it('rings a hollow, each crossing on the level', () => {
    const f = (lat: number, lon: number) => Math.hypot(lat - 10, lon - 20);
    const ring = isolines(grid(f), 15);
    expect(ring.length).toBeGreaterThan(20);
    for (const [[lat, lon]] of ring) expect(Math.abs(f(lat, lon) - 15)).toBeLessThan(0.5);
  });

  it('closes across the antimeridian', () => {
    const f = (lat: number, lon: number) => Math.hypot(lat, ((lon + 360) % 360) - 180);
    const ring = isolines(grid(f), 10);
    const lons = ring.flat().map(([, lon]) => lon);
    expect(Math.max(...lons)).toBeGreaterThan(175);
    expect(lons.some((lon) => lon < -170)).toBe(true);
  });
});

describe('the cursor against IGRF-14', () => {
  it("draws a cursor's year, forecast past 2025, held at 1900 before it and 2030 after", () => {
    expect(shieldYear(Date.UTC(1990, 6, 2))).toEqual({ year: 1990.5, wholeYear: 1990, clamped: null, forecast: false });
    expect(shieldYear(Date.UTC(2026, 9, 30))).toMatchObject({ wholeYear: 2026, clamped: null, forecast: true });
    expect(shieldYear(Date.UTC(1850, 0, 1))).toMatchObject({ year: 1900, wholeYear: 1900, clamped: 'before' });
    expect(shieldYear(Date.UTC(2030, 11, 31))).toMatchObject({ year: 2030, wholeYear: 2030, clamped: null });
    expect(shieldYear(Date.UTC(2040, 0, 1))).toMatchObject({ year: 2030, wholeYear: 2030, clamped: 'after' });
  });

  it('counts a decimal year in UTC', () => {
    expect(decimalYear(Date.UTC(2025, 0, 1))).toBe(2025);
    expect(decimalYear(Date.UTC(2024, 6, 2))).toBeCloseTo(2024.5, 2);
  });
});
