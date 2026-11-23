/**
 * useGlobeHeroWatch: Hero Watch on the globe (decision D-HW, docs/missions/01-architecture-decisions/
 * hero-watch.md). Who is responding, and where, from Mecha Jono's records on The Record
 * (services/heroWatch/heroWatch.ts).
 *
 * Step 3 draws its lifeboats: a lifebuoy at each RNLI station Mecha Jono publishes, standing at the
 * moment shown, sized by its launches in 2025, the RNLI's count (heroWatchSprites.ts, HW5). Step 4 draws
 * relief (HW4): each country with a Red Cross and Red Crescent operation or OCHA's count of organisations
 * at work, tinted whole and faintly, as its notes are for the whole country, with a package at its middle
 * and a pill counting both (heroWatchRelief.ts). Step 5 draws field missions (HW6): each state or
 * country with open missions outlined, with a clipboard at its middle and a pill counting them, the
 * hover naming each with its safety limits (heroWatchMissions.ts). Raver Watch's Raver missions are the
 * harm-reduction ones (HW8), drawn the same way, in the same rescue orange: the same mission, the same
 * colour, whichever mode shows it. Read only while a section is on, one read however many ask.
 *
 * It says what it draws: how many stations, and which of the RNLI's areas have none; how many countries,
 * and how many relief notes name none drawn here; how many open missions, in how many places, and how
 * many name no place drawn here; the keys, with what a mark's size, rim and pill mean;
 * the card's sources, crediting the RNLI, IFRC GO and OCHA as their terms ask; and whenReady, which
 * holds a card until the records are read, the countries outlined and the pills drawn.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import {
  heroWatchItems, heroWatchStatus, heroWatchUnread, startHeroWatch, subscribeHeroWatch,
  type FieldMission, type HeroWatchItem, type LifeboatStation, type ReliefOperation, type ReliefPresence, type WeekSummary,
} from '../../../services/heroWatch/heroWatch';
import { describeRelief, reliefByCountry, reliefPill, type ReliefCountry } from '../../../services/heroWatch/heroWatchRelief';
import { describeMissions, missionsByPlace, missionsPill, type MissionPlace } from '../../../services/heroWatch/heroWatchMissions';
import { heroWatchWeek, type HeroWatchWeek } from '../../../services/heroWatch/heroWatchWeek';
import { heroCandidates } from '../../../features/globe/tour/playlistSources';
import type { TourOffer } from '../../../features/globe/tour/briefingPlaylist';
import { loadUsStates, US_STATE_CODE, type UsStates } from '../../../services/raverWatch/usStates';
import { buildGlyphSprites, disposeIntelSprites, type GlyphSpriteMark } from '../intelReportSprites';
import {
  bakeHeroWatchPills, buildHeroWatchPills, disposeHeroWatchPills, HERO_WATCH_LAYOUT, heroWatchAtlas, lifeboatMark, lifeboatSizeFor, missionMark, reliefMark, type PillAtlas,
} from '../heroWatchSprites';
import { GeometryFactory, type LineFeature, type PolygonFeature } from '../../../geopolitical/geometry/geometryFactory';
import { LIT_FILL_ELEVATION } from '../litTerritory';
import { TERRITORY_FILLS_ORDER } from '../../../geopolitical/theme/applyTerritoryLook';
import { regionPlace } from '../../../features/globe/capture/regionPlace';
import type { TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import type { RegionOutline } from '../../../services/raverWatch/usStates';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { heroWatchGlobeNote, noteSet } from '../../../features/globe/noteDetail/globeNotesOf';
import { latLngToGlobeWorld, GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { drawAboveSurfaceLayers } from '../screenPoints';
import { REPORT_SPRITES } from '../globeAltitudes';
import { ridesShell } from '../../../globe-engine/shellLift';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { CREDITS } from '../../../features/globe/capture/sourceCredits';
import { featuredHeroWatchFor, heroWatchShareReports, type HeroWatchListing } from '../../../features/globe/capture/heroWatchReports';
import type { FeaturedReport, ShareReportInfo } from '../../../features/globe/capture/shareReports';
import type { FeedProvenance } from '../../../features/globe/capture/shareCardProvenance';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';

const GLOBE_RADIUS_UNITS = 100;
// The card says how many stations it draws and which of the RNLI's areas have none. On 10 October
// Mecha Jono had published 118 (none in Wales, Ireland, the Channel Islands, nor England's south coast);
// their sheet of 11 October says it was a rollout in batches of 120, and all 238 are on The Record.
const LIFEBOATS_NOTE_SHORT = "Lifeboat launches are the RNLI's count for 2025, not rescues happening now.";
const LIFEBOATS_NOTE_SHORT_PARTIAL = "Lifeboats: 2025's launches, not rescues now; not every RNLI station is published.";

/** The areas the RNLI's lifeboats cover, by the jurisdiction codes Mecha Jono writes. */
const RNLI_AREAS: ReadonlyArray<[string, string]> = [
  ['gb-eng', 'England'], ['gb-sct', 'Scotland'], ['gb-wls', 'Wales'], ['gb-nir', 'Northern Ireland'],
  ['im', 'the Isle of Man'], ['ie', 'Ireland'], ['je', 'Jersey'], ['gg', 'Guernsey'],
];

/**
 * The Channel Islands, whose stations Mecha Jono publishes with a point and no jurisdiction (their sheet
 * of 11 October): Jersey's below 49.3°N, Guernsey's and Alderney's above. Cherbourg, at 1.6°W, is outside.
 */
const channelIsland = (point: { lat: number; lon: number }): 'je' | 'gg' | null => {
  if (point.lon < -2.8 || point.lon > -1.9 || point.lat < 49.1 || point.lat > 49.8) return null;
  return point.lat < 49.3 ? 'je' : 'gg';
};

/**
 * The RNLI's areas with no station among those drawn, in words; the two Channel Islands' as one when both.
 * A station with no jurisdiction is placed by where it stands; one standing outside the Channel Islands
 * could be in any area, and then no area is said to have none.
 */
export function lifeboatAreasWithNone(stations: LifeboatStation[]): string[] {
  const published = new Set<string>();
  for (const station of stations) {
    const area = station.jurisdiction ?? (station.point ? channelIsland(station.point) : null);
    if (!area) return [];
    published.add(area);
  }
  const none = RNLI_AREAS.filter(([code]) => !published.has(code)).map(([, name]) => name);
  return none.includes('Jersey') && none.includes('Guernsey')
    ? [...none.filter((name) => name !== 'Jersey' && name !== 'Guernsey'), 'the Channel Islands']
    : none;
}

const inWords = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);

/**
 * What the layer covers, while every station published is the RNLI's (critique-2026-11-01, OR8): its waters only,
 * and no other lifeboat service on The Record yet. Said from the stations themselves, so a station of another
 * service, once posted, takes the line away; null then, or when a station's place is not known.
 */
export function lifeboatCoverage(stations: LifeboatStation[]): string | null {
  const rnli = new Set(RNLI_AREAS.map(([code]) => code));
  for (const station of stations) {
    const area = station.jurisdiction ?? (station.point ? channelIsland(station.point) : null);
    if (!area || !rnli.has(area)) return null;
  }
  return stations.length ? "the RNLI's waters only: the UK, Ireland, the Isle of Man and the Channel Islands; no other lifeboat service is posted yet" : null;
}

function lifeboatsNote(stations: LifeboatStation[]): string {
  const none = lifeboatAreasWithNone(stations);
  return `Hero Watch: the ${stations.length} RNLI lifeboat station${stations.length === 1 ? '' : 's'} published on The Record, `
    + "each drawn at its place, sized by its launches in 2025, counted from the RNLI's Return of Service. "
    + (none.length ? `Not every RNLI station is published: none in ${inWords(none)}. ` : '')
    + "They are last year's launches, not rescues happening now; a station the RNLI does not count is drawn smallest, rimmed in grey.";
}

/** How relief's country tints are found by a probe or a test. */
export const RELIEF_FILL_TYPE = 'heroWatchReliefFills';
/**
 * Soft, yet orange: at 0.13 it read as a pale grey over the Classic colours and vanished under a card's
 * Quiet wash. Drawn just after the countries' own fills and before the borders, so the Quiet style's
 * fills never cover it, as they did, turning full orange into salmon on a card.
 */
const RELIEF_TINT_OPACITY = 0.42;
const RELIEF_FILLS_ORDER = TERRITORY_FILLS_ORDER + 1;
const toColor = (css: string) => parseInt(css.slice(1), 16);

const RELIEF_NOTE_SHORT = 'Relief: whole countries, as IFRC GO and OCHA give them; organisations counted, not named.';

function reliefNote(countries: ReliefCountry[], unplaced: number): string {
  const n = countries.length;
  const notDrawn = unplaced
    ? ` ${unplaced} relief note${unplaced === 1 ? ' names' : 's name'} no country drawn here, and ${unplaced === 1 ? 'is' : 'are'} not drawn.`
    : '';
  if (n === 0) return `Hero Watch: no country has relief standing at the moment shown.${notDrawn}`;
  return `Hero Watch: ${n} ${n === 1 ? 'country' : 'countries'} with relief, tinted whole, as its notes are for the whole country, `
    + 'with a pill counting its Red Cross and Red Crescent operations (IFRC GO, the International Federation\'s data bank, '
    + 'used non-commercially) and the organisations at work there (OCHA\'s count, via HDX, CC BY), counted and never named. '
    + `A count of organisations is for the months OCHA counted, which a hover gives.${notDrawn}`;
}

/** A country's every part, as fills in rescue orange: ids of their own, as GeometryFactory caches a fill by id in its first colour. */
function polygonsOf(code: string, region: RegionOutline): PolygonFeature[] {
  const polygons = region.geometry.type === 'Polygon' ? [region.geometry.coordinates] : region.geometry.coordinates;
  return polygons.flatMap((rings, i) => (rings[0] && rings[0].length >= 3
    ? [{ id: `hero-relief:${code}#${i}`, rings: rings as [number, number][][] }]
    : []));
}

/** How field missions' outlines are found by a probe or a test. */
export const MISSION_OUTLINE_TYPE = 'heroWatchMissionOutlines';
/** Over the borders, as Raver Watch's alert outlines stand, so a mission's place reads over both. */
const MISSION_OUTLINE_ELEVATION = 0.35;
const MISSION_OUTLINE_OPACITY = 0.85;

const MISSIONS_NOTE_SHORT = 'Field missions: open ones, where each names; every one carries its safety limits.';
const RAVER_MISSIONS_NOTE_SHORT = 'Raver missions: harm-reduction field missions; every one carries its safety limits.';

/** What the card says of the missions drawn: Hero Watch's every one, or Raver Watch's harm-reduction ones. */
function missionsNote(places: MissionPlace[], unplaced: number, raver: boolean): string {
  const open = places.reduce((n, place) => n + place.missions.length, 0);
  const kind = raver ? 'harm-reduction field mission' : 'field mission';
  const notDrawn = unplaced
    ? ` ${unplaced} name${unplaced === 1 ? 's' : ''} no place drawn here, and ${unplaced === 1 ? 'is' : 'are'} not drawn.`
    : '';
  const mode = raver ? 'Raver Watch' : 'Hero Watch';
  if (open === 0) return `${mode}: no open ${kind} names a place drawn here at the moment shown.${notDrawn}`;
  return `${mode}: ${open} open ${kind}${open === 1 ? '' : 's'} in ${places.length} place${places.length === 1 ? '' : 's'}, `
    + `${raver ? 'from Hero Watch, ' : ''}each place outlined, with a pill counting its missions. Every mission carries its `
    + `safety limits, which a hover gives with its asks.${notDrawn} Closed missions are not drawn.`;
}

/** A place's outline, as lines: every part's outer ring. */
function outlineOf(code: string, region: RegionOutline): LineFeature[] {
  const polygons = region.geometry.type === 'Polygon' ? [region.geometry.coordinates] : region.geometry.coordinates;
  return polygons.flatMap((rings, i) => (rings[0] && rings[0].length >= 2
    ? [{ id: `hero-mission:${code}#${i}`, coordinates: rings[0] as [number, number][] }]
    : []));
}

let readiness: { ready: boolean; why?: string } = { ready: true };
/**
 * What whenReady asks of Hero Watch: false while a section is on and its records have not been read,
 * while relief stands and the countries are not yet outlined, or while its pills are being drawn.
 */
export function heroWatchReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

export interface UseGlobeHeroWatchOptions {
  scene: THREE.Scene | null;
  /** Which of its sections are on, and Raver Watch's Raver missions, its harm-reduction field missions (HW8). */
  active: { Lifeboats: boolean; Relief: boolean; FieldMissions: boolean; RaverMissions: boolean };
  /** The countries' outlines, for relief; undefined until they have loaded. */
  territories?: TerritoryIndex;
  /** The window chosen on the timeline, in ms; null while live. */
  window: { start: number; end: number } | null;
  /** The moment the timeline is paused at, in ms; null while live. Absent, the window's end. */
  moment?: number | null;
  /** The item a card is about, by its address, when it is one of Hero Watch's. */
  featuredId?: string | null;
}

export interface HeroWatchOnGlobe {
  /** One per section that is on, for the key and the card. */
  feeds: FeedProvenance[];
  anyOn: boolean;
  /** The stations drawn. */
  stations: LifeboatStation[];
  /** The countries with relief drawn. */
  relief: ReliefCountry[];
  /** The places with open field missions drawn. */
  missions: MissionPlace[];
  /** The week's summary standing at the moment shown, Mecha Jono's newest; null when there is none. */
  summary: WeekSummary | null;
  /** What is listed rather than drawn: relief notes, and open field missions, naming no place drawn here. */
  listed: { relief: Array<ReliefOperation | ReliefPresence>; missions: FieldMission[] };
  /** Whether a section of Hero Watch's own is on, so its panel shows; not Raver Watch's Raver missions alone. */
  sectionsOn: boolean;
  /** What it draws, as listReports gives it (step 7). */
  reports: ShareReportInfo[];
  /** The card's lines about the featured item, when it is one drawn here. */
  featured: FeaturedReport | null;
  /** Why one of its addresses is not drawn; null when it is, undefined when the address is not its own. */
  whyNotDrawn: (id: string) => string | null | undefined;
  /** The week as drawn, for its front-page card (HW10). Throws when nothing stands to put on it. */
  weekOf: () => HeroWatchWeek;
  /** What Hero Watch this week would stop at, and whether the read is done (HW13); null while Relief and Field missions are off. */
  tourCandidates: () => TourOffer | null;
}

/** Whether a record applies at a moment, or anywhere in a window, as its note states. */
const standsAt = (item: HeroWatchItem, at: { atS: number; window: { fromS: number; untilS: number } | null }) =>
  at.window ? item.validFrom < at.window.untilS && item.validUntil > at.window.fromS : item.validFrom <= at.atS && at.atS < item.validUntil;

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if ((child as THREE.Points).isPoints) disposeIntelSprites(child as THREE.Points);
  }
}

export function useGlobeHeroWatch({ scene, active, territories, window, moment: pausedAt = null, featuredId = null }: UseGlobeHeroWatchOptions): HeroWatchOnGlobe {
  const anyOn = active.Lifeboats || active.Relief || active.FieldMissions || active.RaverMissions;
  // Field missions draw every open mission; Raver missions alone, the harm-reduction ones.
  const missionsOn = active.FieldMissions || active.RaverMissions;
  const raverOnly = !active.FieldMissions && active.RaverMissions;

  // Read only while a section is on; one read however many ask.
  useEffect(() => (anyOn ? startHeroWatch() : undefined), [anyOn]);
  const items = useSyncExternalStore(subscribeHeroWatch, heroWatchItems, heroWatchItems);
  const unread = useSyncExternalStore(subscribeHeroWatch, heroWatchUnread, heroWatchUnread);
  const status = useSyncExternalStore(subscribeHeroWatch, heroWatchStatus, heroWatchStatus);


  // Live, the moment moves on by the minute, so a record past its end is no longer drawn.
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    if (!anyOn || window) return undefined;
    const timer = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(timer);
  }, [anyOn, window]);
  const windowStart = window?.start ?? null;
  const windowEnd = window?.end ?? null;
  const moment = useMemo(() => (windowStart !== null && windowEnd !== null
    ? { atS: (pausedAt ?? windowEnd) / 1000, window: { fromS: windowStart / 1000, untilS: windowEnd / 1000 } }
    : { atS: minute * 60, window: null }), [minute, windowStart, windowEnd, pausedAt]);

  const [atlas, setAtlas] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let live = true;
    void heroWatchAtlas().then((texture) => { if (live) setAtlas(texture); });
    return () => { live = false; };
  }, []);

  const spritesRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  const pillsRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  // Field missions' outlines, ours to dispose. In the fills' frame.
  const outlinesRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    return group;
  })());
  // Relief's tints, which GeometryFactory's cache owns: removed, never disposed here. In the fills' frame.
  const fillsRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    return group;
  })());
  useEffect(() => registerTooltipGroup(spritesRef.current), []);
  useEffect(() => {
    if (!scene) return undefined;
    const groups = [fillsRef.current, outlinesRef.current, spritesRef.current, pillsRef.current];
    scene.add(...groups);
    return () => { scene.remove(...groups); };
  }, [scene]);

  const stations = useMemo(
    () => (active.Lifeboats
      ? items.filter((item): item is LifeboatStation => item.kind === 'station' && !!item.point && standsAt(item, moment))
      : []),
    [items, moment, active.Lifeboats],
  );

  // Relief by country, among the records standing at the moment, once the countries' outlines are here.
  const relief = useMemo(() => (active.Relief && territories
    ? reliefByCountry(items.filter((item) => (item.kind === 'operation' || item.kind === 'presence') && standsAt(item, moment)), (code) => territories.byCode(code))
    : { countries: [] as ReliefCountry[], unplaced: [] }), [items, moment, active.Relief, territories]);
  const reliefStanding = useMemo(
    () => active.Relief && items.some((item) => (item.kind === 'operation' || item.kind === 'presence') && standsAt(item, moment)),
    [items, moment, active.Relief],
  );
  // Each country's middle, at the height a report's mark stands.
  const reliefPlaces = useMemo(() => relief.countries.flatMap((country) => {
    const middle = regionPlace(territories!.byCode(country.code) as RegionOutline);
    return middle ? [{ country, position: latLngToGlobeWorld(middle.lat, middle.lng, GLOBE_RADIUS_UNITS * REPORT_SPRITES) }] : [];
  }), [relief, territories]);

  // The US states' outlines, fetched once while Field missions is on; a mission names a state more often than not.
  const [usStates, setUsStates] = useState<UsStates | undefined>(undefined);
  const [statesSettled, setStatesSettled] = useState(false);
  useEffect(() => {
    if (!missionsOn) return undefined;
    let live = true;
    void loadUsStates().then((loaded) => { if (live) { setUsStates(loaded); setStatesSettled(true); } });
    return () => { live = false; };
  }, [missionsOn]);
  const placeOutline = useMemo(
    () => (code: string): RegionOutline | null => (US_STATE_CODE.test(code) ? usStates?.get(code) : territories?.byCode(code)) ?? null,
    [usStates, territories],
  );
  // Open field missions by place, among those standing at the moment.
  const missions = useMemo(() => (missionsOn
    ? missionsByPlace(items.filter((item) => item.kind === 'field_mission' && (!raverOnly || item.harmReduction) && standsAt(item, moment)), placeOutline)
    : { places: [] as MissionPlace[], unplaced: [] }), [items, moment, missionsOn, raverOnly, placeOutline]);
  // Whether a standing open mission names a state, whose outline is fetched: a card waits for it.
  const missionsNeedStates = useMemo(
    () => missionsOn && items.some((item) => item.kind === 'field_mission' && item.state === 'open' && (!raverOnly || item.harmReduction)
      && !!item.jurisdiction && US_STATE_CODE.test(item.jurisdiction.toLowerCase()) && standsAt(item, moment)),
    [items, moment, missionsOn, raverOnly],
  );
  const missionPlaces = useMemo(() => missions.places.flatMap((place) => {
    const middle = regionPlace(placeOutline(place.code)!);
    return middle ? [{ place, position: latLngToGlobeWorld(middle.lat, middle.lng, GLOBE_RADIUS_UNITS * REPORT_SPRITES) }] : [];
  }), [missions, placeOutline]);

  // The outlines: rebuilt only when the places change.
  useEffect(() => {
    const group = outlinesRef.current;
    if (!missions.places.length) return undefined;
    const lines = GeometryFactory.buildBorderLines(
      missions.places.flatMap((place) => outlineOf(place.code, placeOutline(place.code)!)),
      { elevation: MISSION_OUTLINE_ELEVATION, color: toColor(DATA_SCALES.heroWatch), opacity: MISSION_OUTLINE_OPACITY },
    );
    lines.userData = { type: MISSION_OUTLINE_TYPE, places: missions.places.map((place) => place.code) };
    group.add(lines);
    return () => {
      group.remove(lines);
      lines.traverse((line) => {
        if (!(line as THREE.Line).isLine) return;
        (line as THREE.Line).geometry.dispose();
        ((line as THREE.Line).material as THREE.Material).dispose();
      });
    };
  }, [missions, placeOutline]);

  // The tints: rebuilt only when the countries change.
  useEffect(() => {
    const fills = fillsRef.current;
    if (!relief.countries.length || !territories) return undefined;
    const features = relief.countries.flatMap((country) => polygonsOf(country.code, territories.byCode(country.code) as RegionOutline));
    const fill = GeometryFactory.buildTerritoryPolygons(features, { color: toColor(DATA_SCALES.heroWatch), opacity: RELIEF_TINT_OPACITY, elevation: LIT_FILL_ELEVATION });
    fill.userData = { type: RELIEF_FILL_TYPE, countries: relief.countries.map((country) => country.code) };
    fill.renderOrder = RELIEF_FILLS_ORDER;
    fills.add(fill);
    return () => { fills.remove(fill); };
  }, [relief, territories]);

  // The pills' words, drawn once per set of words; null when there is no canvas to draw them on.
  // In the order they are placed, so the one that waits is never the busiest: relief, then the places with most missions.
  const pillEntries = useMemo(() => [
    ...reliefPlaces.map(({ country, position }) => ({ position, label: reliefPill(country) })),
    ...[...missionPlaces].sort((a, b) => b.place.missions.length - a.place.missions.length)
      .map(({ place, position }) => ({ position, label: missionsPill(place) })),
  ], [reliefPlaces, missionPlaces]);
  const pillLabels = useMemo(() => [...new Set(pillEntries.map((entry) => entry.label))].sort(), [pillEntries]);
  const pillKey = pillLabels.join('\n');
  const [pills, setPills] = useState<{ key: string; atlas: PillAtlas | null } | null>(null);
  useEffect(() => {
    if (!pillLabels.length) return undefined;
    let live = true;
    let baked: PillAtlas | null = null;
    void bakeHeroWatchPills(pillLabels).then((atlas) => {
      baked = atlas;
      if (live) setPills({ key: pillKey, atlas });
      else atlas?.texture.dispose();
    });
    return () => { live = false; baked?.texture.dispose(); };
    // pillKey stands for pillLabels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pillKey]);
  useEffect(() => {
    const group = pillsRef.current;
    const mesh = pills?.key === pillKey ? buildHeroWatchPills(pillEntries, pills.atlas) : null;
    if (!mesh) return undefined;
    group.add(mesh);
    return () => { group.remove(mesh); disposeHeroWatchPills(mesh); };
  }, [pills, pillKey, pillEntries]);

  // A card waits for the records while a section is on; for the countries' outlines while relief stands;
  // and for its pills while they are drawn. Once read, or once they cannot be, it may go.
  useEffect(() => {
    if (anyOn && !status.loaded && !status.error) readiness = { ready: false, why: 'Hero Watch was still being read from The Record' };
    else if (reliefStanding && !territories) readiness = { ready: false, why: 'Hero Watch\'s relief countries were still being outlined' };
    else if (missionsNeedStates && !statesSettled) readiness = { ready: false, why: 'Hero Watch\'s field mission states were still being outlined' };
    else if (pillLabels.length && pills?.key !== pillKey) readiness = { ready: false, why: 'Hero Watch\'s relief counts were still being drawn' };
    else readiness = { ready: true };
  }, [anyOn, status, reliefStanding, territories, missionsNeedStates, statesSettled, pillLabels, pills, pillKey]);
  useEffect(() => () => { readiness = { ready: true }; }, []);

  // The marks: a lifebuoy at each station, and a package at each country with relief, in one object.
  useEffect(() => {
    const group = spritesRef.current;
    clearGroup(group);
    // The busiest first, so a small station along the same coast is drawn over it, not hidden.
    const ordered = [...stations].sort((a, b) => (b.launches ?? -1) - (a.launches ?? -1));
    // The stations in an object of their own, which shrinks as the camera rises (HW15); the few packages and
    // clipboards stay their size.
    // Each mark opens the records its hover names, with their sources (D-CT, CT3): a field mission with its safety limits first.
    const stationMarks = ordered.map((station) => ({
      ...lifeboatMark(station, latLngToGlobeWorld(station.point!.lat, station.point!.lon, GLOBE_RADIUS_UNITS * REPORT_SPRITES)),
      opens: noteSet('Lifeboats', [station], heroWatchGlobeNote),
    }));
    const placeMarks: GlyphSpriteMark[] = [
      ...reliefPlaces.map(({ country, position }) => ({
        ...reliefMark(position, describeRelief(country)),
        opens: noteSet(`Relief · ${country.name}`, [...country.operations, ...(country.presence ? [country.presence] : [])], heroWatchGlobeNote),
      })),
      ...missionPlaces.map(({ place, position }) => ({
        ...missionMark(position, describeMissions(place)),
        opens: noteSet(`Field missions · ${place.name}`, place.missions, heroWatchGlobeNote),
      })),
    ];
    const stationPoints = stationMarks.length ? buildGlyphSprites(stationMarks, atlas, HERO_WATCH_LAYOUT, { sizeScaleFor: lifeboatSizeFor }) : null;
    const placePoints = placeMarks.length ? buildGlyphSprites(placeMarks, atlas, HERO_WATCH_LAYOUT) : null;
    if (stationPoints) group.add(stationPoints);
    if (placePoints) group.add(placePoints);
    return () => clearGroup(group);
  }, [stations, reliefPlaces, missionPlaces, atlas]);

  useEffect(() => {
    // Taken off by the cleanup below when the countries go.
    if (!reliefPlaces.length) return undefined;
    publishLegend('Relief', {
      layerId: 'Relief',
      layer: 'Relief',
      shapeMeans: 'a package in each country with relief, the country tinted whole: its notes are for the whole country',
      badgeMeans: 'its pill: Red Cross and Red Crescent operations (IFRC GO) · organisations at work (OCHA\'s count)',
      swatches: [{ color: DATA_SCALES.heroWatch, label: 'a country with relief, tinted in rescue orange' }],
    });
    return () => publishLegend('Relief', null);
  }, [reliefPlaces]);

  useEffect(() => {
    // Taken off by the cleanup below when the places go. Keyed as the layer that draws them.
    if (!missionPlaces.length) return undefined;
    const layerId = raverOnly ? 'RaverMissions' : 'FieldMissions';
    const kind = raverOnly ? 'harm-reduction field missions' : 'field missions';
    publishLegend(layerId, {
      layerId,
      layer: raverOnly ? 'Raver missions' : 'Field missions',
      shapeMeans: `a clipboard at each state or country with open ${kind}, the place outlined`,
      badgeMeans: 'its pill: the place · its open missions',
      swatches: [{ color: DATA_SCALES.heroWatch, label: `a place with open ${kind}, outlined in rescue orange`, shape: 'line' }],
    });
    return () => publishLegend(layerId, null);
  }, [missionPlaces, raverOnly]);

  useEffect(() => {
    if (!stations.length) return undefined;
    const uncounted = stations.some((station) => station.launches === undefined);
    const none = lifeboatAreasWithNone(stations);
    const coverage = lifeboatCoverage(stations);
    publishLegend('Lifeboats', {
      layerId: 'Lifeboats',
      layer: 'Lifeboats',
      when: 'launches in 2025',
      shapeMeans: `a lifebuoy at each of the ${stations.length} RNLI stations published on The Record${none.length ? `; none in ${inWords(none)}` : ''}${coverage ? `; ${coverage}` : ''}`,
      sizeMeans: "its launches in 2025, the RNLI's count: larger for more, the same scale on every view",
      swatches: [
        { color: DATA_SCALES.heroWatch, label: 'an RNLI station, rimmed in rescue orange' },
        ...(uncounted ? [{ color: GUNMETAL[400], label: 'its launches not counted, rimmed in grey' }] : []),
      ],
    });
    return () => publishLegend('Lifeboats', null);
  }, [stations]);

  const feeds = useMemo<FeedProvenance[]>(() => {
    const unreadSaid = unread.length ? ` Some Hero Watch notes are of a kind this build does not read (${unread.map((u) => u.kind).join(', ')}).` : '';
    const read = {
      lastUpdated: status.at === null ? null : new Date(status.at).toISOString(),
      error: status.error,
      loading: !status.loaded && !status.error,
    };
    const lifeboats: FeedProvenance[] = active.Lifeboats ? [{
      name: 'Lifeboats from RNLI',
      shortName: 'Lifeboats',
      layer: 'Lifeboats',
      ...read,
      note: `${lifeboatsNote(stations)}${unreadSaid}`,
      noteShort: lifeboatAreasWithNone(stations).length ? LIFEBOATS_NOTE_SHORT_PARTIAL : LIFEBOATS_NOTE_SHORT,
      credits: [CREDITS.rnliOpenData],
    }] : [];
    // Only the sources a drawn country carries are credited.
    const operations = relief.countries.some((country) => country.operations.length > 0);
    const presence = relief.countries.some((country) => country.presence !== null);
    const reliefFeed: FeedProvenance[] = active.Relief ? [{
      name: 'Relief from IFRC GO and OCHA via HDX',
      shortName: 'Relief',
      layer: 'Relief',
      ...read,
      note: `${reliefNote(relief.countries, relief.unplaced.length)}${active.Lifeboats ? '' : unreadSaid}`,
      noteShort: RELIEF_NOTE_SHORT,
      credits: [...(operations ? [CREDITS.ifrcGo] : []), ...(presence ? [CREDITS.ochaHdx] : [])],
    }] : [];
    const missionsFeed: FeedProvenance[] = missionsOn ? [{
      name: raverOnly ? 'Raver missions: harm-reduction field missions posted on The Record' : 'Field missions posted on The Record',
      shortName: raverOnly ? 'Raver missions' : 'Field missions',
      // The layer it feeds, as its legend is keyed (D-LS).
      layer: raverOnly ? 'RaverMissions' : 'FieldMissions',
      ...read,
      note: `${missionsNote(missions.places, missions.unplaced.length, raverOnly)}${active.Lifeboats || active.Relief ? '' : unreadSaid}`,
      noteShort: raverOnly ? RAVER_MISSIONS_NOTE_SHORT : MISSIONS_NOTE_SHORT,
      // Our own notes, nothing to credit: the operator dropped our name from every card (24 Oct; record D-L).
      credits: [],
    }] : [];
    return [...lifeboats, ...reliefFeed, ...missionsFeed];
  }, [active.Lifeboats, active.Relief, missionsOn, raverOnly, status, unread, stations, relief, missions]);

  const summary = useMemo(() => (anyOn
    ? items.filter((item): item is WeekSummary => item.kind === 'summary' && standsAt(item, moment))
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
    : null), [items, moment, anyOn]);
  const listed = useMemo(() => ({ relief: relief.unplaced, missions: missions.unplaced }), [relief, missions]);

  // On a card (step 7): what is drawn, by address, and the featured item's lines.
  const listing = useMemo<HeroWatchListing>(() => ({
    stations, relief: relief.countries, missions: missions.places,
    missionsLayer: raverOnly ? 'RaverMissions' : 'FieldMissions', regionOf: placeOutline,
  }), [stations, relief, missions, raverOnly, placeOutline]);
  const reports = useMemo(() => heroWatchShareReports(listing), [listing]);
  const featured = useMemo(() => (featuredId ? featuredHeroWatchFor(featuredId, listing) : null), [featuredId, listing]);
  const whyNotDrawn = useCallback((id: string): string | null | undefined => {
    const item = items.find((it) => it.id === id);
    if (!item) return undefined;
    if (reports.some((report) => report.id === id)) return null;
    if (item.kind === 'summary') return `"${id}" is Hero Watch's weekly summary, given in its panel and never drawn.`;
    const [what, section, label, on] = item.kind === 'station' ? ['a Hero Watch lifeboat station', 'Lifeboats', 'Lifeboats', active.Lifeboats]
      : item.kind === 'field_mission' ? ['a Hero Watch field mission', 'FieldMissions', 'Field missions', missionsOn]
        : ['a Hero Watch relief note', 'Relief', 'Relief', active.Relief];
    if (!on) return `"${id}" is ${what}, and ${label} is off: setLayer('${section}') or pinLayers(['${section}']).`;
    if (item.kind === 'field_mission' && item.state !== 'open') return `"${id}" is a closed Hero Watch field mission: closed missions are not drawn.`;
    if (item.kind === 'field_mission' && raverOnly && !item.harmReduction) {
      return `"${id}" is a Hero Watch field mission that is not harm reduction, which Raver missions alone does not draw: setLayer('FieldMissions').`;
    }
    if (!standsAt(item, moment)) return `"${id}" is ${what} that does not apply at the moment shown.`;
    return `"${id}" is ${what} that names no place drawn here.`;
  }, [items, reports, active.Lifeboats, active.Relief, missionsOn, raverOnly, moment]);

  // The week's front page from what is drawn (HW10): the week's card draws all three sections first.
  const weekOf = useCallback(() => heroWatchWeek({
    summary, relief: relief.countries, missions: missions.places, unplacedMissions: missions.unplaced.length, stations: stations.length,
    stationPoints: stations.flatMap((station) => (station.point ? [{ lat: station.point.lat, lng: station.point.lon }] : [])),
    middleOf: (code) => {
      const outline = placeOutline(code);
      const middle = outline ? regionPlace(outline) : null;
      return middle ? { lat: middle.lat, lng: middle.lng } : null;
    },
  }), [summary, relief, missions, stations, placeOutline]);

  // Hero Watch this week as a briefing playlist (HW13): its relief, then its open missions.
  const tourCandidates = useCallback((): TourOffer | null => (active.Relief || active.FieldMissions
    ? { candidates: heroCandidates(listing), complete: status.loaded || status.error !== null }
    : null), [active.Relief, active.FieldMissions, listing, status]);

  return {
    feeds, anyOn, stations, relief: relief.countries, missions: missions.places, summary, listed,
    sectionsOn: active.Lifeboats || active.Relief || active.FieldMissions,
    reports, featured, whyNotDrawn, weekOf, tourCandidates,
  };
}
