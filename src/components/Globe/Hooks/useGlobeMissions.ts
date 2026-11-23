/**
 * useGlobeMissions: Missions as a globe mode (decision D-MF, step 5; docs/missions/01-architecture-decisions/
 * missions-first-visit.md). The missions open to take, as the Missions app shows them (public, no grant
 * notice), from the one read of received packages it shares with the app (5a).
 *
 * Each place with open missions is outlined, with a clipboard at its middle and a pill counting them, as Hero
 * Watch draws its field missions (HW6, MF17), in the missions' rescue orange (HW8: the same mission, the same
 * colour, whichever mode shows it). Its hover names up to three, each with its safety limits; a click opens
 * that place's missions in the Missions panel, as cards to take. A mission naming no place, or one whose
 * outline is not drawn here, is listed in the panel as done from anywhere (MF16), never placed.
 *
 * On a card (step 5e) it says what it draws, in a feed line, and whenReady holds a card until the missions
 * are read, their states outlined and their pills drawn.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useReceivedPackages } from '../../../services/intel/useReceivedPackages';
import { describeMissionsAt, missionsByPlace, missionsPillText, openMissionCards, type MissionsAtPlace } from '../../../services/intel/received/missionPlaces';
import type { MissionCard } from '../../../services/intel/received/missionCard';
import { loadUsStates, US_STATE_CODE, type RegionOutline, type UsStates } from '../../../services/raverWatch/usStates';
import type { TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import { buildGlyphSprites, disposeIntelSprites, type GlyphSpriteMark } from '../intelReportSprites';
import { bakeHeroWatchPills, buildHeroWatchPills, disposeHeroWatchPills, HERO_WATCH_LAYOUT, heroWatchAtlas, missionMark, type PillAtlas } from '../heroWatchSprites';
import { GeometryFactory, type LineFeature } from '../../../geopolitical/geometry/geometryFactory';
import { regionPlace } from '../../../features/globe/capture/regionPlace';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { latLngToGlobeWorld, GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { drawAboveSurfaceLayers } from '../screenPoints';
import { REPORT_SPRITES } from '../globeAltitudes';
import { ridesShell } from '../../../globe-engine/shellLift';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import type { GlobeNote, GlobeNoteSet } from '../../../features/globe/noteDetail/globeNoteStore';
import type { FeedProvenance } from '../../../features/globe/capture/shareCardProvenance';
import { DATA_SCALES } from '../../../styles/tokens';

const GLOBE_RADIUS_UNITS = 100;
/** How the places' outlines are found by a probe or a test. */
export const MISSIONS_OUTLINE_TYPE = 'missionsPlaceOutlines';
/** How the pills are found by a probe. */
export const MISSIONS_PILL_TYPE = 'missionsPills';
/** Over the borders, as Hero Watch's mission outlines stand. */
const OUTLINE_ELEVATION = 0.35;
const OUTLINE_OPACITY = 0.85;
const toColor = (css: string) => parseInt(css.slice(1), 16);

const MISSIONS_NOTE_SHORT = 'Missions: open ones, where each names; every one carries its safety limits.';

/** What the card says of the missions drawn, and of those listed rather than drawn. */
function missionsNote(places: MissionsAtPlace[], anywhere: number): string {
  const open = places.reduce((n, place) => n + place.cards.length, 0);
  const listed = anywhere
    ? ` ${anywhere} name${anywhere === 1 ? 's' : ''} no place drawn here: listed in the Missions panel, not drawn.`
    : '';
  if (open === 0) return `Missions: no open mission names a place drawn here.${listed}`;
  return `Missions: ${open} open mission${open === 1 ? '' : 's'} in ${places.length} place${places.length === 1 ? '' : 's'}, as their `
    + `publishers post them, each place outlined, with a pill counting its missions. Every mission carries its safety `
    + `limits, which a hover gives.${listed} Closed missions and grant notices are not drawn.`;
}

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of Missions: false while its section is on and the missions are unread, unplaced or uncounted. */
export function missionsReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

/** A place's outline, as lines: every part's outer ring. */
function outlineOf(code: string, region: RegionOutline): LineFeature[] {
  const polygons = region.geometry.type === 'Polygon' ? [region.geometry.coordinates] : region.geometry.coordinates;
  return polygons.flatMap((rings, i) => (rings[0] && rings[0].length >= 2
    ? [{ id: `missions:${code}#${i}`, coordinates: rings[0] as [number, number][] }]
    : []));
}

/** A mission as a click shows it: its card's own words, its safety limits with it. */
function missionNote(card: MissionCard): GlobeNote {
  return {
    id: card.key, kind: 'Mission', title: card.headline,
    text: [card.stakes, ...card.steps.map((step) => `• ${step}`)].filter(Boolean).join('\n'),
    timeMs: card.publishedAt, sources: [],
    ...(card.limits ? { limits: card.limits } : {}),
  };
}

/** What a click on a place opens: its missions, in the Missions panel (MF17). */
export function placeNoteSet(place: MissionsAtPlace): GlobeNoteSet {
  return { heading: place.name, notes: place.cards.map(missionNote), panel: 'missions' };
}

export interface UseGlobeMissionsOptions {
  scene: THREE.Scene | null;
  /** Whether Missions' section is on. */
  active: boolean;
  /** The countries' outlines; undefined until they have loaded. */
  territories?: TerritoryIndex;
  /** For tests: the moment the missions are open at. */
  now?: number;
}

export interface MissionsOnGlobe {
  anyOn: boolean;
  /** The places drawn, each with its open missions. */
  places: MissionsAtPlace[];
  /** The open missions drawn nowhere: done from anywhere (MF16). */
  anywhere: MissionCard[];
  /** Whether the read is still under way: not every package in yet. */
  reading: boolean;
  /** One while its section is on, for the key and the card. */
  feeds: FeedProvenance[];
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if ((child as THREE.Points).isPoints) disposeIntelSprites(child as THREE.Points);
  }
}

export function useGlobeMissions({ scene, active, territories, now }: UseGlobeMissionsOptions): MissionsOnGlobe {
  const received = useReceivedPackages(active);

  // Live, the moment moves on by the minute, so a mission past its end leaves the globe.
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    if (!active || now !== undefined) return undefined;
    const timer = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(timer);
  }, [active, now]);
  const at = now ?? minute * 60_000;
  const cards = useMemo(() => (active ? openMissionCards(received.accepted, at) : []), [active, received.accepted, at]);

  // The US states' outlines, fetched once while the section is on: a mission names a state more often than not.
  const [usStates, setUsStates] = useState<UsStates | undefined>(undefined);
  const [statesSettled, setStatesSettled] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    void loadUsStates().then((loaded) => { if (live) { setUsStates(loaded); setStatesSettled(true); } });
    return () => { live = false; };
  }, [active]);
  const placeOutline = useMemo(
    () => (code: string): RegionOutline | null => (US_STATE_CODE.test(code) ? usStates?.get(code) : territories?.byCode(code)) ?? null,
    [usStates, territories],
  );
  const missions = useMemo(() => missionsByPlace(cards, placeOutline), [cards, placeOutline]);
  const placed = useMemo(() => missions.places.flatMap((place) => {
    const middle = regionPlace(placeOutline(place.code)!);
    return middle ? [{ place, position: latLngToGlobeWorld(middle.lat, middle.lng, GLOBE_RADIUS_UNITS * REPORT_SPRITES) }] : [];
  }), [missions, placeOutline]);

  const [atlas, setAtlas] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    void heroWatchAtlas().then((texture) => { if (live) setAtlas(texture); });
    return () => { live = false; };
  }, [active]);

  const spritesRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  const pillsRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  // The places' outlines, ours to dispose. In the fills' frame.
  const outlinesRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    return group;
  })());
  useEffect(() => registerTooltipGroup(spritesRef.current), []);
  useEffect(() => {
    if (!scene) return undefined;
    const groups = [outlinesRef.current, spritesRef.current, pillsRef.current];
    scene.add(...groups);
    return () => { scene.remove(...groups); };
  }, [scene]);

  // The outlines: rebuilt only when the places change.
  useEffect(() => {
    const group = outlinesRef.current;
    if (!missions.places.length) return undefined;
    const lines = GeometryFactory.buildBorderLines(
      missions.places.flatMap((place) => outlineOf(place.code, placeOutline(place.code)!)),
      { elevation: OUTLINE_ELEVATION, color: toColor(DATA_SCALES.missions), opacity: OUTLINE_OPACITY },
    );
    lines.userData = { type: MISSIONS_OUTLINE_TYPE, places: missions.places.map((place) => place.code) };
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

  // A clipboard at each place's middle; its hover names its missions, its click opens them (MF17).
  useEffect(() => {
    const group = spritesRef.current;
    clearGroup(group);
    if (!atlas || !placed.length) return undefined;
    const marks: GlyphSpriteMark[] = placed.map(({ place, position }) => ({
      ...missionMark(position, describeMissionsAt(place)),
      opens: placeNoteSet(place),
    }));
    group.add(buildGlyphSprites(marks, atlas, HERO_WATCH_LAYOUT));
    return () => clearGroup(group);
  }, [placed, atlas]);

  // The pills' words, drawn once per set of words, the busiest place first.
  const pillEntries = useMemo(
    () => [...placed].sort((a, b) => b.place.cards.length - a.place.cards.length).map(({ place, position }) => ({ position, label: missionsPillText(place) })),
    [placed],
  );
  const pillKey = useMemo(() => [...new Set(pillEntries.map((entry) => entry.label))].sort().join('\n'), [pillEntries]);
  const [pills, setPills] = useState<{ key: string; atlas: PillAtlas | null } | null>(null);
  useEffect(() => {
    if (!pillKey) return undefined;
    let live = true;
    let baked: PillAtlas | null = null;
    void bakeHeroWatchPills(pillKey.split('\n'), 2, DATA_SCALES.missions).then((pillAtlas) => {
      baked = pillAtlas;
      if (live) setPills({ key: pillKey, atlas: pillAtlas });
      else pillAtlas?.texture.dispose();
    });
    return () => { live = false; baked?.texture.dispose(); };
  }, [pillKey]);
  useEffect(() => {
    const group = pillsRef.current;
    const mesh = pills?.key === pillKey ? buildHeroWatchPills(pillEntries, pills.atlas, MISSIONS_PILL_TYPE) : null;
    if (!mesh) return undefined;
    group.add(mesh);
    return () => { group.remove(mesh); disposeHeroWatchPills(mesh); };
  }, [pills, pillKey, pillEntries]);

  const reading = active && !received.loaded;
  const needsStates = useMemo(() => cards.some((card) => !!card.place?.state), [cards]);
  // A card waits for the missions while the section is on; for the states' outlines while one names a state;
  // and for its pills while they are drawn. Once read, or once they cannot be, it may go.
  useEffect(() => {
    if (reading) readiness = { ready: false, why: 'Missions were still being read' };
    else if (active && needsStates && !statesSettled) readiness = { ready: false, why: 'Missions\' states were still being outlined' };
    else if (active && pillKey && pills?.key !== pillKey) readiness = { ready: false, why: 'Missions\' counts were still being drawn' };
    else readiness = { ready: true };
  }, [reading, active, needsStates, statesSettled, pillKey, pills]);
  useEffect(() => () => { readiness = { ready: true }; }, []);

  const feeds = useMemo<FeedProvenance[]>(() => (active ? [{
    name: 'Missions: Mission Packages, as their publishers post them',
    shortName: 'Missions',
    layer: 'OpenMissions',
    lastUpdated: null,
    timestamped: false,
    loading: reading,
    note: missionsNote(missions.places, missions.anywhere.length),
    noteShort: MISSIONS_NOTE_SHORT,
  }] : []), [active, reading, missions]);

  useEffect(() => {
    // Taken off by the cleanup below when the places go.
    if (!placed.length) return undefined;
    publishLegend('OpenMissions', {
      layerId: 'OpenMissions',
      layer: 'Open missions',
      shapeMeans: 'a clipboard at each state or country with open missions, the place outlined; a click opens them',
      badgeMeans: 'its pill: the place · its open missions',
      swatches: [{ color: DATA_SCALES.missions, label: 'a place with open missions, outlined in rescue orange', shape: 'line' }],
    });
    return () => publishLegend('OpenMissions', null);
  }, [placed]);

  return {
    anyOn: active,
    places: missions.places,
    anywhere: missions.anywhere,
    reading,
    feeds,
  };
}
