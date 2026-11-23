/**
 * What the timeline's events add up to: the dates they span, and their counts.
 *
 * Every view of the timeline derives these from the one shared read of events
 * (useTimelineData) through these functions, so no two views disagree about how
 * many events there are or which dates they cover (decision D-E,
 * docs/missions/01-architecture-decisions/time-model.md). The scrubber padded its
 * range by at least a day and the timeline by at least an hour, so the same events
 * spanned different dates in each.
 */
import type { TimelineItem, TimelineStats } from '../adapters/timelineAdapter';

/** Each side gets a tenth of the span, and never less than an hour. */
export const TIMELINE_MIN_PADDING_MS = 60 * 60 * 1000;

function timeOf(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * From a little before the first event to a little after the last one ends, or null
 * when no event has a time that can be read. Null is not an empty range: there is no
 * range. It ran to the last start, so the timeline cut off a bar that ended later
 * (decision D-E). An end counts only after its own start, as a record's does.
 */
export function timelineSpan(
  items: ReadonlyArray<{ startTime: Date | string; endTime?: Date | string }>
): { start: number; end: number } | null {
  // A loop, not Math.min(...times): a spread call fails on a large enough list.
  let min = Infinity;
  let max = -Infinity;
  for (const item of items) {
    const t = timeOf(item.startTime);
    if (Number.isNaN(t)) continue;
    const end = item.endTime === undefined ? Number.NaN : timeOf(item.endTime);
    const last = end > t ? end : t;
    if (t < min) min = t;
    if (last > max) max = last;
  }
  if (min === Infinity) return null;
  const padding = Math.max((max - min) * 0.1, TIMELINE_MIN_PADDING_MS);
  return { start: min - padding, end: max + padding };
}

/**
 * Counts by type, by UTC month and by importance. An event whose time cannot be read
 * is counted, in no month; it used to throw and fail the whole count.
 */
export function timelineStats(items: ReadonlyArray<TimelineItem>): TimelineStats {
  const eventsByType: Record<string, number> = {};
  const eventsByMonth: Record<string, number> = {};
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const item of items) {
    eventsByType[item.type] = (eventsByType[item.type] || 0) + 1;

    const t = timeOf(item.startTime);
    if (!Number.isNaN(t)) {
      const month = new Date(t).toISOString().slice(0, 7); // YYYY-MM
      eventsByMonth[month] = (eventsByMonth[month] || 0) + 1;
    }

    if (item.importance >= 70) high++;
    else if (item.importance >= 30) medium++;
    else low++;
  }

  return {
    totalEvents: items.length,
    eventsByType,
    eventsByMonth,
    eventsImportance: { high, medium, low },
  };
}
