/**
 * Every area a report can name (BA16–BA18), as `listAreas()` gives it (contract
 * v29): its code, kind and name, the countries it is made of where it is made
 * of countries, and where that was taken from and when. An agent reads it to
 * choose a code; a membership changes, and the date says as of when.
 */
import { AREAS, type AreaKind } from '../areas/areaRegistry';
import type { RegionOutline } from '../../../services/raverWatch/usStates';
import { pointInGeometry } from '../../../services/geoint/pointInPolygon';
import type { ShareReportInfo } from './shareReports';

export interface ShareArea {
  code: string;
  kind: AreaKind;
  name: string;
  /**
   * Its countries by ISO 3166-1 alpha-2 code, members suspended left out. Null
   * for a continent, which is the map's own, and a zone Starcom drew.
   */
  members: string[] | null;
  source: { name: string; url: string; read: string };
  /** What to know of its edges or members. */
  note: string | null;
}

/** Fresh each call, so a caller that edits one cannot edit the next answer. */
export function shareAreas(): ShareArea[] {
  return AREAS.map((area) => ({
    code: area.code,
    kind: area.kind,
    name: area.name,
    members: area.from === 'members' || (area.from === 'zsp' && area.members) ? [...area.members!] : null,
    source: { ...area.source },
    note: area.note ?? null,
  }));
}

/**
 * The items listed that are in an area (BA21): those whose place is inside its
 * outline. The place as listed, no finer than 0.1°, so a caller can check the
 * answer against the list. A report about a territory or an area stands at
 * its middle: one naming the area is in it, and one about Russia as a whole
 * stands in Siberia, so it is in Asia.
 */
export function reportsInArea<T extends Pick<ShareReportInfo, 'lat' | 'lng'>>(reports: readonly T[], area: RegionOutline): T[] {
  return reports.filter((report) => pointInGeometry(report.lat, report.lng, area.geometry));
}
