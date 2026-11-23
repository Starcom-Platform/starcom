import { describe, it, expect } from 'vitest';
import { describeRecordTime, markerRecordTime, overlapsWindow, reportTime } from '../recordTime';

const DAY = 86_400_000;
const written = new Date('2026-09-12T08:00:00Z');
const window = (from: string | number, to: string | number) => ({ start: new Date(from), end: new Date(to) });

describe('reportTime', () => {
  it('places a report by when its event happened', () => {
    expect(reportTime({ startDate: new Date('2026-07-27T21:24:00Z'), timePrecisionMs: 60_000, updatedAt: written, createdAt: written }))
      .toEqual({ basis: 'event', start: Date.parse('2026-07-27T21:24:00Z'), precisionMs: 60_000 });
  });

  it('falls back to when it was written, and says so', () => {
    expect(reportTime({ updatedAt: written, createdAt: new Date(0) })).toEqual({ basis: 'written', start: written.getTime() });
  });

  it('keeps a stated end only when it comes after the start', () => {
    const start = new Date('2026-07-27T00:00:00Z');
    expect(reportTime({ startDate: start, endDate: new Date('2026-07-29T00:00:00Z'), createdAt: written })?.statedEnd)
      .toBe(Date.parse('2026-07-29T00:00:00Z'));
    expect(reportTime({ startDate: start, endDate: new Date('2026-07-20T00:00:00Z'), createdAt: written })?.statedEnd).toBeUndefined();
  });

  it('falls back past an event time that cannot be read', () => {
    expect(reportTime({ startDate: new Date('not a date'), createdAt: written })?.basis).toBe('written');
  });

  it('has no time when neither can be read', () => {
    expect(reportTime({ createdAt: new Date('not a date') })).toBeNull();
  });
});

describe('overlapsWindow', () => {
  it('takes an event known to a day as the whole of that day', () => {
    const day = reportTime({ startDate: new Date('2026-07-27T00:00:00Z'), timePrecisionMs: DAY, createdAt: written })!;
    expect(overlapsWindow(day, window('2026-07-27T18:00:00Z', '2026-07-27T19:00:00Z'))).toBe(true);
    expect(overlapsWindow(day, window('2026-07-28T00:00:00Z', '2026-07-28T01:00:00Z'))).toBe(false);
  });

  it('takes an event with no stated precision as a day wide, as observations do', () => {
    const at = Date.parse('2026-07-27T21:24:00Z');
    const time = reportTime({ startDate: new Date(at), createdAt: written })!;
    expect(overlapsWindow(time, window(at + DAY - 1, at + DAY + 60_000))).toBe(true);
    expect(overlapsWindow(time, window(at + DAY, at + DAY + 60_000))).toBe(false);
  });

  it('matches a span by any part of it', () => {
    const span = reportTime({
      startDate: new Date('2026-07-01T00:00:00Z'), endDate: new Date('2026-07-10T00:00:00Z'), timePrecisionMs: DAY, createdAt: written,
    })!;
    expect(overlapsWindow(span, window('2026-07-10T18:00:00Z', '2026-07-10T19:00:00Z'))).toBe(true);
    expect(overlapsWindow(span, window('2026-06-30T00:00:00Z', '2026-06-30T23:00:00Z'))).toBe(false);
    expect(overlapsWindow(span, window('2026-07-11T00:00:00Z', '2026-07-11T01:00:00Z'))).toBe(false);
  });

  it('takes a written time as the instant it names', () => {
    const time = reportTime({ createdAt: written })!;
    expect(overlapsWindow(time, window('2026-09-12T08:00:00Z', '2026-09-12T09:00:00Z'))).toBe(true);
    expect(overlapsWindow(time, window('2026-09-12T08:00:00.001Z', '2026-09-12T09:00:00Z'))).toBe(false);
  });
});

describe('describeRecordTime', () => {
  it('names an event time as when it happened, as closely as it is known', () => {
    expect(describeRecordTime({ basis: 'event', start: Date.UTC(2026, 6, 27), precisionMs: DAY })).toEqual({ label: 'Happened', text: '27 Jul 2026' });
  });

  it('names a fallback as when it was written, and says no event time was stated', () => {
    expect(describeRecordTime({ basis: 'written', start: Date.UTC(2026, 8, 14, 9, 5) }))
      .toEqual({ label: 'Written', text: '14 Sep 2026 09:05Z (no stated event time)' });
  });
});

describe('markerRecordTime', () => {
  it('reads the time a marker says placed it, and nothing from a marker that does not say', () => {
    expect(markerRecordTime({ timestamp: 5, timeBasis: 'event', timeEndMs: 9, timePrecisionMs: 2 }))
      .toEqual({ basis: 'event', start: 5, statedEnd: 9, precisionMs: 2 });
    expect(markerRecordTime({ timestamp: 5 })).toBeNull();
  });
});
