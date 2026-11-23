import { describe, it, expect } from 'vitest';
import {
  EMPTY_EVENT_TIME_FIELDS, eventTimeFromFields, fieldsFromEventTime, formatEventTime, precisionWindow,
  readTimePrecisionMs, type EventTimeFields,
} from '../eventTime';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const fields = (over: Partial<EventTimeFields>): EventTimeFields => ({ ...EMPTY_EVENT_TIME_FIELDS, ...over });
const iso = (d?: Date) => d?.toISOString();

describe('eventTimeFromFields', () => {
  it('records nothing when no date is given', () => {
    expect(eventTimeFromFields(EMPTY_EVENT_TIME_FIELDS)).toEqual({ value: {} });
  });

  it('reads the date and time as UTC, known to the minute', () => {
    const { value, error } = eventTimeFromFields(fields({ startDate: '2026-07-27', startTime: '21:24' }));
    expect(error).toBeUndefined();
    expect(iso(value.startDate)).toBe('2026-07-27T21:24:00.000Z');
    expect(value.timePrecisionMs).toBe(MINUTE);
  });

  it('records a date without a time as that whole day, not its midnight', () => {
    const { value } = eventTimeFromFields(fields({ startDate: '2026-07-27' }));
    expect(iso(value.startDate)).toBe('2026-07-27T00:00:00.000Z');
    expect(value.timePrecisionMs).toBe(DAY);
  });

  it('ignores a time of day at a precision that has none', () => {
    const { value } = eventTimeFromFields(fields({ startDate: '2026-07-27', startTime: '21:24', precision: 'day' }));
    expect(iso(value.startDate)).toBe('2026-07-27T00:00:00.000Z');
    expect(value.timePrecisionMs).toBe(DAY);
  });

  it('starts the window where the precision does', () => {
    const hour = eventTimeFromFields(fields({ startDate: '2026-07-27', startTime: '21:24', precision: 'hour' })).value;
    expect(iso(hour.startDate)).toBe('2026-07-27T21:00:00.000Z');
    expect(hour.timePrecisionMs).toBe(HOUR);
    const week = eventTimeFromFields(fields({ startDate: '2026-07-27', precision: 'week' })).value;
    expect(iso(week.startDate)).toBe('2026-07-27T00:00:00.000Z');
    expect(week.timePrecisionMs).toBe(7 * DAY);
  });

  it('follows the calendar for months and years', () => {
    const february = eventTimeFromFields(fields({ startDate: '2028-02-17', precision: 'month' })).value;
    expect(iso(february.startDate)).toBe('2028-02-01T00:00:00.000Z');
    expect(february.timePrecisionMs).toBe(29 * DAY);
    const year = eventTimeFromFields(fields({ startDate: '2028-06-01', precision: 'year' })).value;
    expect(iso(year.startDate)).toBe('2028-01-01T00:00:00.000Z');
    expect(year.timePrecisionMs).toBe(366 * DAY);
  });

  it('places years before 100 in those years, not in the 1900s', () => {
    expect(iso(eventTimeFromFields(fields({ startDate: '0079-08-24' })).value.startDate)).toBe('0079-08-24T00:00:00.000Z');
  });

  it('records an end at the same precision', () => {
    const { value } = eventTimeFromFields(fields({ startDate: '2026-07-27', endDate: '2026-07-29', precision: 'day' }));
    expect(iso(value.endDate)).toBe('2026-07-29T00:00:00.000Z');
    expect(value.timePrecisionMs).toBe(DAY);
  });

  it('refuses an end before the start, a date that does not exist, and an end without a start', () => {
    expect(eventTimeFromFields(fields({ startDate: '2026-07-27', endDate: '2026-07-26', precision: 'day' })).error).toMatch(/before the start/);
    expect(eventTimeFromFields(fields({ startDate: '2026-02-30' })).error).toMatch(/not a date/);
    expect(eventTimeFromFields(fields({ startDate: '2026-07-27', startTime: '24:10' })).error).toMatch(/not a date/);
    expect(eventTimeFromFields(fields({ endDate: '2026-07-29' })).error).toMatch(/start date/);
  });

  it('asks for an end time when the start has one', () => {
    expect(eventTimeFromFields(fields({ startDate: '2026-07-27', startTime: '21:24', endDate: '2026-07-28' })).error).toMatch(/end time/);
  });
});

describe('precisionWindow', () => {
  it('floors moments before 1970 as well as after', () => {
    expect(precisionWindow(Date.UTC(1969, 11, 31, 13, 5), 'day')).toEqual({ start: Date.UTC(1969, 11, 31), widthMs: DAY });
  });
});

describe('readTimePrecisionMs', () => {
  it('keeps a positive finite width and drops anything else', () => {
    expect(readTimePrecisionMs(DAY)).toBe(DAY);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '86400000', null, undefined]) {
      expect(readTimePrecisionMs(bad)).toBeUndefined();
    }
  });
});

describe('formatEventTime', () => {
  const show = (over: Partial<EventTimeFields>) => formatEventTime(eventTimeFromFields(fields(over)).value);

  it('says nothing when there is no event time', () => {
    expect(formatEventTime({})).toBeNull();
  });

  it('shows each precision as what is known', () => {
    expect(show({ startDate: '2026-07-27', startTime: '21:24' })).toBe('27 Jul 2026 21:24Z');
    expect(show({ startDate: '2026-07-27', startTime: '21:24', precision: 'hour' })).toBe('27 Jul 2026 21:00Z, to the hour');
    expect(show({ startDate: '2026-07-27' })).toBe('27 Jul 2026');
    expect(show({ startDate: '2026-07-27', precision: 'week' })).toBe('27 Jul 2026, to the week');
    expect(show({ startDate: '2026-07-27', precision: 'month' })).toBe('Jul 2026');
    expect(show({ startDate: '2026-07-27', precision: 'year' })).toBe('2026');
  });

  it('shows a span as its two ends', () => {
    expect(show({ startDate: '2026-07-27', endDate: '2026-07-29', precision: 'day' })).toBe('27 Jul 2026 – 29 Jul 2026');
  });

  it('shows a width that is no named precision as a width', () => {
    const start = new Date(Date.UTC(2026, 6, 27, 21, 24, 5));
    expect(formatEventTime({ startDate: start, timePrecisionMs: 1000 })).toBe('27 Jul 2026 21:24:05Z');
    expect(formatEventTime({ startDate: start, timePrecisionMs: 3 * DAY })).toBe('27 Jul 2026 21:24Z, to within 3 days');
  });

  it('does not call a window a month unless it starts where a month does', () => {
    expect(formatEventTime({ startDate: new Date(Date.UTC(2026, 6, 15)), timePrecisionMs: 31 * DAY })).toBe('15 Jul 2026 00:00Z, to within 31 days');
  });
});

describe('fieldsFromEventTime', () => {
  it('gives back the fields an event time was recorded from', () => {
    for (const recorded of [
      fields({ startDate: '2026-07-27', startTime: '21:24', endDate: '2026-07-28', endTime: '03:10' }),
      fields({ startDate: '2026-07-27', endDate: '2026-07-29', precision: 'day' }),
      fields({ startDate: '2026-07-01', precision: 'month' }),
    ]) {
      expect(fieldsFromEventTime(eventTimeFromFields(recorded).value)).toEqual(recorded);
    }
  });

  it('starts empty for a report with no event time', () => {
    expect(fieldsFromEventTime({})).toEqual(EMPTY_EVENT_TIME_FIELDS);
  });
});
