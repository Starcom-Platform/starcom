/**
 * Echoes' returns (decision D-PW, PW47, PW49, PW69): each of the kit's sky event kinds found again across a year,
 * each return standing as its kind asks, its own moment left out; and each return's gathering of a set's events
 * beside the usual.
 *
 * @vitest-environment node
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as Astronomy from 'astronomy-engine';
import { loadPsiKit } from '../../kitFixtures';
import { readSkyEvent, type PsiSkyEvent } from '../../psiEvents';
import { eclipticOfDate, norm360 } from '../../astro/sky';
import { inFrame } from '../../astro/frames';
import { echoable, returnsOf } from '../echoReturns';
import { echoReturns, getEcho, setEcho, updateEcho, usualCount } from '../echoes';
import { readEventSet } from '../eventSets';

const DAY = 86_400_000;
const FROM = Date.UTC(2025, 0, 1);
const UNTIL = Date.UTC(2026, 0, 1);
let events: Record<string, PsiSkyEvent>;
let all: PsiSkyEvent[];
beforeAll(async () => {
  const kit = await loadPsiKit({ samples: true });
  all = kit.filter((f) => f.family === 'psi_sky_event').map((f) => readSkyEvent(f.event)!);
  events = Object.fromEntries(all.map((e) => [`${e.sky.class}:${e.bodies.join('-')}`, e]));
});
const lon = (body: 'Moon' | 'Mars' | 'Sun' | 'Mercury', ms: number) => eclipticOfDate(body, new Date(ms)).lon;

describe('the returns of each kind', () => {
  it('finds a Moon–Mars square either side about twice a month, each exact to a few hundredths of a degree', () => {
    const square = events['aspect:Moon-Mars'];
    expect(echoable(square)).toBe(true);
    const found = returnsOf(square, FROM, UNTIL, 'galactic');
    expect(found.length).toBeGreaterThanOrEqual(24);
    expect(found.length).toBeLessThanOrEqual(27);
    for (const ms of found) {
      const sep = norm360(lon('Mars', ms) - lon('Moon', ms));
      expect(Math.min(Math.abs(sep - 90), Math.abs(sep - 270))).toBeLessThan(0.02);
    }
  });

  it('finds the Moon entering the same sign in the note\'s own frame, going forward', () => {
    const ingress = all.find((e) => e.sky.class === 'ingress' && e.frame?.frame === 'tropical')!;
    const found = returnsOf(ingress, FROM, UNTIL, 'galactic');
    expect(found.length).toBeGreaterThanOrEqual(13);
    for (const ms of found) expect(Math.abs(norm360(lon('Moon', ms) - 60 + 180) - 180)).toBeLessThan(0.02);
  });

  it('keeps a lunation\'s phase with the Moon in the same sign, in the drawer\'s frame', () => {
    const lunation = events['lunation:Sun-Moon'];
    const own = Math.floor(inFrame(lon('Moon', lunation.exact * 1000), 'galactic', new Date(lunation.exact * 1000)) / 30);
    const found = returnsOf(lunation, Date.UTC(2015, 0, 1), UNTIL, 'galactic');
    expect(found.length).toBeGreaterThanOrEqual(9);
    for (const ms of found) {
      expect(Math.floor(inFrame(lon('Moon', ms), 'galactic', new Date(ms)) / 30)).toBe(own);
      expect(Astronomy.MoonPhase(new Date(ms))).toBeCloseTo(270, 0);
    }
  });

  it('finds the perigees, the node crossed the same way, and Mercury turning direct in the same sign', () => {
    expect(returnsOf(events['lunar_distance:Moon'], FROM, UNTIL, 'galactic').length).toBe(13);
    const nodes = returnsOf(events['node:Moon'], FROM, UNTIL, 'galactic');
    expect(nodes.length).toBeGreaterThanOrEqual(13);
    for (const ms of nodes) expect(eclipticOfDate('Moon', new Date(ms + DAY / 4)).lat).toBeLessThan(0);
    const station = events['station:Mercury'];
    const stations = returnsOf(station, Date.UTC(1990, 0, 1), UNTIL, 'galactic');
    expect(stations.length).toBeGreaterThan(2);
    const sign = Math.floor(inFrame(lon('Mercury', station.exact * 1000), 'galactic', new Date(station.exact * 1000)) / 30);
    for (const ms of stations) expect(Math.floor(inFrame(lon('Mercury', ms), 'galactic', new Date(ms)) / 30)).toBe(sign);
  });

  it('leaves the event\'s own moment out', () => {
    const square = events['aspect:Moon-Mars'];
    const own = square.exact * 1000;
    const found = returnsOf(square, own - 40 * DAY, own + 40 * DAY, 'galactic');
    expect(found.every((ms) => Math.abs(ms - own) > DAY / 2)).toBe(true);
    expect(found.length).toBeGreaterThanOrEqual(4);
  });
});

describe('a return\'s gathering', () => {
  const set = readEventSet({
    set: 'quakes', kind: 'k', time: 't', licence: 'public domain', credit: 'c', laterEvents: 'l', source: { file: 'f', sha256: 'x' },
    rows: 4, fromMs: Date.UTC(1992, 0, 1), untilMs: Date.UTC(1992, 11, 31), zones: [],
    t: [Date.UTC(1992, 1, 1) / 1000, DAY / 1000, 30 * DAY / 1000, 1],
  })!;

  it('counts each return\'s events within the window\'s span about it, the newest ranked first', () => {
    const returns = [Date.UTC(1992, 1, 2), Date.UTC(1992, 2, 3), Date.UTC(2021, 5, 1)];
    const got = echoReturns({ returns, beforeMs: DAY, afterMs: DAY }, set);
    // The third lies past the record: no bar.
    expect(got.map((r) => [r.count, r.rank])).toEqual([[2, 1], [2, 0]]);
  });

  it('gives the usual as the count any span that long holds across the record', () => {
    expect(usualCount(set, 366 * DAY)).toBeCloseTo(4, 6);
  });

  it('changes the Echo shown only while it is the one asked about', () => {
    setEcho({ address: 'a', title: 't', event: events['node:Moon'], beforeMs: 0, afterMs: 0, returns: null, isolated: null });
    updateEcho('b', { returns: [1] });
    expect(getEcho()!.returns).toBeNull();
    updateEcho('a', { returns: [1] });
    expect(getEcho()!.returns).toEqual([1]);
    setEcho(null);
  });
});
