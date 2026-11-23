/**
 * Which time places a record, and the stretch of time it covers (decision D-E,
 * docs/missions/01-architecture-decisions/time-model.md).
 *
 * A record is placed by when its event happened: a report's startDate to endDate,
 * an intel item's eventDate to eventEndDate. Only when no event time was given
 * does it fall back to when the record was written (updatedAt ?? createdAt), and
 * then
 * `basis` says 'written', so every surface that places records by time can count
 * the fallback and say so.
 *
 * Each stated event time is the start of a window timePrecisionMs wide
 * (utils/eventTime.ts). An event time with no stated precision is taken as a day
 * wide, as observations take theirs (SourceObservation.timePrecisionMs). A written
 * time is an instant: a record knows exactly when it was written.
 */
import { DEFAULT_TIME_PRECISION_MS } from '../../types/intel/SourceObservation';
import { formatEventTime } from '../../utils/eventTime';
import { formatUtcDateTime } from '../../utils/utcTime';
import { notStated } from '../epistemic/epistemicLanguage';

export type TimeBasis = 'event' | 'written';

export interface RecordTime {
  basis: TimeBasis;
  /** Where the record starts in time, in ms. */
  start: number;
  /** Where its stated end starts, in ms, when the event was a span. */
  statedEnd?: number;
  /** How closely an event time is known, in ms, when that was stated. */
  precisionMs?: number;
}

type Moment = Date | string | number | undefined | null;

const toMs = (value: Moment): number | null => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

function placed(eventStart: Moment, eventEnd: Moment, precisionMs: number | undefined, written: Moment): RecordTime | null {
  const start = toMs(eventStart);
  if (start !== null) {
    const end = toMs(eventEnd);
    return {
      basis: 'event',
      start,
      ...(end !== null && end > start ? { statedEnd: end } : {}),
      ...(typeof precisionMs === 'number' && precisionMs > 0 ? { precisionMs } : {}),
    };
  }
  const at = toMs(written);
  return at === null ? null : { basis: 'written', start: at };
}

/** A report's time: its event, or when it was written. Null when neither can be read. */
export const reportTime = (report: {
  startDate?: Moment;
  endDate?: Moment;
  timePrecisionMs?: number;
  updatedAt?: Moment;
  createdAt?: Moment;
}): RecordTime | null =>
  placed(report.startDate, report.endDate, report.timePrecisionMs, report.updatedAt ?? report.createdAt);

/** An intel item's time: its event date, or when it was written. Null when neither can be read. */
export const intelItemTime = (item: {
  eventDate?: Moment;
  eventEndDate?: Moment;
  updatedAt?: Moment;
  createdAt?: Moment;
}): RecordTime | null =>
  placed(item.eventDate, item.eventEndDate, undefined, item.updatedAt ?? item.createdAt);

/**
 * A vault file's time, from its frontmatter: the event its report states
 * (startDate, endDate, timePrecisionMs) or its item states (eventDate,
 * eventEndDate); else when the record was written, as its frontmatter
 * `timestamp` says; else when the file itself was last written. Null when none
 * can be read. IntelWeb placed every node by the file's modification time, and a
 * vault built from the workspace stamps every file with the moment it was built.
 */
export const frontmatterTime = (
  frontmatter: Record<string, unknown> | undefined,
  fileModifiedAt?: string
): RecordTime | null => {
  const fm = frontmatter ?? {};
  const written = toMs(fm.timestamp as Moment) !== null ? (fm.timestamp as Moment) : fileModifiedAt;
  return placed(
    (fm.startDate ?? fm.eventDate) as Moment,
    (fm.endDate ?? fm.eventEndDate) as Moment,
    typeof fm.timePrecisionMs === 'number' ? fm.timePrecisionMs : undefined,
    written
  );
};

/** The fields a graph node carries for its time. */
export const nodeTimeFields = (
  time: RecordTime | null
): { timestamp?: Date; timeBasis?: TimeBasis; timeEndMs?: number; timePrecisionMs?: number } =>
  time
    ? {
        timestamp: new Date(time.start),
        timeBasis: time.basis,
        ...(time.statedEnd !== undefined ? { timeEndMs: time.statedEnd } : {}),
        ...(time.precisionMs !== undefined ? { timePrecisionMs: time.precisionMs } : {}),
      }
    : {};


/**
 * How wide the window each stated time starts is, in ms: as stated, or a day when
 * no precision was stated, as observations take theirs. A time a record was
 * written is an instant. Matching a window and drawing the timeline use this one
 * width (decision D-E).
 */
export function precisionWidthMs(time: RecordTime): number {
  return time.basis === 'event' ? time.precisionMs ?? DEFAULT_TIME_PRECISION_MS : 0;
}

/** The last moment a record may cover, in ms: its stated end, or its start, widened by how closely that is known. */
function lastMoment(time: RecordTime): number {
  const end = time.statedEnd ?? time.start;
  return time.basis === 'event' ? end + precisionWidthMs(time) - 1 : end;
}

/** Whether a record falls in a window: by overlap, the rule marksWithinWindow uses. */
export function overlapsWindow(time: RecordTime, window: { start: Date | number; end: Date | number }): boolean {
  const start = typeof window.start === 'number' ? window.start : window.start.getTime();
  const end = typeof window.end === 'number' ? window.end : window.end.getTime();
  return time.start <= end && lastMoment(time) >= start;
}

/**
 * A record's own time line: "Happened" and when, or "Written" and when with the
 * absence stated, so no date on screen can be read as the other.
 */
export function describeRecordTime(time: RecordTime): { label: 'Happened' | 'Written'; text: string } {
  if (time.basis === 'event') {
    const text = formatEventTime({
      startDate: new Date(time.start),
      endDate: time.statedEnd === undefined ? undefined : new Date(time.statedEnd),
      timePrecisionMs: time.precisionMs,
    });
    return { label: 'Happened', text: text ?? formatUtcDateTime(time.start, { year: true }) };
  }
  return { label: 'Written', text: `${formatUtcDateTime(time.start, { year: true })} (${notStated('event time')})` };
}

/**
 * The time a globe marker or a graph node says placed it, or null when its
 * producer does not say.
 */
export function markerRecordTime(marker: {
  timestamp?: number | Date;
  timeBasis?: TimeBasis;
  timeEndMs?: number;
  timePrecisionMs?: number;
}): RecordTime | null {
  const start = toMs(marker.timestamp);
  if (!marker.timeBasis || start === null) return null;
  return {
    basis: marker.timeBasis,
    start,
    ...(marker.timeEndMs !== undefined ? { statedEnd: marker.timeEndMs } : {}),
    ...(marker.timePrecisionMs !== undefined ? { precisionMs: marker.timePrecisionMs } : {}),
  };
}

/**
 * When this app came to hold its copy of a report — a THIRD kind of time.
 *
 * Distinct from both of the two this module already settles. `createdAt` is the
 * event's own `created_at`: when its author wrote it. `reportTime` decides where
 * a mark SITS, at its event time or its written time, and says which
 * (decision D-E). This is neither: it is when we received it, and it is only
 * ever used for what a label says. Nothing places a mark by it.
 *
 * `IntelReportService.importReport` APPENDS an `IMPORTED` history entry on every
 * import, including the overwrite a live report performs — so the LATEST one is
 * the most recent receipt. That is what lets a mark hydrated from storage stop
 * being stale the moment the same report arrives live, with no flag to keep in
 * step (decision D-F, step 4.4).
 *
 * A report the person wrote here was never received, so this says nothing for
 * it. It used to fall back to when the report was made, which drew the person's
 * own report faded, as from an earlier session, from the next session on and
 * for good: no live copy ever replaces it (plan item 9.5).
 */
export function reportReceivedAtMs(report: {
  history?: unknown;
} | null | undefined): number | null {
  const asMs = (value: unknown): number | null => {
    if (value === undefined || value === null) return null;
    const ms = value instanceof Date ? value.getTime() : new Date(value as string).getTime();
    return Number.isFinite(ms) ? ms : null;
  };
  const history = Array.isArray(report?.history) ? report.history : [];
  let latest: number | null = null;
  for (const entry of history) {
    if ((entry as { action?: string })?.action !== 'IMPORTED') continue;
    const at = asMs((entry as { timestamp?: unknown }).timestamp);
    if (at === null) continue;
    if (latest === null || at > latest) latest = at;
  }
  return latest;
}
