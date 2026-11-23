/**
 * The reports about a Zone or a Sector (ZSP 1.0): those placed inside it, and
 * those that name it in their jurisdictions — a Zone by the code reports already
 * use for it (BA17), a Sector by its own, `zone:<zone>/sector:<sector>`.
 *
 * Derived from where a report says it is, never from a tag it did not carry: a
 * report placed in the Afar Triangle is about the Afar Triangle's ground whether
 * or not its author knew the Sector's name.
 */
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { pointInGeometry } from '../../../services/geoint/pointInPolygon';
import type { ZspPlace } from '../../../geopolitical/zones/zsp';

/** What a report must say for a Zone to find it: a point, or a jurisdiction. */
export const isPlacedOrNamed = (report: IntelReportUI): boolean =>
  (typeof report.latitude === 'number' && typeof report.longitude === 'number') || (report.jurisdictions?.length ?? 0) > 0;

export interface PlaceReport {
  report: IntelReportUI;
  /** Placed inside the place, or naming it (or a place inside it). */
  how: 'inside' | 'named';
}

const names = (report: IntelReportUI, ids: readonly string[]): boolean =>
  (report.jurisdictions ?? []).some((j) => {
    const code = j.trim().toLowerCase();
    return ids.some((id) => code === id || code.startsWith(`${id}/`));
  });

/**
 * The reports about a place, newest first. `alsoNamed`: the codes that count as naming it too, such as a first
 * Zone that ZSP 2.0 retired into it (D-ZR), so a report that named the Sahel is found under the Zones that cover it.
 */
export function reportsAbout(place: ZspPlace, reports: readonly IntelReportUI[], alsoNamed: readonly string[] = []): PlaceReport[] {
  const [w, s, e, n] = place.bbox;
  const found: PlaceReport[] = [];
  const ids = [place.id, ...alsoNamed];
  for (const report of reports) {
    if (names(report, ids)) {
      found.push({ report, how: 'named' });
      continue;
    }
    const { latitude: lat, longitude: lon } = report;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    if (lat < s || lat > n || lon < w || lon > e) continue;
    if (pointInGeometry(lat, lon, place.geometry)) found.push({ report, how: 'inside' });
  }
  const time = (r: IntelReportUI) => new Date(r.createdAt).getTime() || 0;
  return found.sort((a, b) => time(b.report) - time(a.report));
}
