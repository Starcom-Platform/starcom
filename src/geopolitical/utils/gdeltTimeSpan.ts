/**
 * The time a GDELT layer shows (D-E; decision D-DP, DP15). There is one shared time: in live mode a
 * layer filters nothing by time, so Diplomacy and Conflict Zones show their snapshot's whole day;
 * paused, the shared window decides. They each had a "Time Range" slider counting hours back from
 * the snapshot, a second cursor; it is gone.
 *
 * An event's time is when GDELT added it (DATEADDED), known to its fifteen-minute window: the only
 * time the snapshot keeps.
 */
import { gdeltStampToMs, type RealGdeltEvent } from '../../services/geopolitical/gdeltEventExport';

export interface TimeSpan { start: number; end: number }
/** The snapshot's day: the start of its oldest window, where kept, and its own time. */
export interface SnapshotDay { from: number | null; asOf: number | null }

const DAY_MS = 24 * 60 * 60 * 1000;

/** The span shown: the shared window when paused; otherwise the snapshot's day; nothing before it is read. */
export function gdeltSpanFor(window: TimeSpan | null, snapshot: SnapshotDay): TimeSpan | null {
  if (window) return window;
  if (snapshot.asOf === null) return null;
  return { start: snapshot.from ?? snapshot.asOf - DAY_MS, end: snapshot.asOf };
}

/** Whether GDELT added the event within the span, its ends included. */
export function withinSpan(event: Pick<RealGdeltEvent, 'dateAdded'>, span: TimeSpan): boolean {
  const t = gdeltStampToMs(event.dateAdded);
  return t !== null && t >= span.start && t <= span.end;
}

/**
 * How much of a paused window the snapshot's day covers, for the layer to say so where it is not
 * all of it: a window reaching past the day is not a quiet day. Null in live mode.
 */
export function snapshotCoverage(window: TimeSpan | null, snapshot: SnapshotDay): 'all' | 'part' | 'none' | null {
  const day = gdeltSpanFor(null, snapshot);
  if (!window || !day) return null;
  if (window.end < day.start || window.start > day.end) return 'none';
  return window.start >= day.start && window.end <= day.end ? 'all' : 'part';
}
