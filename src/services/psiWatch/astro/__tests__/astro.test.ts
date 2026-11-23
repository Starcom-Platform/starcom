/**
 * Psi Watch's astrology core (decision D-PW, PW5–PW6), checked against published values (Meeus, Astronomical
 * Algorithms, 2nd ed.; the owner's own Galactic Centre tables), and Placidus by its own definition and a second,
 * independent solver.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { anglesAt, ascendant, eclipticToEquatorial, midheaven } from '../angles';
import { aspectsOf } from '../aspects';
import { ASCENDANT_TURNED, chartAt, NO_PLACE } from '../chart';
import { ayanamsa, FRAME_NAMES, inFrame, signOf } from '../frames';
import { diurnalSemiArc, houseOf, housesOf, PLACIDUS_POLAR, placidusCusps } from '../houses';
import { arc, eclipticOfDate, meanNorthNode, norm360, positionAt, type SkyPosition } from '../sky';

const RAD = Math.PI / 180;
/** An hour angle, degrees in (−180, 180]: below zero, east of the meridian. */
const hourAngle = (ramc: number, ra: number) => arc(ra, ramc);
const altitude = (lat: number, dec: number, h: number) =>
  Math.asin(Math.sin(lat * RAD) * Math.sin(dec * RAD) + Math.cos(lat * RAD) * Math.cos(dec * RAD) * Math.cos(h * RAD)) / RAD;

// Moments and places to sample, all inside the polar circles.
const MOMENTS = ['1969-07-20T20:17:00Z', '2000-01-01T12:00:00Z', '2024-04-08T18:18:00Z', '2026-10-26T06:00:00Z'].map((s) => new Date(s));
const PLACES = [
  { lat: 51.48, lng: 0 }, { lat: 40.71, lng: -74.01 }, { lat: -33.87, lng: 151.21 }, { lat: 0, lng: 36.82 },
  { lat: 64.1, lng: -21.9 }, { lat: -54.8, lng: -68.3 }, { lat: 19.43, lng: -99.13 }, { lat: 66, lng: 25.7 },
];

describe('positions', () => {
  it("gives the Sun where Meeus's example 25.b does (1992 Oct 13, 0h TD)", () => {
    // ΔT was about 59 s in 1992.
    const sun = eclipticOfDate('Sun', new Date('1992-10-12T23:59:01Z'));
    expect(sun.lon).toBeCloseTo(199.90606, 2);
    expect(Math.abs(sun.lat)).toBeLessThan(0.001);
  });

  it("gives the Moon where Meeus's example 47.a does (1992 Apr 12, 0h TD)", () => {
    const moon = eclipticOfDate('Moon', new Date('1992-04-11T23:59:01Z'));
    expect(Math.abs(moon.lon - 133.167265)).toBeLessThan(0.01);
    expect(Math.abs(moon.lat - -3.229126)).toBeLessThan(0.01);
  });

  it("gives the apparent sidereal time of Meeus's example 12.a (1987 Apr 10, 0h UT)", () => {
    expect(Math.abs(Astronomy.SiderealTime(new Date('1987-04-10T00:00:00Z')) - (13 + 10 / 60 + 46.1351 / 3600))).toBeLessThan(2e-4);
  });

  it("puts the Moon's mean node at 125.0445° at J2000", () => {
    expect(meanNorthNode(new Date('2000-01-01T12:00:00Z'))).toBeCloseTo(125.0445, 3);
  });

  it('says a body is retrograde from its own motion: Mercury in late December 2023, not mid-January 2024', () => {
    expect(positionAt('Mercury', new Date('2023-12-20T00:00:00Z')).retrograde).toBe(true);
    expect(positionAt('Mercury', new Date('2024-01-10T00:00:00Z')).retrograde).toBe(false);
    expect(positionAt('Sun', new Date('2023-12-20T00:00:00Z')).speed).toBeCloseTo(1.02, 1);
  });
});

describe('frames', () => {
  it("measures the Galactic Centre frame as the owner's tools give it: 26.43° in 1970, 27.83° in 2070", () => {
    // Their table is a straight line through the mean place; the apparent place swings about 20″ through the year.
    expect(Math.abs(ayanamsa('galactic', new Date('1970-01-01T00:00:00Z')) - 26.433333)).toBeLessThan(0.01);
    expect(Math.abs(ayanamsa('galactic', new Date('2070-01-01T00:00:00Z')) - 27.833333)).toBeLessThan(0.01);
  });

  it('takes the Centre at its apparent place, so its frame swings off the year\'s straight line by the aberration', () => {
    const of = (d: string) => ayanamsa('galactic', new Date(`${d}T00:00:00Z`));
    // Halfway through the year, off the line from one New Year to the next by twice the aberration's 20.5″, give or take.
    const offLine = (of('2026-07-02') - (of('2026-01-01') + of('2027-01-01')) / 2) * 3600;
    expect(offLine).toBeGreaterThan(30);
    expect(offLine).toBeLessThan(50);
  });

  it('has the Galactic Centre at about 26°51′ Sagittarius (tropical) in 2000, and at 0° Sagittarius in its own frame', () => {
    const at = new Date('2000-01-01T12:00:00Z');
    expect(Math.abs(240 + ayanamsa('galactic', at) - 266.85)).toBeLessThan(0.02);
    expect(signOf(inFrame(240 + ayanamsa('galactic', at), 'galactic', at))).toEqual({ sign: 'Sagittarius', degree: expect.closeTo(0, 6) });
  });

  it('leaves tropical longitudes as they are, and names each frame', () => {
    expect(inFrame(123.4, 'tropical', new Date())).toBeCloseTo(123.4, 12);
    expect(FRAME_NAMES.galactic).toMatch(/Galactic Centre/);
  });

  it('reads a longitude as its sign and degree', () => {
    expect(signOf(0)).toEqual({ sign: 'Aries', degree: 0 });
    expect(signOf(359.5)).toEqual({ sign: 'Pisces', degree: 29.5 });
    expect(signOf(-0.5).sign).toBe('Pisces');
  });
});

describe('angles', () => {
  it('puts the Ascendant on the eastern horizon and the Midheaven on the meridian, everywhere sampled', () => {
    for (const at of MOMENTS) {
      for (const place of PLACES) {
        const angles = anglesAt(at, place.lat, place.lng);
        const asc = eclipticToEquatorial(angles.asc, angles.obliquity);
        const h = hourAngle(angles.ramc, asc.ra);
        expect(Math.abs(altitude(place.lat, asc.dec, h))).toBeLessThan(1e-7);
        expect(h).toBeLessThan(0);
        expect(Math.abs(arc(eclipticToEquatorial(angles.mc, angles.obliquity).ra, angles.ramc))).toBeLessThan(1e-9);
        expect(angles.dsc).toBeCloseTo(norm360(angles.asc + 180), 9);
        expect(angles.ic).toBeCloseTo(norm360(angles.mc + 180), 9);
      }
    }
  });

  it('gives the closed forms their textbook values at the equator and an equinoctial meridian', () => {
    expect(midheaven(0, 23.44)).toBeCloseTo(0, 9);
    expect(midheaven(90, 23.44)).toBeCloseTo(90, 9);
    expect(ascendant(0, 23.44, 0).asc).toBeCloseTo(90, 9);
    expect(ascendant(270, 23.44, 0).asc).toBeCloseTo(0, 9);
  });
});

/** A second Placidus solver, sharing nothing with the first but the definition: bisect the hour-angle condition. */
function bisectCusp(share: number, ramc: number, obliquity: number, lat: number, from: number, to: number): number {
  const miss = (lon: number) => {
    const { ra, dec } = eclipticToEquatorial(lon, obliquity);
    return hourAngle(ramc, ra) - share * diurnalSemiArc(dec, lat);
  };
  let lo = from;
  let hi = from + norm360(to - from);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sign(miss(mid)) === Math.sign(miss(lo))) lo = mid;
    else hi = mid;
  }
  return norm360((lo + hi) / 2);
}

describe('Placidus houses', () => {
  it('puts each cusp at its share of its own semi-arc, day arc above the horizon and night arc below', () => {
    for (const at of MOMENTS) {
      for (const place of PLACES) {
        const angles = anglesAt(at, place.lat, place.lng);
        const cusps = placidusCusps(angles, place.lat)!;
        // The hour angle each cusp must have, from its day arc (its night arc is 180° less it).
        const check = (house: number, hourAngleOf: (day: number) => number) => {
          const { ra, dec } = eclipticToEquatorial(cusps[house - 1], angles.obliquity);
          const day = diurnalSemiArc(dec, place.lat);
          expect(Math.abs(arc(hourAngleOf(day), hourAngle(angles.ramc, ra)))).toBeLessThan(1e-6);
        };
        check(11, (day) => -day / 3);
        check(12, (day) => (-2 * day) / 3);
        check(9, (day) => day / 3);
        check(8, (day) => (2 * day) / 3);
        // Below the horizon, the share runs along the night arc from the lower meridian (hour angle 180°).
        check(3, (day) => -180 + (180 - day) / 3);
        check(2, (day) => -180 + (2 * (180 - day)) / 3);
        check(5, (day) => 180 - (180 - day) / 3);
        check(6, (day) => 180 - (2 * (180 - day)) / 3);
      }
    }
  });

  it('runs its cusps in order round the ecliptic from the Ascendant, the tenth on the Midheaven', () => {
    for (const at of MOMENTS) {
      for (const place of PLACES) {
        const angles = anglesAt(at, place.lat, place.lng);
        const cusps = placidusCusps(angles, place.lat)!;
        expect(cusps[0]).toBe(angles.asc);
        expect(cusps[9]).toBe(angles.mc);
        const gaps = cusps.map((c, i) => norm360(cusps[(i + 1) % 12] - c));
        expect(gaps.every((g) => g > 0 && g < 180)).toBe(true);
        expect(gaps.reduce((a, b) => a + b, 0)).toBeCloseTo(360, 9);
      }
    }
  });

  it('agrees with a second solver, bisection between the Midheaven and the horizon', () => {
    for (const at of MOMENTS) {
      for (const place of PLACES) {
        const angles = anglesAt(at, place.lat, place.lng);
        const cusps = placidusCusps(angles, place.lat)!;
        expect(Math.abs(arc(cusps[10], bisectCusp(-1 / 3, angles.ramc, angles.obliquity, place.lat, angles.mc, angles.asc)))).toBeLessThan(1e-6);
        expect(Math.abs(arc(cusps[11], bisectCusp(-2 / 3, angles.ramc, angles.obliquity, place.lat, angles.mc, angles.asc)))).toBeLessThan(1e-6);
        expect(Math.abs(arc(cusps[8], bisectCusp(1 / 3, angles.ramc, angles.obliquity, place.lat, angles.dsc, angles.mc)))).toBeLessThan(1e-6);
        expect(Math.abs(arc(cusps[7], bisectCusp(2 / 3, angles.ramc, angles.obliquity, place.lat, angles.dsc, angles.mc)))).toBeLessThan(1e-6);
      }
    }
  });

  it('reduces at the equator to cusps 30° of right ascension apart, as every semi-arc there is 90°', () => {
    const angles = anglesAt(new Date('2026-10-26T06:00:00Z'), 0, 36.82);
    const cusps = placidusCusps(angles, 0)!;
    cusps.forEach((cusp, i) => {
      const expected = norm360(angles.ramc + 90 + 30 * i);
      expect(Math.abs(arc(expected, eclipticToEquatorial(cusp, angles.obliquity).ra))).toBeLessThan(1e-6);
    });
  });

  it('refuses beyond the polar circles, and says why', () => {
    const at = new Date('2026-10-26T06:00:00Z');
    for (const lat of [67, 70, -67, -80]) {
      const angles = anglesAt(at, lat, 0);
      expect(placidusCusps(angles, lat)).toBeNull();
      expect(housesOf('placidus', angles, lat, 'galactic', at)).toEqual({ system: 'placidus', refused: PLACIDUS_POLAR });
    }
  });
});

describe('whole-sign houses', () => {
  it("starts the first house at the start of the Ascendant's sign, in the chart's frame", () => {
    const at = new Date('2026-10-26T06:00:00Z');
    const angles = anglesAt(at, 51.48, 0);
    for (const frame of ['galactic', 'tropical'] as const) {
      const houses = housesOf('whole-sign', angles, 51.48, frame, at);
      if (!('cusps' in houses)) throw new Error('no cusps');
      const asc = inFrame(angles.asc, frame, at);
      expect(houses.cusps[0]).toBe(Math.floor(asc / 30) * 30);
      expect(houseOf(asc, houses.cusps)).toBe(1);
      expect(houses.cusps[11]).toBe(norm360(houses.cusps[0] + 330));
    }
  });

  it('finds a house across the cusp that wraps past 0°', () => {
    const cusps = [330, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300];
    expect(houseOf(345, cusps)).toBe(1);
    expect(houseOf(5, cusps)).toBe(2);
    expect(houseOf(329.9, cusps)).toBe(12);
  });
});

const at = (body: SkyPosition['body'], lon: number, speed: number): SkyPosition => ({ body, lon, lat: 0, speed, retrograde: speed < 0 });

describe('aspects', () => {
  it('finds a trine within its orb, and whether it is closing', () => {
    const [closing] = aspectsOf([at('Sun', 0, 1), at('Moon', 118, 13)], 'classic');
    expect(closing).toMatchObject({ a: 'Sun', b: 'Moon', kind: 'trine', angle: 120, applying: true });
    expect(closing.orb).toBeCloseTo(2, 9);
    expect(aspectsOf([at('Sun', 0, 1), at('Moon', 122, 13)], 'classic')[0]).toMatchObject({ kind: 'trine', applying: false });
  });

  it('measures across 0°, and gives each pair one aspect, its nearest', () => {
    const found = aspectsOf([at('Venus', 355, 1.2), at('Mars', 3, 0.6)], 'harmonic');
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'conjunction', orb: expect.closeTo(8, 9) });
  });

  it('counts by the scheme: 25° apart is a conjunction in the harmonic orbs only', () => {
    const pair = [at('Sun', 10, 1), at('Mars', 35, 0.6)];
    expect(aspectsOf(pair, 'classic')).toEqual([]);
    expect(aspectsOf(pair, 'harmonic')[0]).toMatchObject({ kind: 'conjunction' });
  });

  it("weighs by the sky catalogue's orbs by default: 3° with the Moon, 6° between the Sun and planets, major aspects only", () => {
    expect(aspectsOf([at('Moon', 0, 13), at('Mars', 92.5, 0.6)], 'catalogue')[0]).toMatchObject({ kind: 'square', orb: expect.closeTo(2.5, 9) });
    expect(aspectsOf([at('Moon', 0, 13), at('Mars', 93.5, 0.6)], 'catalogue')).toEqual([]);
    const sunMars = aspectsOf([at('Sun', 0, 1), at('Mars', 125, 0.6)], 'catalogue')[0];
    expect(sunMars).toMatchObject({ kind: 'trine' });
    // Half weight at the half-weight orb, h = 2° for this pair.
    expect(aspectsOf([at('Sun', 0, 1), at('Mars', 122, 0.6)], 'catalogue')[0].weight).toBeCloseTo(0.5, 9);
    expect(aspectsOf([at('Uranus', 0, 0.01), at('Pluto', 64, 0.01)], 'catalogue')).toEqual([]);
    expect(aspectsOf([at('Sun', 0, 1), at('Saturn', 150.5, 0.03)], 'catalogue')).toEqual([]);
  });

  it('keeps to the major aspects when asked', () => {
    const pair = [at('Sun', 0, 1), at('Saturn', 150.5, 0.03)];
    expect(aspectsOf(pair, 'classic')[0]).toMatchObject({ kind: 'quincunx' });
    expect(aspectsOf(pair, 'classic', { majorOnly: true })).toEqual([]);
  });
});

describe('a chart', () => {
  it('without a place, is the sky alone and says so', () => {
    const chart = chartAt(new Date('2026-10-26T06:00:00Z'));
    expect(chart.frame).toBe('galactic');
    expect(chart.frameName).toBe(FRAME_NAMES.galactic);
    expect(chart.angles).toBeUndefined();
    expect(chart.houses).toBeUndefined();
    expect(chart.caveats).toEqual([NO_PLACE]);
    expect(chart.points.map((p) => p.body)).toEqual(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'NorthNode']);
    expect(chart.points.every((p) => p.house === undefined)).toBe(true);
  });

  it('with a place, has angles, houses and each point in its house, all in its frame', () => {
    const when = new Date('2026-10-26T06:00:00Z');
    const chart = chartAt(when, { lat: 51.48, lng: 0 }, { frame: 'tropical' });
    const galactic = chartAt(when, { lat: 51.48, lng: 0 });
    expect(chart.housesName).toBe('Placidus');
    expect(chart.caveats).toEqual([]);
    expect(chart.points.every((p) => p.house! >= 1 && p.house! <= 12)).toBe(true);
    expect(norm360(chart.points[0].lon - galactic.points[0].lon)).toBeCloseTo(galactic.ayanamsa, 9);
    expect(norm360(chart.angles!.asc - galactic.angles!.asc)).toBeCloseTo(galactic.ayanamsa, 9);
  });

  it('beyond the polar circles, keeps its angles but says Placidus has no houses there', () => {
    const chart = chartAt(new Date('2026-10-26T06:00:00Z'), { lat: 78.22, lng: 15.65 });
    expect(chart.angles).toBeDefined();
    expect(chart.caveats[0]).toBe(PLACIDUS_POLAR);
    expect(chart.points.every((p) => p.house === undefined)).toBe(true);
  });

  it('beyond the polar circles, turns the Ascendant to the point rising in the east, and says so (PW23)', () => {
    const hours = Array.from({ length: 96 }, (_, i) => new Date(Date.UTC(2026, 9, 26, 0, 15 * i)));
    for (const lat of [70, 78.22, -70]) {
      const charts = hours.map((when) => ({ when, angles: anglesAt(when, lat, 15.65) }));
      const turned = charts.filter((c) => c.angles.ascTurned);
      expect(turned.length, `${lat}`).toBeGreaterThan(0);
      for (const { angles } of charts) {
        const asc = eclipticToEquatorial(angles.asc, angles.obliquity);
        const h = hourAngle(angles.ramc, asc.ra);
        expect(Math.abs(altitude(lat, asc.dec, h))).toBeLessThan(1e-7);
        expect(h).toBeLessThan(0);
        // As Mecha Jono's catalogue holds it: the Midheaven on the upper meridian, the Ascendant 0–180° past it.
        expect(norm360(angles.asc - angles.mc)).toBeGreaterThan(0);
        expect(norm360(angles.asc - angles.mc)).toBeLessThan(180);
      }
      const chart = chartAt(turned[0].when, { lat, lng: 15.65 }, { houses: 'whole-sign' });
      expect(chart.caveats).toEqual([ASCENDANT_TURNED]);
      expect(chart.points.every((p) => p.house! >= 1)).toBe(true);
    }
    // Inside the polar circles it never needs turning.
    expect(hours.some((when) => anglesAt(when, 60, 0).ascTurned)).toBe(false);
  });
});
