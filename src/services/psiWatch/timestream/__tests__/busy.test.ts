/**
 * Busy (decision D-PW, PW52, PW67): every open window's curve, each counting 1 at its peak, from the kit's own notes
 * and the lanes' own sky. A kind's recurrence comes from mean motions, so a pair's synodic period is the sky's; it
 * keeps the slow in wider views (PW51) and goes into the hover; a window the sky already holds is counted once.
 *
 * @vitest-environment node
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadPsiKit, type KitFixture } from '../../kitFixtures';
import { ASTRO_BODIES } from '../../astro/sky';
import { skyColumns } from '../skyColumns';
import { psiLaneItems, type PsiLaneItem } from '../psiLanes';
import { busiestColumn, busyColumns, busyPartsAt, keepsPair, keepsWindow, skyLod } from '../busy';
import { pairRecurrence, recurrenceIn, skyRecurrence } from '../recurrence';

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;

let items: PsiLaneItem[];
let fixtures: KitFixture[];
beforeAll(async () => { fixtures = await loadPsiKit({ samples: true }); items = psiLaneItems(fixtures); });

describe('recurrence', () => {
  it('gives a pair its synodic period as the sky shows it, twice as often at an angle but 0° or 180°', () => {
    expect(pairRecurrence('Sun', 'Mercury', 0)).toBeCloseTo(115.9, 0);
    expect(pairRecurrence('Jupiter', 'Saturn', 0)! / 365.25).toBeCloseTo(19.86, 1);
    expect(pairRecurrence('Moon', 'Mars', 90)).toBeCloseTo(14.2, 1);
    expect(pairRecurrence('Moon', 'GC', 180)).toBeCloseTo(27.32, 1);
    expect(pairRecurrence('Moon', 'Ceres', 90)).toBeUndefined();
  });

  it('counts in days under two months, months under two years, years beyond', () => {
    expect(recurrenceIn(pairRecurrence('Moon', 'Mars', 90)!)).toEqual({ unit: 'days', n: 14 });
    expect(recurrenceIn(pairRecurrence('Sun', 'Mercury', 0)!)).toEqual({ unit: 'months', n: 4 });
    expect(recurrenceIn(pairRecurrence('Mars', 'Jupiter', 0)!)).toEqual({ unit: 'years', n: 2 });
    expect(recurrenceIn(pairRecurrence('Jupiter', 'Saturn', 0)!)).toEqual({ unit: 'years', n: 20 });
    expect(recurrenceIn(0.4)).toEqual({ unit: 'days', n: 1 });
    expect(recurrenceIn(Infinity)).toBeNull();
  });

  it('knows the recurrence of each kind the notes carry, and says so of one it does not', () => {
    expect(skyRecurrence({ class: 'lunation', bodies: ['Sun', 'Moon'], angle: 90 })).toBeCloseTo(29.53, 2);
    expect(skyRecurrence({ class: 'ingress', bodies: ['Moon'] })).toBeCloseTo(2.28, 2);
    expect(skyRecurrence({ class: 'station', bodies: ['Mercury'] })).toBeCloseTo(115.9, 0);
    expect(skyRecurrence({ class: 'node', bodies: ['Moon'] })).toBeCloseTo(27.21, 2);
    expect(skyRecurrence({ class: 'nexus', bodies: [] })).toBeUndefined();
  });
});

describe('the psi lanes\' items', () => {
  it('reads the kit\'s windows and its alert, each window with how often its kind recurs', () => {
    expect(items.filter((i) => i.lane === 'windows')).toHaveLength(10);
    const [alert] = items.filter((i) => i.lane === 'alerts');
    expect(alert).toMatchObject({ fromMs: Date.UTC(2026, 9, 26, 13), untilMs: Date.UTC(2026, 9, 28, 1) });
    const square = items.find((i) => i.title === 'Moon and Mars at change (square)')!;
    expect(square.aspect).toEqual({ a: 'Moon', b: 'Mars', kind: 'square' });
    expect(square.recurrenceDays).toBeCloseTo(14.2, 1);
    expect(items.find((i) => i.title === 'Mercury turns direct (station)')!.recurrenceDays).toBeCloseTo(115.9, 0);
    expect(alert.recurrenceDays).toBeUndefined();
  });

  it('ties the focus window to its sky event, so Busy counts that once', () => {
    const focus = items.find((i) => i.title.startsWith('Psi Watch focus window'))!;
    const lunation = items.find((i) => i.title === 'Last Quarter')!;
    expect(focus.onSkyEvent).toBe(lunation.address);
    expect(focus.recurrenceDays).toBe(lunation.recurrenceDays);
    expect(lunation.aspect).toEqual({ a: 'Sun', b: 'Moon', kind: 'square' });
  });
});

describe('Busy', () => {
  it('holds the Moon–Mars square from the sky itself, counting 1 at its exact moment, and not the note again', () => {
    const view = { startMs: Date.UTC(2026, 9, 26, 12), spanMs: DAY };
    const sky = skyColumns(view, 96, ASTRO_BODIES, 'galactic');
    // The square is exact at 27 Oct 02:18Z: column 57 of 96 over the day from 26 Oct 12:00Z.
    const parts = busyPartsAt(sky, view, items, 57);
    const squares = parts.filter((p) => p.kind === 'aspect' && p.a === 'Moon' && p.b === 'Mars' && p.aspect === 'square');
    expect(squares).toHaveLength(1);
    expect(squares[0].weight).toBeCloseTo(1, 1);
    expect(squares[0].recurrenceDays).toBeCloseTo(14.2, 1);
    expect(parts.some((p) => p.kind === 'window' && p.title === 'Moon and Mars at change (square)')).toBe(false);
    const values = busyColumns(sky, view, items);
    expect(values[57]).toBeCloseTo(parts.reduce((sum, p) => sum + p.weight, 0), 4);
  });

  it('counts the notes\' other windows by their profiles: the Moon at perigee', () => {
    const view = { startMs: Date.UTC(2026, 9, 28, 6), spanMs: DAY };
    const sky = skyColumns(view, 96, ASTRO_BODIES, 'galactic');
    // Perigee is exact at 28 Oct 18:13Z: column 48.
    const perigee = busyPartsAt(sky, view, items, 48).find((p) => p.kind === 'window' && p.title === 'Moon at perigee');
    expect(perigee?.weight).toBeGreaterThan(0.9);
    expect(perigee?.recurrenceDays).toBeCloseTo(27.55, 2);
    expect(busiestColumn(new Float32Array([0, 2, 5, 1]))).toBe(2);
    expect(busiestColumn(new Float32Array(3))).toBe(-1);
  });

  it('keeps only the slow past a year, and the outer past a decade', () => {
    expect([skyLod(DAY), skyLod(YEAR), skyLod(2 * YEAR), skyLod(10 * YEAR)]).toEqual(['all', 'slow', 'slow', 'outer']);
    expect(keepsPair('slow', 'Moon', 'Mars')).toBe(false);
    expect(keepsPair('slow', 'Mars', 'Saturn')).toBe(true);
    expect(keepsPair('outer', 'Mars', 'Saturn')).toBe(false);
    const station = items.find((i) => i.title === 'Mercury turns direct (station)')!;
    expect([keepsWindow('all', station), keepsWindow('slow', station)]).toEqual([true, false]);
    const view = { startMs: Date.UTC(2026, 0, 1), spanMs: 2 * YEAR };
    const sky = skyColumns(view, 64, ASTRO_BODIES, 'galactic');
    for (let col = 0; col < 64; col += 8) {
      expect(busyPartsAt(sky, view, items, col).every((p) => p.kind === 'aspect' && p.a !== 'Moon' && p.a !== 'Sun')).toBe(true);
    }
  });

  it('weighs a slow pair no more than a fast one: every window counts 1 (PW67)', () => {
    const view = { startMs: Date.UTC(2026, 0, 1), spanMs: 2 * YEAR };
    const sky = skyColumns(view, 64, ASTRO_BODIES, 'galactic');
    const heaviest = Math.max(...Array.from({ length: 64 }, (_, col) => busyPartsAt(sky, view, items, col).reduce((most, p) => Math.max(most, p.weight), 0)));
    expect(heaviest).toBeLessThanOrEqual(1);
    expect(heaviest).toBeGreaterThan(0.9);
    expect(fixtures.length).toBeGreaterThan(0);
  });
});
