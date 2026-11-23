/**
 * What the header's search box finds (plan item 1.4, story S24): records
 * first (cases, missions and reports, by name, number or what they say), then
 * the applications that exist, then commands and countries. It found apps,
 * commands and countries only, from a hard-coded list that included a case
 * nobody had made ("Operation Firewall").
 */
import { intelReportService } from '../../services/intel/IntelReportService';
import { intelCaseService } from '../../services/intel/IntelCaseService';
import { missionService } from '../../services/intel/MissionService';
import type { RecordHit, SearchableRecords } from '../../services/search/recordSearch';
import { recordTarget } from '../../routes/recordLink';
import { DESTINATIONS, type ApplicationId, type ApplicationContext, type Destination } from '../Router/EnhancedApplicationRouter';
import { AREAS, AREA_ALIASES, type AreaKind } from '../../features/globe/areas/areaRegistry';
import { loadAreaShapes } from '../../features/globe/areas/areaShapes';
import { frameForArea } from '../../features/globe/capture/areaFrame';
import type { GlobeFocusPoint } from '../../context/GlobeContext';
import type { ZspPlace } from '../../geopolitical/zones/zsp';
import type { ZoneSearch, ZoneSearchPlace } from '../../features/globe/zones/zoneSearch';
import { en, type Messages } from '../../i18n/app/en';
import { counted, fill } from '../../i18n/app/i18n';
import type { GlyphName } from '../../symbols/uiSymbols';
import type { PaletteResult } from '../../features/palette/palette';

/** The header's words, in the language shown: English when none is handed in. */
type Words = Messages['header'];

export interface HeaderSearchResult {
  id: string;
  type: 'app' | 'case' | 'report' | 'mission' | 'entity' | 'command' | 'country' | 'area';
  title: string;
  description: string;
  action?: () => void;
  /** Country results only: whether an overlay that is on has something there. */
  hasResourceZone?: boolean;
  hasDiplomaticEvents?: boolean;
  /** Other words that find it, not shown. */
  keywords?: string;
}

type Navigate = (app: ApplicationId, mode?: undefined, context?: ApplicationContext) => void;

/** The workspace's records, read from the services the screens use. */
export async function loadSearchableRecords(): Promise<SearchableRecords> {
  const [reports, cases, missions] = await Promise.all([
    intelReportService.listReports(), intelCaseService.listCases(), missionService.listMissions(),
  ]);
  return { reports, cases, missions };
}

/** Record hits, each opening where its link leads. */
export function recordResults(hits: RecordHit[], navigate: Navigate, words: Words = en.header): HeaderSearchResult[] {
  return hits.slice(0, 8).map((hit) => ({
    id: `record-${hit.kind}-${hit.id}`,
    type: hit.kind,
    title: hit.number ? `${hit.number} · ${hit.title}` : hit.title,
    description: hit.sample ? fill(words.sample, { kind: words.records[hit.kind] }) : words.records[hit.kind],
    action: () => { const { app, context } = recordTarget(hit.kind, hit.id); navigate(app, undefined, context); },
  }));
}

/**
 * Every place the registry lists, Missions included (plan item 4.6), rather
 * than a list typed out here. An application opened plain is handed nothing.
 */
export function appResults(navigate: Navigate, destinations: readonly Destination[] = DESTINATIONS): HeaderSearchResult[] {
  return destinations.map((d) => ({
    id: `app-${d.key}`,
    type: 'app' as const,
    title: d.label,
    description: d.description,
    action: () => (d.context ? navigate(d.app, undefined, d.context) : navigate(d.app)),
  }));
}

/**
 * Every area (BA24), by its name, found by its code or a bare alias too.
 * Picking one hands its code on: the header outlines it on the globe and
 * flies there.
 */
export function areaResults(onPick: (code: string) => void, words: Words = en.header): HeaderSearchResult[] {
  return AREAS.map((area) => ({
    id: `area-${area.code}`,
    type: 'area' as const,
    title: area.name,
    description: fill(words.area, { kind: words.areaKinds[area.kind satisfies AreaKind] }),
    keywords: [area.code, ...Object.entries(AREA_ALIASES).filter(([, code]) => code === area.code).map(([alias]) => ` ${alias}`)].join(' '),
    action: () => onPick(area.code),
  }));
}

/**
 * Every Zone and its Sectors (ZSP 1.0), by name, by code, or by a landmark in
 * it: "Kilimanjaro" finds the Sector it stands in. Picking one opens it on the
 * globe, with the Zones layer on.
 */
export function zoneResults(index: ZoneSearch, onPick: (place: ZoneSearchPlace) => void, words: Words = en.header): HeaderSearchResult[] {
  return index.zones.flatMap((zone) => [zone.root, ...zone.sectors].map((place) => ({
    id: `zone-${place.id}`,
    type: 'area' as const,
    title: place.name,
    description: place.level === 'zone'
      ? counted(words.zone, zone.sectors.length)
      : fill(words.sector, { zone: zone.root.name }),
    keywords: [place.id, ...place.landmarks].join(' '),
    action: () => onPick(place),
  })));
}

/** Where to fly to show a Zone or a Sector: its whole extent, framed as an area is. */
export function zoneFocusFor(place: Pick<ZspPlace, 'bbox' | 'label' | 'name'>, viewport: { width: number; height: number }): GlobeFocusPoint | null {
  const [w, s, e, n] = place.bbox;
  // A place split at the dateline has a box of -180..180, whose middle is Africa: fly to its label from far out.
  if (e - w > 180) return { lat: place.label.lat, lng: place.label.lon, altitude: 3.5 };
  const aspect = viewport.width > 0 && viewport.height > 0 ? viewport.width / viewport.height : 16 / 9;
  const ring: Array<[number, number]> = [[w, s], [e, s], [e, n], [w, n], [w, s]];
  const extent = { name: place.name, geometry: { type: 'Polygon' as const, coordinates: [ring] } };
  const frame = frameForArea(extent, { fovDeg: 50, frameAspect: aspect, cardAspect: aspect });
  return frame ? { lat: frame.centre.lat, lng: frame.centre.lng, altitude: frame.altitude } : null;
}

/**
 * Where to fly to show an area found in the search (BA24): its largest part
 * and what fits with it, as a card frames it (BA22), cut to the screen's
 * shape. Null when it has no shape.
 */
export async function areaFocusFor(code: string, viewport: { width: number; height: number }): Promise<GlobeFocusPoint | null> {
  const shapes = await loadAreaShapes();
  const shape = shapes?.get(code);
  if (!shape) return null;
  const aspect = viewport.width > 0 && viewport.height > 0 ? viewport.width / viewport.height : 16 / 9;
  const frame = frameForArea(shape, { fovDeg: 50, frameAspect: aspect, cardAspect: aspect });
  return frame ? { lat: frame.centre.lat, lng: frame.centre.lng, altitude: frame.altitude } : null;
}

/**
 * A header result as the command palette shows it (D-CP): its section by its kind, and a glyph in place of the emoji
 * the drop-down drew (iconography directive). An application keeps its own glyph from the registry.
 */
export function asPaletteResult(result: HeaderSearchResult, glyphs: ReadonlyMap<string, GlyphName> = new Map(), words: Words = en.header): PaletteResult {
  const section: PaletteResult['section'] = result.type === 'app' ? 'apps'
    : result.type === 'command' ? 'commands'
      : result.type === 'country' || result.type === 'area' ? 'places'
        : 'records';
  const glyph: GlyphName = glyphs.get(result.id) ?? ({
    app: 'nav:more', command: 'control:list', country: 'layer:NationalTerritories', area: 'layer:Zones',
    case: 'app:cases', report: 'layer:IntelReports', mission: 'mode:Missions', entity: 'app:intelweb',
  } as const)[result.type];
  // A country's marks from the overlays that are on, said rather than drawn.
  const marks = [result.hasResourceZone ? words.resourceBadge : null, result.hasDiplomaticEvents ? words.diplomaticBadge : null].filter(Boolean);
  return {
    id: result.id,
    section,
    title: result.title,
    description: marks.length ? `${result.description} · ${marks.join(' · ')}` : result.description,
    glyph,
    ...(result.keywords ? { keywords: result.keywords } : {}),
    run: () => result.action?.(),
  };
}
