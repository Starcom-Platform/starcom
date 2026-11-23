/**
 * The Moon's lane past a few months (decision D-PW, PW51): new and full moons a synodic month apart, then the
 * eclipses alone, each its kind, where they fell: the total lunar eclipse of 3 March 2026, the total solar eclipse of
 * 12 August 2026 over Iceland and Spain, the annular of 6 February 2027.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { anglesPlain, moonForm, moonMarks } from '../moonMarks';

const DAY = 86_400_000;
const YEAR = 365.25 * DAY;
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe('the Moon\'s marks', () => {
  it('keeps the lane to four months, then new and full moons, then eclipses past three years; the angles plain past two months', () => {
    expect([moonForm(30 * DAY), moonForm(122 * DAY), moonForm(YEAR), moonForm(10 * YEAR)]).toEqual(['lane', 'lane', 'phases', 'eclipses']);
    expect([anglesPlain(30 * DAY), anglesPlain(122 * DAY)]).toEqual([false, true]);
  });

  it('marks new and full moons in turn, a synodic month apart', () => {
    const marks = moonMarks({ startMs: Date.UTC(2026, 0, 1), spanMs: 180 * DAY }, 'phases');
    expect(marks.length).toBeGreaterThanOrEqual(11);
    marks.forEach((m, i) => { if (i) expect(m.kind).not.toBe(marks[i - 1].kind); });
    const fulls = marks.filter((m) => m.kind === 'full');
    expect((fulls[1].ms - fulls[0].ms) / DAY).toBeCloseTo(29.5, 0);
  });

  it('marks the eclipses where they fell, each its kind', () => {
    const marks = moonMarks({ startMs: Date.UTC(2026, 0, 1), spanMs: 2 * YEAR }, 'eclipses');
    const named = marks.map((m) => `${day(m.ms)} ${m.kind} ${m.sub}`);
    expect(named).toContain('2026-03-03 lunar total');
    expect(named).toContain('2026-08-12 solar total');
    expect(named).toContain('2027-02-06 solar annular');
    expect(moonMarks({ startMs: 0, spanMs: DAY }, 'lane')).toEqual([]);
  });
});
