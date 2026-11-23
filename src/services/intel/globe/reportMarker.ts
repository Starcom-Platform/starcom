/**
 * The one rule for whether an Intel Report can be pinned on the globe, and the
 * pin it becomes.
 *
 * Moved out of IntelReportVisualizationService so that a Case shown on the
 * globe sorts its linked reports by the same rule the globe draws with. Two
 * copies of "has coordinates" would drift apart, and then a Case would count a
 * report as drawn that the globe had skipped, or the other way round.
 */
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { reportTime, reportReceivedAtMs } from '../recordTime';

/** A finite number, or a string that parses to one. Anything else cannot be placed. */
const markerCoordinate = (value: number | string | undefined | null): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

/**
 * A marker's time, or NaN when none can be read — never the present moment
 * (decision D-E; D-F step 15).
 *
 * This returned Date.now() for a missing or unreadable date, so a report with
 * no time sat at the instant it was converted: shown under any time window
 * containing now, missing from every past one, and sorted as the newest report
 * there is. NaN is "no stated time"; markerRecordTime already reads a marker
 * with no time basis as null, and the popup says so.
 */
const markerTimestamp = (value: Date | string | number | undefined | null): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value === 'string') return Date.parse(value);
  return Number.NaN;
};

/** The report's pin, or null when it has no usable coordinates. */
export const reportToMarker = (report: IntelReportUI): IntelReportOverlayMarker | null => {
  const latitude = markerCoordinate(report.latitude);
  const longitude = markerCoordinate(report.longitude);

  if (latitude === null || longitude === null) {
    return null;
  }

  // Merge internal tags with author-supplied hashtags for marker search/filter purposes.
  // Kept separate on IntelReportUI itself (tags = trusted taxonomy, hashtags = external
  // content) but combined here since this marker DTO is a read-only display/filter view.
  const tags = Array.from(new Set([...(report.tags || []), ...(report.hashtags || [])]));
  if (report.category && !tags.includes(report.category)) tags.push(report.category);

  // Placed by when the event happened, or by when the report was written when it
  // does not say, and the marker says which (decision D-E). It was always the last
  // edit, so scrubbing to July showed reports edited in July.
  const time = reportTime(report);

  return {
    pubkey: report.id,
    title: report.title || 'Unknown Intel Report',
    content: report.content || '',
    tags,
    ...(report.priority ? { priority: report.priority } : {}),
    latitude,
    longitude,
    // Passed through untouched. The globe decides whether to draw it; this
    // only decides that a mark exists, which is still the coordinate's job.
    ...(report.outline ? { outline: report.outline } : {}),
    ...(typeof report.geoPrecisionM === 'number' ? { geoPrecisionM: report.geoPrecisionM } : {}),
    timestamp: time ? time.start : markerTimestamp(report.updatedAt ?? report.createdAt),
    ...(time ? { timeBasis: time.basis } : {}),
    ...(time?.statedEnd !== undefined ? { timeEndMs: time.statedEnd } : {}),
    ...(time?.precisionMs !== undefined ? { timePrecisionMs: time.precisionMs } : {}),
    author: report.author || 'Unknown',
    // The version read from a relay, for a review pinned to it (plan item 5.1).
    ...(report.nostrEventId ? { nostrEventId: report.nostrEventId } : {}),
    ...(report.nostrKind ? { nostrKind: report.nostrKind } : {}),
    // Its sources, to follow from the popup (D-CT, CT2).
    ...(report.sourceLinks?.length ? { sourceLinks: report.sourceLinks } : {}),
    // It names a person as a cited source names them (D-NP): labelled in the popup, left out of captures.
    ...(report.namesPeople ? { namesPeople: true } : {}),
    // When WE received this copy, for the globe to say a mark predates this
    // session (decision D-F, step 4.4). Not a placement time — see reportTime
    // above and reportReceivedAtMs for why these are three different things.
    ...(reportReceivedAtMs(report) !== null ? { receivedAtMs: reportReceivedAtMs(report) as number } : {}),
    // Stated, not inferred downstream from whatever mode happens to be active.
    kind: 'intel' as const
    // `classification: report.classification` was passed through here, added
    // alongside `kind` for the same stated reason. The marker DTO no longer
    // carries handling at all — see the note on IntelReportOverlayMarker.
  };
};
