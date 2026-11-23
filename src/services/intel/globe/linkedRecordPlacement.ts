/**
 * Which records linked to a Case or a Mission the globe can pin, and why the
 * rest cannot.
 *
 * Decided in docs/missions/01-architecture-decisions/case-location-semantics.md
 * (option C): neither a Case nor a Mission has a location of its own. On the
 * globe each shows the pins of the reports linked to it (a Mission through its
 * cases and its own attached reports), says how many linked records were not
 * drawn and why, and never draws a point for itself, because a centre worked
 * out from its evidence would mark a place where nothing was reported.
 *
 * The camera target below is that centre, and it is only ever a place to look.
 */
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import type { IntelItemUI } from '../../../types/intel/IntelItemUI';
import type { GlobeFocusPoint } from '../../../context/GlobeContext';
import type { LinkedRecordNotDrawn } from '../../epistemic/epistemicLanguage';
import { reportToMarker } from './reportMarker';

export interface LinkedRecordPlacement {
  /** Distinct linked records, counting each linked case that could not be found as one. */
  linkedCount: number;
  /** One pin per linked report with coordinates, in the order they were linked. */
  markers: IntelReportOverlayMarker[];
  notDrawn: { count: number; byReason: Partial<Record<LinkedRecordNotDrawn, number>> };
  /** Where to point the camera, or null when there is no one place to look. Never drawn. */
  cameraTarget: GlobeFocusPoint | null;
}

export const placeLinkedRecords = (
  relatedIds: readonly string[],
  reports: readonly IntelReportUI[],
  items: readonly Pick<IntelItemUI, 'id'>[],
  /** A Mission's linked cases that could not be found. What they link to cannot be read. */
  casesNotFound = 0,
): LinkedRecordPlacement => {
  const reportsById = new Map(reports.map((r) => [r.id, r]));
  const itemIds = new Set(items.map((i) => i.id));
  const linked = [...new Set(relatedIds)];
  const markers: IntelReportOverlayMarker[] = [];
  const byReason: Partial<Record<LinkedRecordNotDrawn, number>> = {};
  const notDrawn = (reason: LinkedRecordNotDrawn) => {
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  };

  for (const id of linked) {
    const report = reportsById.get(id);
    if (report) {
      const marker = reportToMarker(report);
      if (marker) markers.push(marker);
      else notDrawn('no-coordinates');
    } else if (itemIds.has(id)) {
      // An intel item can carry coordinates, but the globe's report layer draws reports only.
      notDrawn('intel-item');
    } else {
      notDrawn('not-found');
    }
  }
  if (casesNotFound > 0) byReason['case-not-found'] = casesNotFound;

  const linkedCount = linked.length + casesNotFound;
  return {
    linkedCount,
    markers,
    notDrawn: { count: linkedCount - markers.length, byReason },
    cameraTarget: centreOf(markers),
  };
};

/**
 * The centre of the pins on the sphere, not the average of their numbers.
 *
 * Averaging latitude and longitude puts the centre of pins at 170°E and 170°W
 * on the Greenwich meridian, the far side of the planet from both. Pins spread
 * evenly around the globe have no centre, and get no camera move.
 */
export const centreOf = (
  points: readonly { latitude: number; longitude: number }[],
): GlobeFocusPoint | null => {
  if (points.length === 0) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const lat = (p.latitude * Math.PI) / 180;
    const lng = (p.longitude * Math.PI) / 180;
    x += Math.cos(lat) * Math.cos(lng);
    y += Math.cos(lat) * Math.sin(lng);
    z += Math.sin(lat);
  }
  if (Math.hypot(x, y, z) / points.length < 1e-6) return null;
  return {
    lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
    lng: (Math.atan2(y, x) * 180) / Math.PI,
  };
};
