/**
 * The lab's exploration (D-PW, PW94, PW95): the open record without the held-back years (PW75), windows wholly inside
 * it, the events they hold counted once, and the same windows under seeded time shifts.
 */
import { describe, it, expect } from 'vitest';
import { explore, histogram, openSpans } from '../labExplore';
import type { EventSet } from '../../timestream/eventSets';

const DAY = 86_400_000;
const T0 = Date.UTC(1940, 0, 1);

/** A storms set from 1940 for `days` days, an event every `every` days. */
const storms = (days: number, every: number): EventSet => {
  const ms: number[] = [];
  for (let d = 0; d < days; d += every) ms.push(T0 + d * DAY + 6 * 3_600_000);
  return { id: 'storms', ms: Float64Array.from(ms), fromMs: T0, untilMs: T0 + (days - 1) * DAY, lat: null, lon: null, zone: null, zones: [], licence: '', credit: '' };
};

describe('openSpans', () => {
  it("leaves out the years held back for the storms' sealed tests, 1966 to 2025", () => {
    expect(openSpans({ id: 'storms', fromMs: Date.UTC(1932, 0, 1), untilMs: Date.UTC(2026, 2, 1) })).toEqual([
      { fromMs: Date.UTC(1932, 0, 1), untilMs: Date.UTC(1966, 0, 1) },
      { fromMs: Date.UTC(2026, 0, 1), untilMs: Date.UTC(2026, 2, 2) },
    ]);
  });
});

describe('explore', () => {
  const set = storms(1000, 10);
  it('counts the events the windows hold, each once, and leaves out a window past the record', () => {
    // Two overlapping windows round day 100 and one round day 500; one past the record's end.
    const moments = [T0 + 100 * DAY, T0 + 102 * DAY, T0 + 500 * DAY, T0 + 999 * DAY + 12 * 3_600_000];
    const e = explore(set, moments, { before: 1, after: 3, unit: 'day' });
    expect(e.moments).toBe(4);
    expect(e.windows).toBe(3);
    expect(e.leftOut).toBe(1);
    // Day 100's event (its 6 a.m.) is inside both of the first two windows; day 500's inside the third.
    expect(e.observed).toBe(2);
  });

  it('draws the same shifts each time, a thousand of them, about what windows that long hold anywhere', () => {
    const moments = Array.from({ length: 50 }, (_, i) => T0 + (15 + i * 19) * DAY);
    const a = explore(set, moments, { before: 2, after: 2, unit: 'day' });
    const b = explore(set, moments, { before: 2, after: 2, unit: 'day' });
    expect(a.shifted).toHaveLength(1000);
    expect(a.shifted).toEqual(b.shifted);
    // An event every 10 days, 50 windows of 4 days: about 20 on average.
    expect(a.usual).toBeGreaterThan(17);
    expect(a.usual).toBeLessThan(23);
  });

  it('counts nothing in the held-back years', () => {
    const late: EventSet = { ...storms(1, 1), fromMs: Date.UTC(1960, 0, 1), untilMs: Date.UTC(1970, 0, 1), ms: Float64Array.from([Date.UTC(1967, 5, 1)]) };
    const e = explore(late, [Date.UTC(1967, 5, 1)], { before: 1, after: 1, unit: 'day' });
    expect(e.windows).toBe(0);
    expect(e.leftOut).toBe(1);
    expect(e.observed).toBe(0);
  });
});

describe('histogram', () => {
  it('bins the shifted counts from the least to the most, the observed among them', () => {
    const h = histogram([3, 4, 4, 5], 9, 24);
    expect(h.from).toBe(3);
    expect(h.counts.reduce((n, c) => n + c, 0)).toBe(4);
    expect(h.from + h.counts.length * h.step - 1).toBeGreaterThanOrEqual(9);
  });
});
