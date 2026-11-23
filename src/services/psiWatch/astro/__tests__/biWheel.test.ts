/**
 * An event chart, then and now (D-PW, PW60): the event's chart and the cursor's sky in one frame, the cursor's bodies
 * in the event's houses, and the aspects across, one a pair, within the orbs, the cursor's bodies moving.
 */
import { describe, expect, it } from 'vitest';
import { aspectsAcross, biWheel } from '../biWheel';
import { separation } from '../aspects';
import type { ChartPoint } from '../chart';

const point = (body: ChartPoint['body'], lon: number, speed = 0): ChartPoint =>
  ({ body, lon, sign: 'Aries', degree: lon % 30, lat: 0, speed, retrograde: speed < 0 });

describe('aspectsAcross', () => {
  it('finds the one aspect each pair stands closest to, within the catalogue orbs', () => {
    const then = [point('Mars', 100)];
    const now = [point('Saturn', 191, 0.05), point('Jupiter', 160), point('Venus', 104, 1.2)];
    const across = aspectsAcross(then, now, 'catalogue');
    // Jupiter 60° on is an exact sextile; Saturn 91° on, a square 1° wide; Venus 4° on, a conjunction within the inner pair's 6°.
    expect(across.map((a) => `${a.then} ${a.kind} ${a.now} ${a.orb}`)).toEqual(['Mars sextile Jupiter 0', 'Mars square Saturn 1', 'Mars conjunction Venus 4']);
  });

  it('says applying when the cursor\'s body closes on exact', () => {
    // The Moon 88° from the Sun, moving on toward 90°: closing; moving back: separating.
    const [closing] = aspectsAcross([point('Sun', 10)], [point('Moon', 98, 13)], 'catalogue');
    expect(closing).toMatchObject({ kind: 'square', applying: true });
    const [opening] = aspectsAcross([point('Sun', 10)], [point('Moon', 98, -13)], 'catalogue');
    expect(opening.applying).toBe(false);
  });

  it('takes the minor aspects only where a scheme reads them', () => {
    expect(aspectsAcross([point('Mars', 0)], [point('Saturn', 150)], 'catalogue')).toEqual([]);
    expect(aspectsAcross([point('Mars', 0)], [point('Saturn', 150)], 'classic')[0].kind).toBe('quincunx');
  });
});

describe('biWheel', () => {
  const event = new Date(Date.UTC(2026, 9, 27, 2, 18));
  const cursor = new Date(Date.UTC(2026, 10, 11, 12, 0));
  const place = { lat: 36.2, lng: 37.1 };

  it('puts both in one frame, the cursor\'s bodies in the event\'s houses', () => {
    const wheel = biWheel(event, place, cursor);
    expect(wheel.then.frame).toBe('galactic');
    expect(wheel.now.frame).toBe('galactic');
    expect(wheel.then.points).toHaveLength(11);
    expect(wheel.now.points.every((p) => typeof p.house === 'number' && p.house >= 1 && p.house <= 12)).toBe(true);
    // The Moon moves about 13° a day: fifteen days on, it stands elsewhere.
    const moon = (c: typeof wheel.then) => c.points.find((p) => p.body === 'Moon')!.lon;
    expect(separation(moon(wheel.then), moon(wheel.now))).toBeGreaterThan(20);
    for (const a of wheel.across) {
      const p = wheel.then.points.find((x) => x.body === a.then)!;
      const q = wheel.now.points.find((x) => x.body === a.now)!;
      expect(Math.abs(separation(p.lon, q.lon) - a.angle)).toBeCloseTo(a.orb, 6);
    }
  });

  it('is the same at the same moment, every body conjunct itself', () => {
    const wheel = biWheel(event, place, event);
    for (const body of ['Sun', 'Moon', 'Mars', 'Pluto'] as const) {
      expect(wheel.across.find((a) => a.then === body && a.now === body)).toMatchObject({ kind: 'conjunction', orb: 0 });
    }
  });

  it('is tropical when asked, the frame stated', () => {
    const wheel = biWheel(event, place, cursor, { frame: 'tropical' });
    expect(wheel.then.frameName).toBe('Tropical');
    expect(wheel.now.frame).toBe('tropical');
  });
});
