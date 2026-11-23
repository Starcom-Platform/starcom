/**
 * The windows Raver Watch offers on the shared timeline (the owner's decision
 * of 2026-10-01: the timeline reaches forward, so Tonight and This weekend can
 * be looked at before they happen).
 *
 * Tonight is the next twelve hours, as Mecha Jono's "Tonight" card counts it.
 * This weekend is Friday 00:00 to Monday 06:00 in each event's own time zone
 * (raver-nights.md, RN11; the owner chose that its window span every zone's,
 * RN11a), from now once it has begun. Each is a window in ms since the epoch,
 * for TemporalContext's setTimeWindow; the timeline marks every time in UTC.
 */
export interface TimeWindowMs { start: number; end: number }

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function tonight(nowMs: number): TimeWindowMs {
  return { start: nowMs, end: nowMs + 12 * HOUR };
}

export function nextDays(nowMs: number, days: number): TimeWindowMs {
  return { start: nowMs, end: nowMs + days * DAY };
}

/** Where Friday comes first, UTC+14, and where Monday 06:00 comes last, UTC−12. */
const FIRST_ZONE = 14 * HOUR;
const LAST_ZONE = 12 * HOUR;
/** From a Friday's 00:00Z: the window's start and end. */
const SPAN_START = -FIRST_ZONE;
const SPAN_END = 3 * DAY + 6 * HOUR + LAST_ZONE;

/**
 * This weekend: every zone's Friday 00:00 to Monday 06:00 (raver-nights.md,
 * RN11a), Thursday 10:00Z to Monday 18:00Z, the same wherever the viewer is,
 * from now once it has begun. A scene event in it counts only when it starts
 * in its own town's weekend (ownWeekend).
 */
export function thisWeekend(nowMs: number): TimeWindowMs {
  const midnight = Math.floor(nowMs / DAY) * DAY;
  const daysSinceFriday = (new Date(midnight).getUTCDay() + 2) % 7; // Friday 0, Saturday 1, Sunday 2, Monday 3 …
  let friday = midnight - daysSinceFriday * DAY;
  // Past Monday 18:00Z: every zone has left it, so the next.
  if (nowMs >= friday + SPAN_END) friday += 7 * DAY;
  return { start: Math.max(friday + SPAN_START, nowMs), end: friday + SPAN_END };
}

/**
 * The Friday, at 00:00Z, whose weekend a window is, or null when it is not
 * one: it ends at that weekend's end and starts inside it, as thisWeekend sets
 * it, whoever set it (this panel, or a share handle).
 */
export function weekendFridayOf(window: TimeWindowMs): number | null {
  const friday = window.end - SPAN_END;
  if (friday % DAY !== 0 || new Date(friday).getUTCDay() !== 5) return null;
  return window.start >= friday + SPAN_START && window.start < window.end ? friday : null;
}

const zoneFormats = new Map<string, Intl.DateTimeFormat | null>();
/** A zone's clock, or null for a zone this browser does not know. */
function zoneFormat(zone: string): Intl.DateTimeFormat | null {
  if (!zoneFormats.has(zone)) {
    try {
      zoneFormats.set(zone, new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
      }));
    } catch {
      zoneFormats.set(zone, null);
    }
  }
  return zoneFormats.get(zone)!;
}

/** How far a zone's clock is ahead of UTC at a moment, in ms. */
function zoneAhead(format: Intl.DateTimeFormat, atMs: number): number {
  const part = (type: string) => Number(format.formatToParts(atMs).find((p) => p.type === type)?.value ?? 0);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')) - (atMs - (atMs % 1000));
}

/** The moment a zone's clock shows a wall time, given as if it were UTC: asked twice, for a change of the clocks between. */
function wallToUtc(format: Intl.DateTimeFormat, wallMs: number): number {
  const guess = wallMs - zoneAhead(format, wallMs);
  return wallMs - zoneAhead(format, guess);
}

const ownWeekends = new Map<string, TimeWindowMs | null>();
/**
 * A zone's own weekend for a Friday (00:00Z of its date): Friday 00:00 to
 * Monday 06:00 there, in ms. Null for a zone this browser does not know.
 */
export function ownWeekend(fridayMs: number, zone: string): TimeWindowMs | null {
  const key = `${fridayMs}|${zone}`;
  if (!ownWeekends.has(key)) {
    const format = zoneFormat(zone);
    ownWeekends.set(key, format ? { start: wallToUtc(format, fridayMs), end: wallToUtc(format, fridayMs + 3 * DAY + 6 * HOUR) } : null);
  }
  return ownWeekends.get(key)!;
}
