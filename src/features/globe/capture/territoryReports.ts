/**
 * Intel Reports about a territory as a whole (decision BA3; plan block J, item 3).
 *
 * A report can name a country or a US state and no place in it: Mecha Jono's
 * notes since 2 October did so 148 times in 180. The globe outlined the
 * countries (useGlobeRegionMarks) and could draw no state, and none could be
 * listed or featured. Each is now listed and featured as its territory:
 *
 *   - placed at the middle of the territory's largest part, with how far it
 *     reaches from there as its precision, as Raver Watch and War & Conflict
 *     place an item about a region (regionPlace);
 *   - a US state drawn from Starcom's own state lines, a country from the
 *     territory index;
 *   - described as any Intel Report is, and saying on a card that it is about
 *     the place as a whole: never a pin, which would mark where nobody said
 *     anything happened (reportPlace.ts).
 */
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import type { TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import { US_STATE_CODE, type RegionOutline, type UsStates } from '../../../services/raverWatch/usStates';
import { reportToMarker } from '../../../services/intel/globe/reportMarker';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import { regionPlace } from './regionPlace';
import { areaByCode, areaCodeOf } from '../areas/areaRegistry';
import type { AreaShapes } from '../areas/areaShapes';
import { listInWords } from '../../../utils/listInWords';
import { nameInText } from '../../../utils/nameInText';
import { describeShareReport, featuredReportFor, type FeaturedReport, type ShareReportInfo } from './shareReports';
import { capturable } from '../../../services/intel/namesPeople';

export type Territory = RegionOutline & {
  code: string;
  /** Its name in running text, where that is not its name: "the European Union". */
  inText?: string;
};
export type TerritoryResolver = (code: string) => Territory | null;

/**
 * A US state from Starcom's own state lines, a country from the territory
 * index, an area (BA16) from the areas' baked shapes; null when none draws it.
 */
export function territoryResolver(territories?: TerritoryIndex, states?: UsStates, areas?: AreaShapes): TerritoryResolver {
  return (code) => {
    const lower = code.trim().toLowerCase();
    const areaCode = areaCodeOf(lower);
    if (areaCode) {
      const shape = areas?.get(areaCode);
      return shape ? { ...shape, code: areaCode, ...(areaByCode(areaCode)?.the ? { inText: `the ${shape.name}` } : {}) } : null;
    }
    if (US_STATE_CODE.test(lower)) {
      const state = states?.get(lower);
      return state ? { ...state, code: lower } : null;
    }
    const country = territories?.byCode(lower);
    if (!country) return null;
    // Mid-sentence as a reader says it: "the United States of America".
    const inText = nameInText(country.name);
    return { ...country, code: lower, ...(inText !== country.name ? { inText } : {}) };
  };
}

const hasPoint = (report: IntelReportUI) => typeof report.latitude === 'number' && typeof report.longitude === 'number';

/** The territories a report without a point is about, those this app can draw, and where it stands. */
function placeOf(report: IntelReportUI, resolve: TerritoryResolver) {
  if (hasPoint(report)) return null;
  const territories = (report.jurisdictions ?? []).flatMap((code) => resolve(code) ?? []);
  if (!territories.length) return null;
  const place = regionPlace(territories[0]);
  return place ? { territories, place } : null;
}

/** A marker for it at its territory's middle, so it is described as every Intel Report is. */
const markerAt = (report: IntelReportUI, place: { lat: number; lng: number; precisionM: number }) =>
  reportToMarker({ ...report, latitude: place.lat, longitude: place.lng, geoPrecisionM: place.precisionM });

const inText = (territory: Territory) => territory.inText ?? territory.name;
const namesOf = (territories: readonly Territory[]) => listInWords(territories.map(inText));

/**
 * A report about a territory as a whole, as a marker: at the middle of the first
 * territory it names, said to be about each it names (BA3), so the popup gives
 * no coordinate for it.
 */
export function territoryMarkerFor(report: IntelReportUI, resolve: TerritoryResolver): IntelReportOverlayMarker | null {
  const at = placeOf(report, resolve);
  const marker = at && markerAt(report, at.place);
  return marker ? { ...marker, aboutTerritories: at.territories.map(inText) } : null;
}

/** Every report about a territory as a whole that this app can place, as the share handle lists it. */
export function territoryShareReports(reports: readonly IntelReportUI[], resolve: TerritoryResolver): ShareReportInfo[] {
  // Never a note that names a person (D-NP, NP2).
  const placed = capturable(reports).flatMap((report) => {
    const at = placeOf(report, resolve);
    return at ? [{ report, ...at }] : [];
  });
  return placed.flatMap(({ report, territories, place }) => {
    const marker = markerAt(report, place);
    if (!marker) return [];
    const sharing = placed.filter((other) => other.report !== report && other.territories[0].code === territories[0].code).length;
    // Its group is the first territory it names, where it stands (BA10).
    const group = { key: `territory:${territories[0].code}`, kind: 'territory' as const, size: sharing + 1 };
    return [{ ...describeShareReport(marker, sharing, group), territories: territories.map(({ code, name }) => ({ code, name })) }];
  });
}

/** What a card says of a report about a territory it features, or null when it cannot place it. */
export function featuredTerritoryFor(report: IntelReportUI, resolve: TerritoryResolver): FeaturedReport | null {
  if (report.namesPeople) return null;
  const at = placeOf(report, resolve);
  const marker = at && markerAt(report, at.place);
  const featured = marker && featuredReportFor(marker);
  if (!at || !featured) return null;
  const about = `About ${namesOf(at.territories)} as a whole: the report names no place in ${at.territories.length === 1 ? 'it' : 'them'}`;
  return { ...featured, lines: featured.lines.map((line) => (line.startsWith('Near ') ? about : line)) };
}
