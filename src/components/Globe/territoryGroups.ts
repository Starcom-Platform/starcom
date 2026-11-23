/**
 * The reports about each outlined territory, found by a click inside it (BA9;
 * plan block J, item 4).
 *
 * No territory outline could be clicked, so none of the reports about a
 * territory as a whole could be opened from the globe. A click inside one now
 * opens them: the territories containing the click, the smallest first — a
 * state before its country — each a section of the menu at the click (K8).
 */
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import type { IntelReportOverlayMarker } from '../../interfaces/IntelReportOverlay';
import { boundsOf, pointInGeometry, type PolygonGeometry } from '../../services/geoint/pointInPolygon';
import { territoryMarkerFor, type TerritoryResolver } from '../../features/globe/capture/territoryReports';
import { regionPlace } from '../../features/globe/capture/regionPlace';
import { leadOrder } from './reportPlaces';
import type { ReportGroup } from './placeMenu';

interface TerritoryEntry {
  name: string;
  geometry: PolygonGeometry;
  /** [west, south, east, north], to pass over most territories before testing a polygon. */
  bounds: [number, number, number, number];
  /** How far it reaches from its middle: the smaller territory comes first. */
  reachM: number;
  members: IntelReportOverlayMarker[];
}

/** The groups at a point, for the reports given: built once, asked on every click and hover. */
export function territoryGroupIndex(
  reports: readonly IntelReportUI[],
  resolve: TerritoryResolver,
): (lat: number, lng: number) => ReportGroup[] {
  const entries = new Map<string, TerritoryEntry>();
  for (const report of reports) {
    const marker = territoryMarkerFor(report, resolve);
    if (!marker) continue;
    for (const code of report.jurisdictions ?? []) {
      const territory = resolve(code);
      if (!territory) continue;
      let entry = entries.get(territory.code);
      if (!entry) {
        entry = {
          name: territory.name,
          geometry: territory.geometry,
          bounds: boundsOf(territory.geometry),
          reachM: regionPlace(territory)?.precisionM ?? Infinity,
          members: [],
        };
        entries.set(territory.code, entry);
      }
      if (!entry.members.some((m) => m.pubkey === marker.pubkey)) entry.members.push(marker);
    }
  }
  for (const entry of entries.values()) entry.members.sort(leadOrder);

  return (lat, lng) => [...entries.entries()]
    .filter(([, e]) => lng >= e.bounds[0] && lat >= e.bounds[1] && lng <= e.bounds[2] && lat <= e.bounds[3]
      && pointInGeometry(lat, lng, e.geometry))
    .sort(([, a], [, b]) => a.reachM - b.reachM)
    .map(([code, e]) => ({
      key: `territory:${code}`,
      title: `${e.name} · ${e.members.length} report${e.members.length === 1 ? '' : 's'}`,
      members: e.members,
    }));
}
