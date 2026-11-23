/**
 * When a reported event happened: what the composer asks, what a report stores,
 * and how it reads back (decision D-E,
 * docs/missions/01-architecture-decisions/time-model.md).
 *
 * A report stores `startDate`, an optional `endDate`, and `timePrecisionMs`, how
 * closely they are known. Each stated time is the start of a window that wide,
 * and the moment falls somewhere inside it: 27 Jul with the time unknown is
 * stored as 27 Jul 00:00Z known to a day, which is the whole of that UTC day and
 * not its midnight. Observations use the same field the same way
 * (SourceObservation.timePrecisionMs, ucdpAdapter).
 *
 * Times are entered and shown in UTC. Month and year windows follow the
 * calendar, so February 2028 is 29 days wide.
 */
import { en, type Messages } from '../i18n/app/en';
import { utcDateIn, utcDateTimeIn, utcMonthIn } from '../i18n/app/dates';
import { countedIn } from '../i18n/app/plain';
import { interpolate } from '../i18n/messages';
import type { LanguageId } from '../i18n/app/languages';

/** The words an event time is said in (D-ML, L3): a screen in another language hands its own in. */
type EventTimeWords = Messages['eventTime'];

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export type EventTimePrecision = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export const EVENT_TIME_PRECISIONS: readonly EventTimePrecision[] = ['minute', 'hour', 'day', 'week', 'month', 'year'];


/** Whether a time of day means anything at this precision. */
export const precisionHasTime = (precision: EventTimePrecision): boolean =>
  precision === 'minute' || precision === 'hour';

/** What the composer holds: plain UTC strings, as date and time inputs give them. */
export interface EventTimeFields {
  /** YYYY-MM-DD, or empty. */
  startDate: string;
  /** HH:MM, or empty. */
  startTime: string;
  endDate: string;
  endTime: string;
  precision: EventTimePrecision;
}

export const EMPTY_EVENT_TIME_FIELDS: EventTimeFields = {
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  precision: 'minute',
};

/** What a report stores. */
export interface EventTime {
  startDate?: Date;
  endDate?: Date;
  timePrecisionMs?: number;
}

/** A stored precision, if it is one: a finite, positive number of milliseconds. */
export function readTimePrecisionMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** The window a moment falls in at a precision: where it starts, and how wide it is. */
export function precisionWindow(at: number, precision: EventTimePrecision): { start: number; widthMs: number } {
  const floorTo = (unit: number) => Math.floor(at / unit) * unit;
  const d = new Date(at);
  switch (precision) {
    case 'minute':
      return { start: floorTo(MINUTE), widthMs: MINUTE };
    case 'hour':
      return { start: floorTo(HOUR), widthMs: HOUR };
    case 'day':
      return { start: floorTo(DAY), widthMs: DAY };
    case 'week':
      return { start: floorTo(DAY), widthMs: WEEK };
    case 'month': {
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      return { start, widthMs: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - start };
    }
    case 'year': {
      const start = Date.UTC(d.getUTCFullYear(), 0, 1);
      return { start, widthMs: Date.UTC(d.getUTCFullYear() + 1, 0, 1) - start };
    }
  }
}

/**
 * The precision a stored window reads as: its width, starting where that
 * precision starts. Undefined when it is none of them, or not stated.
 */
export function precisionOf(widthMs: number | undefined, at: number): EventTimePrecision | undefined {
  if (widthMs === undefined) return undefined;
  return EVENT_TIME_PRECISIONS.find((precision) => {
    const window = precisionWindow(at, precision);
    return window.start === at && window.widthMs === widthMs;
  });
}

/**
 * The UTC moment a date field (YYYY-MM-DD) and an optional time field (HH:MM)
 * name, or null when they name no moment that exists.
 */
export function utcMoment(date: string, time: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]) - 1, Number(d[3])];
  let hours = 0;
  let minutes = 0;
  if (time) {
    const t = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
    if (!t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
    [hours, minutes] = [Number(t[1]), Number(t[2])];
  }
  // setUTCFullYear, because Date.UTC reads years 0 to 99 as 1900 to 1999.
  const moment = new Date(Date.UTC(2000, month, day, hours, minutes));
  moment.setUTCFullYear(year, month, day);
  // A date that does not exist, 30 Feb, rolls over into the next month.
  if (moment.getUTCFullYear() !== year || moment.getUTCMonth() !== month || moment.getUTCDate() !== day) return null;
  return moment.getTime();
}

/**
 * What the composer's fields record. Nothing, when no date was given. A time of
 * day counts only at a precision that has one, and a date without a time is
 * known to a day at best.
 */
export function eventTimeFromFields(fields: EventTimeFields, errors: EventTimeWords['errors'] = en.eventTime.errors): { value: EventTime; error?: string } {
  if (!fields.startDate) {
    return fields.endDate ? { value: {}, error: errors.startNeeded } : { value: {} };
  }
  const precision = precisionHasTime(fields.precision) && !fields.startTime ? 'day' : fields.precision;
  const withTime = precisionHasTime(precision);

  const start = utcMoment(fields.startDate, withTime ? fields.startTime : '');
  if (start === null) return { value: {}, error: errors.startMissing };
  const startWindow = precisionWindow(start, precision);

  let endDate: Date | undefined;
  if (fields.endDate) {
    if (withTime && !fields.endTime) return { value: {}, error: errors.endTimeNeeded };
    const end = utcMoment(fields.endDate, withTime ? fields.endTime : '');
    if (end === null) return { value: {}, error: errors.endMissing };
    const endWindow = precisionWindow(end, precision);
    if (endWindow.start < startWindow.start) return { value: {}, error: errors.endBeforeStart };
    endDate = new Date(endWindow.start);
  }

  return { value: { startDate: new Date(startWindow.start), endDate, timePrecisionMs: startWindow.widthMs } };
}

/** The composer's fields for a stored event time, so an edit starts from what is recorded. */
export function fieldsFromEventTime(eventTime: EventTime): EventTimeFields {
  if (!eventTime.startDate) return EMPTY_EVENT_TIME_FIELDS;
  const start = eventTime.startDate.getTime();
  const precision = precisionOf(eventTime.timePrecisionMs, start) ?? 'minute';
  const iso = (ms: number) => new Date(ms).toISOString();
  const time = (ms: number) => (precisionHasTime(precision) ? iso(ms).slice(11, 16) : '');
  const end = eventTime.endDate?.getTime();
  return {
    startDate: iso(start).slice(0, 10),
    startTime: time(start),
    endDate: end === undefined ? '' : iso(end).slice(0, 10),
    endTime: end === undefined ? '' : time(end),
    precision,
  };
}

function describeWidth(ms: number, lang: LanguageId, words: EventTimeWords): string {
  for (const [size, name] of [[DAY, words.days], [HOUR, words.hours], [MINUTE, words.minutes]] as const) {
    if (ms >= size) return countedIn(lang, name, Math.round(ms / size));
  }
  return countedIn(lang, words.seconds, Math.round(ms / SECOND));
}

/**
 * An event time as it is known: `27 Jul 2026 21:24Z`, `27 Jul 2026`, `Jul 2026`,
 * `2026`, or a span of two. Null when the report has none. In English unless a
 * language and its words are given; the time stays UTC, marked Z, in every one.
 */
export function formatEventTime(eventTime: EventTime, lang: LanguageId = 'en', words: EventTimeWords = en.eventTime): string | null {
  if (!eventTime.startDate) return null;
  const start = eventTime.startDate.getTime();
  const end = eventTime.endDate?.getTime();
  const width = eventTime.timePrecisionMs;
  const precision = precisionOf(width, start);

  const at = (ms: number): string => {
    switch (precision) {
      case 'year':
        return String(new Date(ms).getUTCFullYear());
      case 'month':
        return utcMonthIn(lang, ms);
      case 'week':
      case 'day':
        return utcDateIn(lang, ms, true);
      case 'hour':
      case 'minute':
        return utcDateTimeIn(lang, ms, true);
      default:
        return utcDateTimeIn(lang, ms, true, width !== undefined && width < MINUTE);
    }
  };

  const text = end !== undefined && end !== start ? `${at(start)} – ${at(end)}` : at(start);
  if (precision === 'hour') return interpolate(words.toTheHour, { when: text });
  if (precision === 'week') return interpolate(words.toTheWeek, { when: text });
  if (precision === undefined && width !== undefined && width >= MINUTE) return interpolate(words.toWithin, { when: text, width: describeWidth(width, lang, words) });
  return text;
}
