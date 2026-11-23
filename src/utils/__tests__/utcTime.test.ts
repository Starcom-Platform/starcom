import { describe, it, expect } from 'vitest';
import {
  formatUtcTime, formatUtcDate, formatUtcDateTime, formatUtcWindow, localTimeTitle, utcTimeTicks,
} from '../utcTime';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const BARE_TIME = /^\d{2}:\d{2}Z?$/;

describe('formatting a time', () => {
  const at = Date.UTC(2026, 6, 27, 21, 24, 5);

  it('prints UTC, marked Z, whatever the local zone', () => {
    expect(formatUtcTime(at)).toBe('21:24Z');
    expect(formatUtcTime(at, { seconds: true })).toBe('21:24:05Z');
    expect(formatUtcDate(at)).toBe('27 Jul');
    expect(formatUtcDate(at, { year: true })).toBe('27 Jul 2026');
    expect(formatUtcDateTime(at)).toBe('27 Jul 21:24Z');
    expect(formatUtcDateTime(at, { year: true })).toBe('27 Jul 2026 21:24Z');
  });

  it('uses the UTC date, not the local one, near midnight', () => {
    expect(formatUtcDateTime(Date.UTC(2026, 6, 27, 23, 59))).toBe('27 Jul 23:59Z');
    expect(formatUtcDateTime(Date.UTC(2026, 6, 28, 0, 1))).toBe('28 Jul 00:01Z');
  });

  it('offers the local time for a hover title, and says it is local', () => {
    expect(localTimeTitle(at)).toMatch(/^Local: /);
  });
});

describe('formatting a window', () => {
  it('dates both ends of a window that crosses midnight', () => {
    // It read "09:24Z – 09:24Z" for these twenty-four hours.
    expect(formatUtcWindow(Date.UTC(2026, 6, 27, 9, 24), Date.UTC(2026, 6, 28, 9, 24)))
      .toBe('27 Jul 09:24Z – 28 Jul 09:24Z');
  });

  it('gives the date once for a window within one day', () => {
    expect(formatUtcWindow(Date.UTC(2026, 6, 27, 9, 0), Date.UTC(2026, 6, 27, 11, 30)))
      .toBe('27 Jul 09:00Z – 11:30Z');
  });
});

describe('utcTimeTicks', () => {
  const increasingWithin = (ticks: { at: number }[], start: number, end: number) => {
    for (let i = 0; i < ticks.length; i++) {
      expect(ticks[i].at).toBeGreaterThanOrEqual(start);
      expect(ticks[i].at).toBeLessThanOrEqual(end);
      if (i > 0) expect(ticks[i].at).toBeGreaterThan(ticks[i - 1].at);
    }
  };

  it('labels a two-month span with dates, never a bare time of day', () => {
    // The HUD timeline printed "17:56, 13:51, 09:45…" across this span.
    const start = Date.UTC(2026, 6, 9);
    const end = start + 69 * DAY;
    const ticks = utcTimeTicks(start, end, 8);

    expect(ticks.length).toBeGreaterThanOrEqual(4);
    expect(ticks.length).toBeLessThanOrEqual(16);
    expect(ticks.some((t) => BARE_TIME.test(t.label))).toBe(false);
    increasingWithin(ticks, start, end);
  });

  it('puts weekly ticks on Mondays', () => {
    const start = Date.UTC(2026, 6, 9);
    const ticks = utcTimeTicks(start, start + 50 * DAY, 8);
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) {
      expect(new Date(t.at).getUTCDay()).toBe(1);
      expect(t.at % DAY).toBe(0);
    }
  });

  it('uses hours within a day, and names the day at midnight', () => {
    const start = Date.UTC(2026, 6, 27, 18, 10);
    const ticks = utcTimeTicks(start, start + 12 * HOUR, 6);

    for (const t of ticks) expect(t.at % HOUR).toBe(0);
    expect(ticks.find((t) => t.at === Date.UTC(2026, 6, 28))?.label).toBe('28 Jul');
    expect(ticks.filter((t) => t.at % DAY !== 0).every((t) => BARE_TIME.test(t.label))).toBe(true);
  });

  it('uses month starts for a span of months, naming the year at January', () => {
    const start = Date.UTC(2026, 9, 12);
    const ticks = utcTimeTicks(start, Date.UTC(2027, 3, 20), 6);

    for (const t of ticks) expect(new Date(t.at).getUTCDate()).toBe(1);
    expect(ticks.map((t) => t.label)).toContain('Jan 2027');
    expect(ticks.map((t) => t.label)).toContain('Nov');
  });

  it('uses whole seconds for a span of seconds, and labels them with seconds', () => {
    // IntelAnalyzer's seeded events fall within a few seconds of each other. With
    // minute steps that axis got no ticks at all.
    const start = Date.UTC(2026, 8, 14, 5, 12, 1, 400);
    const ticks = utcTimeTicks(start, start + 8_000, 5);

    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const t of ticks) {
      expect(t.at % 1000).toBe(0);
      expect(t.label).toMatch(/^\d{2}:\d{2}:\d{2}Z$/);
    }
  });

  it('uses year starts for a span of decades', () => {
    const ticks = utcTimeTicks(Date.UTC(1990, 5, 1), Date.UTC(2030, 5, 1), 8);
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) {
      expect(new Date(t.at).getUTCMonth()).toBe(0);
      expect(t.label).toMatch(/^\d{4}$/);
    }
  });

  it('stays close to the target count across spans from minutes to decades', () => {
    const start = Date.UTC(2026, 0, 1, 3, 17);
    for (const span of [20_000, 10 * MINUTE, 3 * HOUR, 2 * DAY, 20 * DAY, 400 * DAY, 30 * 365 * DAY]) {
      const ticks = utcTimeTicks(start, start + span, 8);
      expect(ticks.length).toBeGreaterThanOrEqual(3);
      expect(ticks.length).toBeLessThanOrEqual(16);
      increasingWithin(ticks, start, start + span);
    }
  });

  it('returns nothing for an empty, backwards or unreadable span', () => {
    expect(utcTimeTicks(5, 5)).toEqual([]);
    expect(utcTimeTicks(10, 5)).toEqual([]);
    expect(utcTimeTicks(Number.NaN, 5)).toEqual([]);
  });
});
