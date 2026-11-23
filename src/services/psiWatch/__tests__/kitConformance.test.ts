/**
 * Psi Watch against Mecha Jono's build kit v0 (`src/services/psiWatch/kit-v0/`): the
 * numbers Starcom's code must reproduce, at the kit's own tolerances. Their engine is skyfield on DE440s; ours is
 * astronomy-engine, so agreeing is the check that both are right.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { catalogueOrb, pairKind } from '../astro/aspects';
import { ayanamsa } from '../astro/frames';
import { gastDeg, horizonCrossing, meridianLines, wrap180 } from '../astro/lines';
import { arc, eclipticOfDate, positionAt, type AstroBody } from '../astro/sky';
import { ageOf, profileSpan, profileWeight, readProfile, readWindow, shownState, windowWeightAt } from '../windowProfile';

const KIT = resolve(__dirname, '../kit-v0');
const kit = (path: string) => JSON.parse(readFileSync(resolve(KIT, path), 'utf8'));
const VECTORS = kit('vectors_psi.json');
const TOL = VECTORS.tolerances as { profile_weight: number; mc_ic_lon_deg: number; ra_dec_deg: number; horizon_lon_deg: number; aspect_angle_arcsec: number };
const tagOf = (event: { tags: string[][] }, name: string) => event.tags.find((tag) => tag[0] === name);

describe("the kit's angular vectors (PsiLines' MC and IC)", () => {
  for (const instant of VECTORS.angular.instants) {
    it(`matches every body's place and meridian lines at ${instant.utc}`, () => {
      const at = new Date(instant.t_unix * 1000);
      const gast = gastDeg(at);
      expect(Math.abs(arc(gast, instant.gast_deg))).toBeLessThan(TOL.ra_dec_deg);
      for (const [body, want] of Object.entries<{ ra_deg: number; dec_deg: number; mc_lon: number; ic_lon: number }>(instant.bodies)) {
        const lines = meridianLines(body as AstroBody, at, gast);
        expect(Math.abs(arc(lines.ra, want.ra_deg))).toBeLessThan(TOL.ra_dec_deg);
        expect(Math.abs(lines.dec - want.dec_deg)).toBeLessThan(TOL.ra_dec_deg);
        expect(Math.abs(arc(lines.mc, want.mc_lon))).toBeLessThan(TOL.mc_ic_lon_deg);
        expect(Math.abs(arc(lines.ic, want.ic_lon))).toBeLessThan(TOL.mc_ic_lon_deg);
        expect(lines.mc).toBeGreaterThan(-180);
        expect(lines.mc).toBeLessThanOrEqual(180);
      }
    });
  }
});

describe("the kit's horizon curves (PsiLines' ASC and DSC)", () => {
  type Row = { lat: number; asc: number | null; dsc: number | null; state?: string };
  const check = (at: Date, body: string, rows: Row[]) => {
    const lines = meridianLines(body as AstroBody, at);
    for (const row of rows) {
      const crossing = horizonCrossing(lines.mc, lines.dec, row.lat);
      if (row.asc === null) {
        expect(crossing).toEqual({ lat: row.lat, state: row.state });
        continue;
      }
      if (!('asc' in crossing)) throw new Error(`${body} at ${row.lat}°: ${crossing.state}, the kit has lines`);
      expect(Math.abs(arc(crossing.asc, row.asc))).toBeLessThan(TOL.horizon_lon_deg);
      expect(Math.abs(arc(crossing.dsc, row.dsc!))).toBeLessThan(TOL.horizon_lon_deg);
    }
  };
  for (const instant of VECTORS.horizon_curves.instants) {
    it(`matches every body's rising and setting, 66°S to 66°N and the polar edge cases, at ${instant.utc}`, () => {
      const at = new Date(instant.t_unix * 1000);
      for (const [body, rows] of Object.entries<Row[]>(instant.bodies)) check(at, body, rows);
      for (const [body, rows] of Object.entries<Row[]>(instant.edge_cases)) check(at, body, rows);
    });
  }
});

describe("the kit's aspect times", () => {
  it('stands each aspect and lunation within 60″ of exact at the kit\'s moment, and turns each station within the hour', () => {
    for (const event of VECTORS.aspect_times.events) {
      const at = new Date(event.exact_utc * 1000);
      if (event.class === 'station') {
        const before = positionAt(event.bodies[0], new Date(at.getTime() - 3_600_000)).speed;
        const after = positionAt(event.bodies[0], new Date(at.getTime() + 3_600_000)).speed;
        expect(Math.sign(before)).not.toBe(Math.sign(after));
        continue;
      }
      const [a, b] = event.bodies as AstroBody[];
      const miss = wrap180(eclipticOfDate(a, at).lon - eclipticOfDate(b, at).lon - event.target_deg) * 3600;
      expect(Math.abs(miss), event.id).toBeLessThan(TOL.aspect_angle_arcsec);
    }
  });
});

describe('the Galactic Centre frame, against the kit\'s sky events', () => {
  it("gives the ayanamsa a sidereal ingress carries, to a thousandth of a degree", () => {
    const event = kit('fixtures/psi/psi_sky_event.ingress.sidereal_gc.json').event;
    const at = new Date(Number(tagOf(event, 'exact')![1]) * 1000);
    expect(Math.abs(ayanamsa('galactic', at) - Number(tagOf(event, 'frame')![4]))).toBeLessThan(0.001);
    // And the Moon is on the sign's edge there: 0° Taurus in the frame, within the 60″ the kit allows.
    expect(Math.abs(arc(eclipticOfDate('Moon', at).lon - ayanamsa('galactic', at), 30)) * 3600).toBeLessThan(TOL.aspect_angle_arcsec);
  });

  it('puts the Moon opposite the Galactic Centre at the contact the kit lists', () => {
    const event = kit('fixtures/psi/psi_sky_event.gc_contact.json').event;
    const at = new Date(Number(tagOf(event, 'exact')![1]) * 1000);
    const centre = 240 + ayanamsa('galactic', at);
    expect(Math.abs(wrap180(eclipticOfDate('Moon', at).lon - centre - 180)) * 3600).toBeLessThan(TOL.aspect_angle_arcsec);
  });
});

describe("the kit's profile weights (the shared timeline)", () => {
  for (const sample of VECTORS.profile_weights.cases) {
    it(`weighs ${sample.name} as the kit does, and spans its window`, () => {
      const profile = readProfile(sample.tag)!;
      expect(profile).not.toBeNull();
      for (const [tau, want] of sample.samples as [number, number][]) {
        expect(Math.abs(profileWeight(profile, tau)! - want), `τ ${tau}`).toBeLessThan(TOL.profile_weight);
      }
      const [from, until] = profileSpan(profile)!;
      expect(Math.abs(from - sample.window_s[0])).toBeLessThan(1);
      expect(Math.abs(until - sample.window_s[1])).toBeLessThan(1);
    });
  }

  it("weighs every sky fixture inside its own window: 1 at exact, nothing outside, the cap's weight at a fast event's edges", () => {
    for (const name of ['aspect.moon', 'aspect.slow', 'gc_contact', 'lunation', 'lunar_distance', 'node', 'ingress.tropical', 'ingress.sidereal_gc', 'station']) {
      const event = kit(`fixtures/psi/psi_sky_event.${name}.json`).event;
      const window = readWindow(event.tags)!;
      expect(window, name).not.toBeNull();
      expect(window.anchor).toBe(Number(tagOf(event, 'exact')![1]));
      expect(windowWeightAt(window, window.from - 1)).toBe(0);
      expect(windowWeightAt(window, window.until + 1)).toBe(0);
      if (name === 'station') {
        expect(windowWeightAt(window, window.anchor)).toBeNull();
        continue;
      }
      expect(windowWeightAt(window, window.anchor)).toBeCloseTo(1, 6);
      if (['aspect.moon', 'lunation', 'ingress.tropical', 'ingress.sidereal_gc'].includes(name)) {
        const { h, cap } = window.profile as { h: number; cap: number };
        expect(Math.abs(windowWeightAt(window, window.until)! - Math.pow(2, -((cap / h) ** 2))), name).toBeLessThan(TOL.profile_weight);
      }
    }
  });

  it('draws a station, or a kind it does not know, as a band, never refusing it', () => {
    expect(readProfile(['profile', 'speed_fraction', '0.5', '0.1'])).toEqual({ kind: 'band', name: 'speed_fraction' });
    expect(readProfile(['profile', 'tidal_swell', '1'])).toEqual({ kind: 'band', name: 'tidal_swell' });
    expect(profileWeight({ kind: 'band', name: 'speed_fraction' }, 0)).toBeNull();
    expect(readProfile(['profile', 'gauss_orb', 'one', '3', '12', '0'])).toBeNull();
  });
});

const RLSH = kit('vectors_rlsh.json');

describe("the kit's RLSH vectors (the same timeline)", () => {
  for (const sample of RLSH.profile_weights.cases) {
    it(`weighs ${sample.id} from its anchor as the kit does`, () => {
      const profile = readProfile(sample.profile_tag)!;
      for (const { offset_s, w } of sample.samples as { offset_s: number; w: number }[]) {
        expect(Math.abs(profileWeight(profile, offset_s)! - w), `${offset_s} s`).toBeLessThan(RLSH.profile_weights.tolerance);
      }
      // The window tag agrees with the profile: from is the anchor less the lead, until where the weight ends.
      const window = readWindow([sample.window_tag, sample.profile_tag])!;
      expect(window.anchor).toBe(sample.anchor);
      expect(window.until - window.anchor).toBe(sample.until_offset_s);
      expect(Math.floor(profileSpan(profile)![1])).toBe(sample.until_offset_s);
    });
  }

  it('shows each window in the state the kit expects, by the clock, with its age', () => {
    for (const sample of RLSH.window_states.cases) {
      const [, from, , until] = sample.window.map(Number);
      expect(shownState(sample.published_state, from, until, sample.now), JSON.stringify(sample)).toBe(sample.expect.state ?? null);
      if (sample.expect.age_s !== undefined) expect(sample.now - sample.published_at).toBe(sample.expect.age_s);
    }
  });

  it('refuses a state the kit does not name, and lets the clock alone decide for a sky event', () => {
    expect(shownState('paused', 0, 10, 5)).toBeNull();
    expect(shownState(undefined, 10, 20, 5)).toBe('armed');
    expect(shownState(undefined, 10, 20, 15)).toBe('live');
    expect(shownState(undefined, 10, 20, 21)).toBe('closed');
  });

  it('says an age in minutes, hours, then days', () => {
    expect(ageOf(30)).toEqual({ unit: 'now' });
    expect(ageOf(600)).toEqual({ unit: 'minutes', n: 10 });
    expect(ageOf(117_000)).toEqual({ unit: 'hours', n: 32 });
    expect(ageOf(203_400)).toEqual({ unit: 'days', n: 2 });
  });
});

describe("the kit's orb table (kit/orbs.json)", () => {
  const ORBS = kit('orbs.json');
  it('gives every pair of bodies the half-weight orb and cap its pair kind has in the table', () => {
    const { h_deg: h, cap_deg: cap } = ORBS.classes.aspect;
    const bodies = ORBS.bodies as AstroBody[];
    for (const a of bodies) {
      for (const b of bodies) {
        if (a === b) continue;
        // The table's rule, as it words it: the Moon makes a moon pair; else the Sun, Mercury or Venus an inner one.
        const kind = a === 'Moon' || b === 'Moon' ? 'moon' : ['Sun', 'Mercury', 'Venus'].some((x) => x === a || x === b) ? 'inner' : 'outer';
        expect(pairKind(a, b), `${a}–${b}`).toBe(kind);
        expect(catalogueOrb(a, b), `${a}–${b}`).toEqual({ h: h[kind], cap: cap[kind] });
      }
    }
    expect(pairKind('Mars', 'Jupiter')).toBe('outer');
    expect(pairKind('Sun', 'NorthNode')).toBe('inner');
  });
});
