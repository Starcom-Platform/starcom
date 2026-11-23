/**
 * Intel-like markers grouped by the place they stand at (decision D-F, section 18,
 * item 1.2).
 *
 * ─── WHY ONE MARK PER PLACE ────────────────────────────────────────────────
 *
 * A report glyph is drawn at a fixed 35 px, so reports geocoded to one centroid
 * draw as a stack of identical glyphs on one spot, which reads as "one". The pins
 * under the glyphs already merged them and printed the count in their size; the
 * glyphs did not. On 2026-09-25 that meant each report drew twice, as a purple pin
 * and a glyph, and a stack of glyphs still hid how many there were.
 *
 * So the glyph layer and the pins read the same grouping from here, and the place
 * is drawn once: the most severe report there, with a count.
 *
 * Grouping is by coordinate, never by groupId, so no marker is moved. Four
 * decimals is about 11 m: the same geocoded centroid, not merely a nearby one.
 * RLSH and intel never share a place, because a person is not a report.
 */
import { markerKind, markerTimeMs, type IntelOverlayMarkerKind, type IntelReportOverlayMarker } from '../../interfaces/IntelReportOverlay';
import { intelVariantOf, type IntelVariant } from './intelVariant';

export interface ReportPlace {
  kind: IntelOverlayMarkerKind;
  latitude: number;
  longitude: number;
  /** Every marker at this place, the lead first. */
  reports: IntelReportOverlayMarker[];
  /** The marker drawn for the place, and opened when it is clicked. */
  lead: IntelReportOverlayMarker;
  /**
   * How many the place stands for: the larger of the markers stacked here and
   * what a marker says it stands for. Summing would count a place fourteen times
   * over if each of its markers stated fourteen.
   */
  count: number;
}

/*
 * Which report leads a place. The most urgent is what a reader most needs to
 * see, and hiding a critical report under a raw one would be the worst way for
 * merging to fail.
 */
const SEVERITY: Record<IntelVariant, number> = { critical: 3, actionable: 2, standard: 1, raw: 0 };

const severityOf = (marker: IntelReportOverlayMarker) =>
  markerKind(marker) === 'rlsh' ? 0 : SEVERITY[intelVariantOf(marker)];

/** Most severe first, then newest, then by id so the order never depends on arrival. */
export function leadOrder(a: IntelReportOverlayMarker, b: IntelReportOverlayMarker): number {
  const bySeverity = severityOf(b) - severityOf(a);
  if (bySeverity !== 0) return bySeverity;
  const byTime = (markerTimeMs(b) ?? -Infinity) - (markerTimeMs(a) ?? -Infinity);
  if (byTime !== 0 && Number.isFinite(byTime)) return byTime;
  return a.pubkey < b.pubkey ? -1 : a.pubkey > b.pubkey ? 1 : 0;
}

/** How many markers a marker says stand at its own place, itself included. */
function statedHere(marker: IntelReportOverlayMarker): number {
  const size = marker.groupSize;
  // Only a LOCATION group's size counts: an explicit group can span places, and
  // its size would put people here who are somewhere else.
  return marker.groupKind === 'location' && typeof size === 'number' && Number.isFinite(size) && size > 1
    ? Math.floor(size)
    : 1;
}

/** The key two markers share when they stand at one place. */
export function placeKeyOf(marker: IntelReportOverlayMarker): string {
  return `${markerKind(marker)}|${marker.latitude.toFixed(4)},${marker.longitude.toFixed(4)}`;
}

/** Markers grouped by place, in the order each place first appears. Unplaceable markers are left out. */
export function groupReportsByPlace(markers: readonly IntelReportOverlayMarker[]): ReportPlace[] {
  const places = new Map<string, IntelReportOverlayMarker[]>();
  for (const marker of markers) {
    if (!Number.isFinite(marker.latitude) || !Number.isFinite(marker.longitude)) continue;
    const key = placeKeyOf(marker);
    const here = places.get(key);
    if (here) here.push(marker);
    else places.set(key, [marker]);
  }

  return [...places.values()].map((here) => {
    const reports = [...here].sort(leadOrder);
    const lead = reports[0];
    return {
      kind: markerKind(lead),
      latitude: lead.latitude,
      longitude: lead.longitude,
      reports,
      lead,
      count: Math.max(reports.length, ...reports.map(statedHere)),
    };
  });
}

/**
 * The clicked report's place: every report there, most severe first (BA8).
 *
 * The popup paged through every report, the clicked place's first, so paging
 * past a place's last carried on into the rest of the globe. A place drawn as
 * one glyph with a count of 3 opens a menu of those 3 (K8), and the popup pages
 * through them alone. A report with no position is its own place.
 */
export function reportsAtPlace(
  reports: readonly IntelReportOverlayMarker[],
  clicked: IntelReportOverlayMarker,
): IntelReportOverlayMarker[] {
  if (!Number.isFinite(clicked.latitude) || !Number.isFinite(clicked.longitude)) return [clicked];
  const key = placeKeyOf(clicked);
  const here = reports.filter((report) => Number.isFinite(report.latitude) && Number.isFinite(report.longitude)
    && placeKeyOf(report) === key);
  return (here.includes(clicked) ? here : [clicked, ...here]).sort(leadOrder);
}
