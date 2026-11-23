/**
 * The reports about a Sphere: those that name it in their jurisdictions, listed,
 * and a count of those placed inside its states. A Sphere holds whole countries,
 * and the Anglosphere holds hundreds of reports by place alone; a list of those
 * would bury the few that are about the Sphere itself.
 */
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { boundsOf, pointInGeometry, type PolygonGeometry } from '../../../services/geoint/pointInPolygon';
import { areaCodeOf } from '../areas/areaRegistry';

export interface SphereReports {
  /** Naming the Sphere's code, newest first. */
  named: IntelReportUI[];
  /** Placed inside its states. */
  inside: number;
}

export function reportsInSphere(code: string, geometry: PolygonGeometry | undefined, reports: readonly IntelReportUI[]): SphereReports {
  const named: IntelReportUI[] = [];
  let inside = 0;
  const [w, s, e, n] = geometry ? boundsOf(geometry) : [0, 0, 0, 0];
  for (const report of reports) {
    // By its code, or by an alias the registry knows: a report naming "eu" names union:eu.
    if ((report.jurisdictions ?? []).some((j) => j.trim().toLowerCase() === code || areaCodeOf(j) === code)) {
      named.push(report);
      continue;
    }
    const { latitude: lat, longitude: lon } = report;
    if (!geometry || typeof lat !== 'number' || typeof lon !== 'number') continue;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    if (pointInGeometry(lat, lon, geometry)) inside += 1;
  }
  const time = (r: IntelReportUI) => new Date(r.createdAt).getTime() || 0;
  return { named: named.sort((a, b) => time(b) - time(a)), inside };
}
