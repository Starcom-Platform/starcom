/**
 * The span a GDELT layer shows, from the one shared time (D-E; D-DP, DP15): the snapshot's day in
 * live mode, the shared window when paused. Every reader of a GDELT layer's events takes it from
 * here — the layer, the layers popup's counts, the country popup and the header's search — so none
 * claims an event the globe is not showing.
 */
import { useMemo } from 'react';
import { useTemporalStateOptional } from '../../context/TemporalContext';
import { gdeltSpanFor, snapshotCoverage, type SnapshotDay, type TimeSpan } from '../utils/gdeltTimeSpan';
import { fill, messagesNow } from '../../i18n/app/i18n';
import { formatUtcWindow } from '../../utils/utcTime';

export function useGdeltSpan(snapshot: SnapshotDay): {
  span: TimeSpan | null;
  /** The shared window, when paused; null in live mode. */
  window: TimeSpan | null;
  coverage: ReturnType<typeof snapshotCoverage>;
} {
  const temporal = useTemporalStateOptional();
  const shared = temporal && !temporal.isLive ? temporal.timeWindow : null;
  const start = shared?.start.getTime() ?? null;
  const end = shared?.end.getTime() ?? null;
  const window = useMemo(() => (start !== null && end !== null ? { start, end } : null), [start, end]);
  const span = useMemo(() => gdeltSpanFor(window, snapshot), [window, snapshot.from, snapshot.asOf]); // eslint-disable-line react-hooks/exhaustive-deps
  return { span, window, coverage: snapshotCoverage(window, snapshot) };
}

/**
 * What the key says after a GDELT layer's name when a paused window reaches past the snapshot's day:
 * "holds only 12 Oct 09:30Z – 13 Oct 09:30Z of the window shown", or that it holds nothing there. A
 * window reaching past the day is not a quiet day. Nothing in live mode, or when the day covers it.
 */
export function snapshotDayNote(
  coverage: ReturnType<typeof snapshotCoverage>,
  snapshot: SnapshotDay,
  window: TimeSpan | null,
): string | undefined {
  const day = gdeltSpanFor(null, snapshot);
  if (!day || (coverage !== 'part' && coverage !== 'none')) return undefined;
  const words = messagesNow().diplomacy;
  if (coverage === 'none') return fill(words.snapshotNone, { span: formatUtcWindow(day.start, day.end) });
  // What of the window it holds: where the window and the day meet.
  const start = window ? Math.max(window.start, day.start) : day.start;
  const end = window ? Math.min(window.end, day.end) : day.end;
  return fill(words.snapshotPart, { span: formatUtcWindow(start, end) });
}
