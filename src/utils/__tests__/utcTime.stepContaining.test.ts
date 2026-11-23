import { describe, it, expect } from 'vitest';
import { utcStepContaining, utcTimeTicks } from '../utcTime';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('utcStepContaining', () => {
  it('selects the week, on a two-month span, between two of the axis ticks', () => {
    const spanStart = Date.UTC(2026, 6, 9);
    const spanEnd = spanStart + 69 * DAY;
    const step = utcStepContaining(Date.UTC(2026, 6, 29, 14), spanStart, spanEnd);

    expect(new Date(step.start).toISOString()).toBe('2026-07-27T00:00:00.000Z');
    expect(step.end - step.start).toBe(7 * DAY);
    const ticks = utcTimeTicks(spanStart, spanEnd).map((t) => t.at);
    expect(ticks).toContain(step.start);
    expect(ticks).toContain(step.end);
  });

  it('selects three hours on a day-long span, where the axis ticks every three hours', () => {
    const spanStart = Date.UTC(2026, 6, 27);
    const step = utcStepContaining(Date.UTC(2026, 6, 27, 19, 24), spanStart, spanStart + DAY);
    expect(step).toEqual({ start: Date.UTC(2026, 6, 27, 18), end: Date.UTC(2026, 6, 27, 21) });
  });

  it('selects a whole hour on a span of a few hours', () => {
    const spanStart = Date.UTC(2026, 6, 27, 6);
    expect(utcStepContaining(Date.UTC(2026, 6, 27, 9, 24), spanStart, spanStart + 10 * HOUR))
      .toEqual({ start: Date.UTC(2026, 6, 27, 9), end: Date.UTC(2026, 6, 27, 10) });
  });

  it('selects calendar months and years on longer spans', () => {
    expect(utcStepContaining(Date.UTC(2027, 4, 15), Date.UTC(2026, 0, 1), Date.UTC(2028, 0, 1)))
      .toEqual({ start: Date.UTC(2027, 3, 1), end: Date.UTC(2027, 6, 1) });
    expect(utcStepContaining(Date.UTC(2013, 5, 1), Date.UTC(1990, 0, 1), Date.UTC(2030, 0, 1)))
      .toEqual({ start: Date.UTC(2010, 0, 1), end: Date.UTC(2015, 0, 1) });
  });

  it('selects the UTC day when there is no span to take a step from', () => {
    expect(utcStepContaining(Date.UTC(2026, 6, 27, 21, 24), 0, 0))
      .toEqual({ start: Date.UTC(2026, 6, 27), end: Date.UTC(2026, 6, 28) });
  });
});
