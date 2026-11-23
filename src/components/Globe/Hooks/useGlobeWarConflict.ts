/**
 * War & Conflict on the globe (decisions WC1-WC4 of 2026-10-02).
 *
 * Mecha Jono's parsed war news and its map of the world's wars, read from The
 * Record only while the layer is on, drawn in two parts:
 *
 *   the items   each standing at the moment the globe shows, as its glyph on
 *               its backing (warConflictSprites.ts): at its point, to 0.1°,
 *               with a faint ring when the point stands for a province; or,
 *               when it names only a country, one mark for the country's items
 *               at the country's centre, whose hover says they are about the
 *               country as a whole (WC4: 47 of the first day's 57 named only a
 *               country, and an outline has no hover);
 *   the war map under them, each war's countries filled by its tier in the
 *               token set's severity ramp, a country in two wars by the
 *               higher.
 *
 * What is not drawn is said, in the feed: what is past its three days, and
 * what names no place drawn here. The brief panel (WC3, block D) will list
 * those. Conflict Zones is a separate layer and is left as it is (WC2).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { latLngToGlobeWorld, GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { drawAboveSurfaceLayers } from '../screenPoints';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { noteSet, warConflictGlobeNote } from '../../../features/globe/noteDetail/globeNotesOf';
import { CLOUDS, REPORT_SPRITES, SURFACE_LINES } from '../globeAltitudes';
import { buildGlyphSprites, disposeIntelSprites } from '../intelReportSprites';
import { declutterSprites } from '../glyphDeclutter';
import { ringRadiusPx } from '../glyphOverlays';
import {
  warConflictAtlas, warConflictBadgeAtlas, warConflictSpriteMark, WAR_CONFLICT_LAYOUT, WAR_CONFLICT_BACKING_LOOK, WAR_CONFLICT_GLYPH_MEANING,
} from '../warConflictSprites';
import {
  startWarConflict, subscribeWarConflict, warConflictSnapshot, warConflictStatus,
  type ConflictItem, type WarItem, type WarTier, WAR_TIERS,
} from '../../../services/warConflict/warConflict';
import {
  CONFLICT_BACKINGS, backingOf, describeConflictItem, fadeAt, glyphOf, sourceName, standsAt, stateForceArcs, unknownIn, warMapCountries,
  type ConflictBacking, type WarConflictMoment,
} from '../../../services/warConflict/warConflictView';
import { regionToOutline } from '../../../services/raverWatch/raverWatchView';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { GeometryFactory, type LineFeature, type PolygonFeature } from '../../../geopolitical/geometry/geometryFactory';
import { lineBatchData } from '../../../geopolitical/geometry/lineBatches';
import type { TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import type { RegionOutline } from '../../../services/raverWatch/usStates';
import type { FeedProvenance } from '../../../features/globe/capture/shareCardProvenance';
import { CREDITS } from '../../../features/globe/capture/sourceCredits';
import type { FeaturedReport, ShareReportInfo } from '../../../features/globe/capture/shareReports';
import { regionPlace } from '../../../features/globe/capture/regionPlace';
import { warConflictShareReports, featuredWarConflictFor } from '../../../features/globe/capture/warConflictReports';
import { theatreDays, warConflictBrief, type WarConflictBrief } from '../../../services/warConflict/warConflictBrief';
import { warCandidates } from '../../../features/globe/tour/playlistSources';
import type { TourOffer } from '../../../features/globe/tour/briefingPlaylist';
import { FEATURED_SCALE, FEATURED_OTHERS_OPACITY } from './useGlobeIntelSprites';
import { ROLES, SEMANTIC } from '../../../styles/tokens';
import { ridesShell } from '../../../globe-engine/shellLift';
import { litTerritory } from '../litTerritory';
import { THEATRE_COUNTRIES } from '../../../services/warConflict/theatreCountries';
import { hatchMaterial, HATCH_OPACITY, FADED_HATCH_OPACITY } from '../warHatch';
import { onStill } from '../../../globe-engine/captureClock';
import { newSinceS, noteWarConflictRead, pageClockS } from '../../../services/warConflict/warConflictSeen';
import { setGlobeHatchingInUse } from '../../../services/globe/globeQuality';
import { TERRITORY_FILLS_ORDER } from '../../../geopolitical/theme/applyTerritoryLook';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const GLOBE_RADIUS_UNITS = 100;
const LAYER_ID = 'WarConflict';
const LAYER_LABEL = 'War & Conflict';
/** How this layer's fills are found by a probe or a test. */
export const WAR_MAP_TYPE = 'warMapFills';
/** A war's other countries, outlined (theatre-lens.md, TL1). */
export const WAR_MAP_EDGE_TYPE = 'warMapEdges';
/** And hatched, where the screen draws hatching and on every capture (theatre-lens.md, TL5). */
export const WAR_MAP_HATCH_TYPE = 'warMapHatching';
const OUTER_HATCHED = 'hatched: on a war\'s list, not where it is fought';
/** A state force's arc (theatre-lens.md, TL6): faint at the force's country, strong where it happened, so it reads one way. */
const ARC_FROM_ALPHA = 0.25;
const ARC_TO_ALPHA = 0.9;
/** Thickness in degrees of arc, as the globe's arcs layer takes it: a thin solid line. */
const ARC_STROKE = 0.35;
/**
 * How high an arc rises at its middle, in globe radii, for each radian it reaches, and
 * its least and most. At 0.3 and up to 0.45, an arc from across the planet looped far
 * outside the globe's edge and took the picture over.
 */
const ARC_RISE = 0.2;
const ARC_LOWEST = 0.03;
const ARC_HIGHEST = 0.25;
/** Short, as every key line is: the hover says the rest. */
/** Coloured as its item: a grey arc is a report's, a red one a critical warning's or a report of deaths. */
const ARC_KEY = 'an arc: a state\'s forces from another country, coloured as its item';
const OUTER_OUTLINED = 'outlined: on a war\'s list, not where it is fought';
/** How strongly an outlined country's edge is drawn: a line reads at less than a fill. */
const EDGE_OPACITY = 0.55;
/** The war map under a featured item (TL1): still there, and out of its way. */
const FADED_FILL_OPACITY = 0.08;
const FADED_EDGE_OPACITY = 0.2;
/**
 * Over the clouds, which veiled the fills at the base map's height, and under the
 * borders, so a disputed border still reads across a war's countries.
 */
const FILL_ELEVATION = ((CLOUDS + SURFACE_LINES) / 2 - 1) * GLOBE_RADIUS_UNITS;
/**
 * After the countries' own fills and before the borders (100), as relief's tint is. Drawn at no order,
 * the war map went first, and a card's Quiet style, one dark tone over every country, washed a major
 * war's red to salmon. Set on each fill, edge and hatching group: a group's own order is the one three.js
 * sorts its children by, so the parent's would not reach them.
 */
const WAR_MAP_ORDER = TERRITORY_FILLS_ORDER + 1;
/**
 * How solid each tier's fill is. The colour says the tier, and so does this: at
 * one opacity a list that names every country a war touches turned Russia and
 * North Africa into one wash, and the eye could not find the worst wars in it.
 */
export const TIER_OPACITY: Record<WarTier, number> = { major_war: 0.36, minor_war: 0.28, conflict: 0.21, skirmish: 0.15 };
/** A province's ring: an area, drawn faintly, not a border. */
const RING_ELEVATION = 0.35;
const RING_DEG = 1.5;
const RING_OPACITY = 0.35;
/** At most this many of a country's items are named in its hover; the rest are counted. */
const ITEMS_NAMED = 5;
/**
 * A deaths ring (W4): its radius grows with the square root of the largest death toll reported, so its area grows
 * with the figure; 3 px a root puts 100 deaths at 30 px. Under 20 px, about 45 deaths, the mark's own ring says it.
 */
const DEATH_RING_PX_PER_ROOT = 3;
/** A war's trend in its hover (W4): the last week against the week before. */
const TREND_DAYS = 14;
const DEATH_RING_MIN_PX = 20;
/** The key's words for the rings, short enough for a card's key. */
export const DEATH_RING_KEY = 'a wider ring: more deaths reported, by area (the largest figure, never added)';
/** Casualty kinds that are deaths, in Mecha Jono's words. */
const DEATH_KINDS = /^(killed|dead|deaths?|fatalit(?:y|ies))$/i;
/** The largest death toll an item reports, as reported, never added across claims; 0 for none. */
export function deathsReported(item: ConflictItem): number {
  return item.casualties.reduce((most, c) => (c.count !== null && DEATH_KINDS.test(c.kind) ? Math.max(most, c.count) : most), 0);
}
/** A ping's ink: the palette's lightest, for "new", which no backing colour means. */
const PING_INK = ROLES.text.heading;

/** Each tier in the severity ramp: skirmishes the mildest, a major war the worst. */
export const TIER_COLOR: Record<WarTier, string> = {
  major_war: SEMANTIC.severity[3],
  minor_war: SEMANTIC.severity[2],
  conflict: SEMANTIC.severity[1],
  skirmish: SEMANTIC.severity[0],
};
/** What the key calls each tier, and what it means, shortened from the list's own words. */
const TIER_KEY: Record<WarTier, { name: string; means: string }> = {
  major_war: { name: 'Major war', means: '10,000 or more combat deaths a year' },
  minor_war: { name: 'Minor war', means: '1,000 to 9,999' },
  conflict: { name: 'Conflict', means: '100 to 999' },
  skirmish: { name: 'Skirmishes', means: 'under 100' },
};

/** The standing note as a card prints it (IM11). */
const STANDING_NOTE_SHORT = 'War & Conflict items stand three days; casualty claims are as reported, never added.';
/** Said when items name an event type or source this build does not know (IX1); the feed names them. */
const DRIFT_NOTE = 'This build does not know every event type or source these items name (the feed lists them): those are drawn '
  + 'by their category or as a report, and named by their id.';
const DRIFT_NOTE_SHORT = 'Some items name an event or source this build does not know.';

/** What every feed of this layer says of its data. */
const STANDING_NOTE = 'War & Conflict: each item stands for three days from when it was reported, or until a warning '
  + 'ends; a point is placed no finer than about 11 km, and a mark at a country\'s centre is news about the whole country. '
  + 'Casualty claims are shown as reported, each side apart, never added.';

export interface UseGlobeWarConflictOptions {
  scene: THREE.Scene | null;
  /** Whether the layer is on. */
  active: boolean;
  territories: TerritoryIndex | undefined;
  /** The window chosen on the timeline, in ms; null while live. */
  window: { start: number; end: number } | null;
  /** The report chosen to feature in a capture (featuredReportStore), or null. */
  featuredId?: string | null;
  /**
   * The theatres the lens is on (WC3; theatre-lens.md, TL2, TL15): the one a person
   * picked in the brief, or a card's own, up to four. Their countries are lit, the
   * rest of the war map faded and the other theatres' items dimmed. Empty: no lens.
   */
  theatres?: readonly string[];
  /**
   * Whether the screen draws the hatching of a war's outer countries: given up first
   * on a weak device (globeQuality.ts, theatre-lens.md, TL5). Every capture draws it.
   */
  hatching?: boolean;
  /**
   * What is drawn, as the second left rail chose (critique-2026-11-01, OR1; plan B1): the items, the forces' arcs,
   * the deaths rings and the war map, each on unless turned off. The key names only what is drawn.
   */
  show?: Partial<WarConflictShow>;
}

export interface WarConflictShow { items: boolean; arcs: boolean; deaths: boolean; map: boolean }
const NO_ARCS: WarArc[] = [];

export interface WarConflictOnGlobe {
  /** The items feed and the war map's, while the layer is on. */
  feeds: FeedProvenance[];
  /** The items drawn, as the handle lists them (contract v10). */
  reports: ShareReportInfo[];
  /** The featured item as the card states it, when it is one of these and drawn. */
  featured: FeaturedReport | null;
  /**
   * The War & Conflict Brief of a UTC day, the newest with items unless one is
   * named, from everything read (IM16); null while the layer is off or that day
   * has none.
   */
  /** The day's brief; `capture` for a card or clip, which never quotes a note that names a person (D-NP, NP2). */
  briefOf(day?: string, options?: { capture?: boolean }): WarConflictBrief | null;
  /** The UTC days with items read, newest first, for the brief's day (WC3). */
  briefDays: string[];
  /** The items of the given ids, in their order: a brief's lines (WC3). */
  itemsByIds(ids: readonly string[]): ConflictItem[];
  /** What a briefing tour of today would stop at, and whether the read is done (briefing-playlists.md, BP5); null while the layer is off. */
  tourCandidates(): TourOffer | null;
  /** A theatre as its card states it (theatre-lens.md, TL3); null while the layer is off or nothing read names it. */
  theatreFacts(slug: string): TheatreFacts | null;
  /** The theatres anything read names, by slug, for a refusal to list. */
  theatreSlugs(): string[];
  /** The theatres whose countries are lit now, none when an item is featured: what the globe draws, not what was asked. */
  theatreLit(): readonly string[];
  /** State forces' arcs, for the globe's arcs layer (theatre-lens.md, TL6); none while the layer is off. */
  arcs: WarArc[];
  /** Each theatre's items a day, ending on a brief's day, from everything read (TL7): its chip's sparkline. */
  theatreDaysTo(day: string): Map<string, Array<{ day: string; count: number | null }>>;
}

/** A state force named in an item, from their country to where it happened, as the globe's arcs layer draws it (TL6). */
export interface WarArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  /** Faint at the force's country, strong where it happened. */
  color: [string, string];
  /** What the line is, in words: never a path anything took. Plain text; escaped where it is set as HTML. */
  label: string;
  /** Height over the ground at its middle, in globe radii, by how far it reaches. */
  altitude: number;
  /** Thickness, in degrees of arc. */
  stroke: number;
  /** The item's backing, which colours it. */
  backing: ConflictBacking;
  /** What a click on it opens (W3): every item standing that names this force acting from this country, newest first. */
  opens?: ReturnType<typeof noteSet>;
}

const rgbaOf = (hex: string, alpha: number) =>
  `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')}, ${Number(alpha.toFixed(3))})`;
/** The angle between two places, in radians. */
const angleBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** A theatre, for its card (theatre-lens.md, TL3). */
export interface TheatreFacts {
  slug: string;
  name: string;
  /** Its items drawn now, as listReports lists them. */
  reports: ShareReportInfo[];
  /** The worst war on Wikipedia's list that names it, or null. */
  war: { name: string; tierLabel: string } | null;
  /** Its countries with an outline here, to frame when none of its items is drawn. */
  countries: Array<{ code: string; region: RegionOutline }>;
}

const toColor = (css: string) => parseInt(css.slice(1), 16);

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if ((child as THREE.Points).isPoints) disposeIntelSprites(child as THREE.Points);
    child.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh && !(node as THREE.Line).isLine) return;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
  }
}

/**
 * A country's outline as polygons to fill, every part of it, under ids of the
 * war map's own and its tier's. GeometryFactory caches a fill by id and shape,
 * and a cached fill keeps the colour and opacity it was first built with: an id
 * shared with another layer, or with another tier, would draw in their colour.
 */
/** A country's outline as lines: every part's outer ring, for a country on a war's list where it is not fought (TL1). */
function edgesOf(code: string, tier: WarTier, region: RegionOutline): LineFeature[] {
  const polygons = region.geometry.type === 'Polygon' ? [region.geometry.coordinates] : region.geometry.coordinates;
  return polygons.flatMap((rings, i) => (rings[0] && rings[0].length >= 3
    ? [{ id: `war-map-edge:${tier}:${code}#${i}`, coordinates: rings[0] as [number, number][] }]
    : []));
}

function polygonsOf(code: string, tier: WarTier, region: RegionOutline): PolygonFeature[] {
  const polygons = region.geometry.type === 'Polygon' ? [region.geometry.coordinates] : region.geometry.coordinates;
  return polygons.flatMap((rings, i) => (rings[0] && rings[0].length >= 3
    ? [{ id: `war-map:${tier}:${code}#${i}`, rings: rings as [number, number][][] }]
    : []));
}

/**
 * A tier's outer countries hatched (theatre-lens.md, TL5), over the fill geometry
 * GeometryFactory keeps for them: each country its own material, round its middle,
 * so its lines run at 45° on its ground.
 */
function hatchingOf(tier: WarTier, countries: ReadonlyArray<{ code: string; region: RegionOutline }>): THREE.Group {
  const group = new THREE.Group();
  for (const { code, region } of countries) {
    const middle = regionPlace(region);
    const parts = middle
      ? GeometryFactory.buildTerritoryPolygons(polygonsOf(code, tier, region), { color: toColor(TIER_COLOR[tier]), opacity: TIER_OPACITY[tier], elevation: FILL_ELEVATION }).children
      : [];
    if (!middle || parts.length === 0) continue;
    const material = hatchMaterial(toColor(TIER_COLOR[tier]), HATCH_OPACITY, middle);
    for (const part of parts) {
      const mesh = new THREE.Mesh((part as THREE.Mesh).geometry, material);
      mesh.name = `war-hatch:${code}`;
      group.add(mesh);
    }
  }
  group.userData = { type: WAR_MAP_HATCH_TYPE, tier, countries: countries.map((c) => c.code) };
  return group;
}

/** A faint ring round a point that stands for a whole province. */
function ringAround(point: { lat: number; lon: number }, id: string): LineFeature {
  const coordinates: Array<[number, number]> = [];
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * 2 * Math.PI;
    coordinates.push([point.lon + (RING_DEG * Math.cos(a)) / Math.max(Math.cos((point.lat * Math.PI) / 180), 0.2), point.lat + RING_DEG * Math.sin(a)]);
  }
  return { id, coordinates };
}

const rankOf = (backing: ConflictBacking) => CONFLICT_BACKINGS.indexOf(backing);
const NO_THEATRES: readonly string[] = [];

/** Draws the layer while it is on, and returns its feeds and its items for the card and the handle. */
export function useGlobeWarConflict({
  scene, active, territories, window, featuredId = null, theatres = NO_THEATRES, hatching = true, show = {},
}: UseGlobeWarConflictOptions): WarConflictOnGlobe {
  const showItems = show.items !== false;
  const showArcs = show.arcs !== false;
  const showDeaths = show.deaths !== false;
  const showMap = show.map !== false;
  // The lens by what it holds, not by the list's identity: a caller's new list of the same theatres changes nothing.
  const lensKey = theatres.join('\n');
  const lens = useMemo(() => (lensKey ? lensKey.split('\n') : NO_THEATRES), [lensKey]);
  useEffect(() => (active ? startWarConflict() : undefined), [active]);
  const snapshot = useSyncExternalStore(subscribeWarConflict, warConflictSnapshot, warConflictSnapshot);
  const status = useSyncExternalStore(subscribeWarConflict, warConflictStatus, warConflictStatus);

  // Live, the moment moves on by the minute: often enough to fade and end an item.
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    if (!active || window) return;
    setMinute(Math.floor(Date.now() / 60_000));
    const timer = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(timer);
  }, [active, window]);
  const windowStart = window?.start ?? null;
  const windowEnd = window?.end ?? null;
  const moment = useMemo<WarConflictMoment>(() => (windowStart !== null && windowEnd !== null
    ? { atS: windowEnd / 1000, window: { fromS: windowStart / 1000, untilS: windowEnd / 1000 } }
    : { atS: minute * 60, window: null }), [minute, windowStart, windowEnd]);

  const [atlas, setAtlas] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let live = true;
    void warConflictAtlas().then((texture) => { if (live) setAtlas(texture); });
    return () => { live = false; };
  }, []);
  const [badges, setBadges] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let live = true;
    void warConflictBadgeAtlas().then((texture) => { if (live) setBadges(texture); });
    return () => { live = false; };
  }, []);

  const spritesRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  // Built in the globe mesh's frame, hung off the scene: turned into the scene's frame (see useGlobeRegionMarks).
  const areasRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    return group;
  })());
  // The war map's fills, which GeometryFactory's cache owns: removed, never disposed here.
  const fillsRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    return group;
  })());
  /*
   * The hatching is the screen's to give up on a weak device, first, with the glow
   * (theatre-lens.md, TL5), and every capture draws it: a still costs no frame time.
   */
  const hatchingRef = useRef(hatching);
  hatchingRef.current = hatching;
  const setHatchShown = useCallback((shown: boolean) => {
    for (const group of fillsRef.current.children) if (group.userData.type === WAR_MAP_HATCH_TYPE) group.visible = shown;
  }, []);
  // The featured item's country, lit as a featured territory is (TL1; litTerritory.ts), in the fills' frame.
  const litRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    return group;
  })());
  // The theatres lit now, set as their countries are drawn (TL3): a card waits for them.
  const theatreLitRef = useRef<readonly string[]>(NO_THEATRES);
  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('WarConflict', spritesRef.current);
  useLayerRoot('WarConflict', areasRef.current);
  useLayerRoot('WarConflict', fillsRef.current);
  useEffect(() => registerTooltipGroup(spritesRef.current), []);
  // The rail's choices (plan B1): a part turned off is hidden, its hover with it.
  useEffect(() => {
    spritesRef.current.visible = showItems;
    areasRef.current.visible = showItems;
    fillsRef.current.visible = showMap;
  }, [showItems, showMap]);
  useEffect(() => {
    if (!scene) return;
    const groups = [fillsRef.current, spritesRef.current, areasRef.current, litRef.current];
    groups.forEach((group) => scene.add(group));
    return () => { groups.forEach((group) => scene.remove(group)); };
  }, [scene]);

  const regionOf = useMemo(() => (code: string): RegionOutline | null => {
    const outlined = regionToOutline(code, (c) => (territories?.byCode(c) ?? null) !== null);
    return outlined ? (territories?.byCode(outlined) as RegionOutline | null) ?? null : null;
  }, [territories]);
  const regionName = useMemo(() => (code: string) => regionOf(code)?.name ?? null, [regionOf]);

  /** The items standing now, on a place drawn here: a point, or a country with an outline. */
  const standing = useMemo(() => (active ? snapshot.items.filter((it) => standsAt(it, moment)) : []), [active, snapshot, moment]);
  const drawn = useMemo(() => standing.filter((it) => it.point || (it.jurisdiction && regionOf(it.jurisdiction))), [standing, regionOf]);
  // Every war, whatever theatre is picked: the lens fades the rest of the map rather than hiding it (TL2).
  const wars = useMemo(() => (active ? snapshot.wars : []), [active, snapshot]);
  /*
   * The lens's theatres' countries, to light (theatre-lens.md, TL2): as Mecha Jono's
   * vocabulary lists them, or, for a theatre it does not, the countries its items name.
   */
  const theatreCountries = useMemo(() => {
    // Kept picked while the layer is off, and lit only while it is on.
    if (lens.length === 0 || !active) return [];
    const outlined = (c: string) => (territories?.byCode(c) ?? null) !== null;
    const codes = lens.flatMap((slug) => THEATRE_COUNTRIES[slug] ?? snapshot.items
      .filter((it) => it.theatre?.slug === slug && it.jurisdiction)
      .map((it) => regionToOutline(it.jurisdiction!, outlined))
      .filter((code): code is string => code !== null));
    return [...new Set(codes)].filter(outlined);
  }, [lens, active, snapshot, territories]);

  /**
   * Each tier's countries that have an outline here, worst tier first: filled where
   * its wars are fought, outlined where they are only listed (theatre-lens.md, TL1).
   * A country in two wars takes the higher; one any war fills is never outlined.
   */
  const shaded = useMemo(() => {
    const map = [...warMapCountries(wars)].filter(([code]) => territories?.byCode(code));
    return WAR_TIERS.map((tier) => ({
      tier,
      countries: map.filter(([, entry]) => entry.tier === tier && entry.filled).map(([code]) => code),
      outlined: map.filter(([, entry]) => entry.tier === tier && !entry.filled).map(([code]) => code),
      // How many wars of the tier are on the list, for the key.
      wars: wars.filter((w) => w.tier === tier).length,
    })).filter((entry) => entry.countries.length > 0 || entry.outlined.length > 0);
  }, [wars, territories]);

  // ── The war map: rebuilt only when the wars or the outlines change, not each minute ──
  useEffect(() => {
    const fills = fillsRef.current;
    for (const { tier, countries, outlined } of shaded) {
      if (countries.length > 0) {
        const features = countries.flatMap((code) => polygonsOf(code, tier, territories!.byCode(code) as RegionOutline));
        const fill = GeometryFactory.buildTerritoryPolygons(features, { color: toColor(TIER_COLOR[tier]), opacity: TIER_OPACITY[tier], elevation: FILL_ELEVATION });
        fill.userData = { type: WAR_MAP_TYPE, tier, countries };
        fill.renderOrder = WAR_MAP_ORDER;
        fills.add(fill);
      }
      if (outlined.length > 0) {
        const edges = outlined.flatMap((code) => edgesOf(code, tier, territories!.byCode(code) as RegionOutline));
        const lines = GeometryFactory.buildBorderLines(edges, { color: toColor(TIER_COLOR[tier]), opacity: EDGE_OPACITY, elevation: FILL_ELEVATION });
        lines.userData = { type: WAR_MAP_EDGE_TYPE, tier, countries: outlined };
        lines.renderOrder = WAR_MAP_ORDER;
        fills.add(lines);
        const hatched = hatchingOf(tier, outlined.map((code) => ({ code, region: territories!.byCode(code) as RegionOutline })));
        hatched.renderOrder = WAR_MAP_ORDER;
        fills.add(hatched);
      }
    }
    // Shown as the screen draws it; a capture shows it for its own render (onStill, below).
    setHatchShown(hatchingRef.current);
    return () => {
      [...fills.children].forEach((child) => {
        fills.remove(child);
        // The hatching's materials are ours; its geometry, as every fill's, is GeometryFactory's.
        if (child.userData.type === WAR_MAP_HATCH_TYPE) child.traverse((part) => { if ((part as THREE.Mesh).isMesh) ((part as THREE.Mesh).material as THREE.Material).dispose(); });
      });
    };
  }, [shaded, territories, setHatchShown]);

  /*
   * What the war map says and opens (W3, on D-GV GV0.4's picking): a country where a war is fought, its fill; one
   * only on a war's list, its hatching and outline. A hover names the wars and the worst tier; a click lists the
   * wars' pages, then the items standing in that country, newest first. Set on the parts the map just built, and
   * again as the items move on, so a hover never reads an hour-old count.
   */
  useEffect(() => registerTooltipGroup(fillsRef.current), []);
  useEffect(() => {
    const map = warMapCountries(wars);
    const outlinedHere = (c: string) => (territories?.byCode(c) ?? null) !== null;
    const names = new Intl.ListFormat('en', { type: 'conjunction' });
    const said = new Map<string, { tooltip: string; opens: ReturnType<typeof noteSet> | null }>();
    // Each war's last two weeks, from its theatres' days (W4): the items of each day, null before the reader's first.
    const today = new Date(moment.atS * 1000).toISOString().slice(0, 10);
    const days = theatreDays(snapshot.items, today, TREND_DAYS);
    const trendOf = (war: WarItem): string | null => {
      const series = war.theatres.map((t) => days.get(t.slug)).filter((d): d is NonNullable<typeof d> => d !== undefined);
      if (series.length === 0) return null;
      const perDay = series[0].map((_, i) => {
        const known = series.map((d) => d[i].count).filter((c): c is number => c !== null);
        return known.length ? known.reduce((a, b) => a + b, 0) : null;
      });
      const items = (from: number, to: number) => perDay.slice(from, to).reduce<number>((a, b) => a + (b ?? 0), 0);
      const half = TREND_DAYS / 2;
      const plural = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
      if (perDay.every((c) => c !== null)) return `${war.name}: ${plural(items(half, TREND_DAYS))} in the last ${half} days, ${items(0, half)} the ${half} before.`;
      const first = perDay.findIndex((c) => c !== null);
      if (first < 0) return null;
      return `${war.name}: ${plural(items(first, TREND_DAYS))} since ${series[0][first].day}, when Starcom first read it.`;
    };
    const sayOf = (code: string) => {
      const known = said.get(code);
      if (known) return known;
      const entry = map.get(code);
      if (!entry) return null;
      const name = regionName(code) ?? code.toUpperCase();
      const warsHere = entry.wars.map((n) => wars.find((w) => w.name === n)).filter((w): w is WarItem => w !== undefined);
      const itemsHere = drawn
        .filter((it) => it.jurisdiction && regionToOutline(it.jurisdiction, outlinedHere) === code)
        .sort((a, b) => b.reportedAt - a.reportedAt);
      const listed = names.format(entry.wars);
      const one = entry.wars.length === 1;
      const tooltip = [
        entry.filled ? `${name}: where ${listed} ${one ? 'is' : 'are'} fought.` : `${name}: on the list of ${listed}, not where ${one ? 'it is' : 'they are'} fought.`,
        `${TIER_KEY[entry.tier].name}, the worst here: ${TIER_KEY[entry.tier].means}.`,
        ...warsHere.map(trendOf).filter((line): line is string => line !== null),
        itemsHere.length
          ? `${itemsHere.length} ${itemsHere.length === 1 ? 'item stands' : 'items stand'} here. A click lists ${one ? "the war's page" : "the wars' pages"} and ${itemsHere.length === 1 ? 'it' : 'them'}.`
          : `A click opens ${one ? "the war's page" : "the wars' pages"}.`,
      ].join('\n');
      const say = { tooltip, opens: noteSet(`War & Conflict · ${name}`, [...warsHere, ...itemsHere], warConflictGlobeNote) ?? null };
      said.set(code, say);
      return say;
    };
    fillsRef.current.traverse((part) => {
      const mesh = part as THREE.Mesh;
      if (mesh.isMesh) {
        const code = /^territory:war-map:[^:]+:([^#]+)#/.exec(mesh.name)?.[1] ?? /^war-hatch:(.+)$/.exec(mesh.name)?.[1];
        const say = code ? sayOf(code) : null;
        if (say) Object.assign(mesh.userData, say);
      }
      for (const line of lineBatchData(part)?.lines ?? []) {
        const code = /^war-map-edge:[^:]+:([^#]+)#/.exec(line.id)?.[1];
        const say = code ? sayOf(code) : null;
        if (say) Object.assign(line, say);
      }
    });
  }, [shaded, wars, drawn, territories, regionName, snapshot, moment]);

  useEffect(() => { setHatchShown(hatching); }, [hatching, setHatchShown]);
  useEffect(() => onStill({ still: () => setHatchShown(true), release: () => setHatchShown(hatchingRef.current) }), [setHatchShown]);
  // Whether there is hatching to give up, so the quality governor counts that step only while there is.
  const hatches = shaded.some((entry) => entry.outlined.length > 0);
  useEffect(() => {
    setGlobeHatchingInUse(hatches);
    return () => setGlobeHatchingInUse(false);
  }, [hatches]);

  /*
   * The item a card is about, standing out of the war map (theatre-lens.md, TL1):
   * every fill faded, every outline fainter, and the item's own country lit, so it
   * no longer sits in one small country inside a wash. Put back when it is no longer
   * featured. Run after the fills are built, so a rebuilt map is faded too.
   */
  const featuredItem = useMemo(() => (featuredId === null ? null : drawn.find((it) => it.id === featuredId) ?? null), [featuredId, drawn]);
  const featuredCountry = useMemo(
    () => (featuredItem?.jurisdiction ? regionToOutline(featuredItem.jurisdiction, (c) => (territories?.byCode(c) ?? null) !== null) : null),
    [featuredItem, territories],
  );
  useEffect(() => {
    // Faded under a featured item, and under a picked theatre (TL1, TL2).
    const featuring = featuredItem !== null || lens.length > 0;
    for (const group of fillsRef.current.children) {
      const tier = group.userData.tier as WarTier;
      if (group.userData.type === WAR_MAP_HATCH_TYPE) {
        group.traverse((part) => {
          if ((part as THREE.Mesh).isMesh) ((part as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uOpacity.value = featuring ? FADED_HATCH_OPACITY : HATCH_OPACITY;
        });
        continue;
      }
      const opacity = group.userData.type === WAR_MAP_EDGE_TYPE
        ? (featuring ? FADED_EDGE_OPACITY : EDGE_OPACITY)
        : (featuring ? FADED_FILL_OPACITY : TIER_OPACITY[tier]);
      group.traverse((part) => {
        const material = (part as THREE.Mesh).material as THREE.Material | undefined;
        if (material && 'opacity' in material) material.opacity = opacity;
      });
    }
    const lit = litRef.current;
    // A featured item's country; else the picked theatre's. The item a card is about comes first.
    if (featuredItem) {
      if (featuredCountry && territories?.byCode(featuredCountry)) {
        lit.add(litTerritory((territories.byCode(featuredCountry) as RegionOutline).geometry, featuredCountry, 'war-lit:', 'war'));
      }
    } else {
      for (const code of theatreCountries) {
        lit.add(litTerritory((territories!.byCode(code) as RegionOutline).geometry, code, 'war-theatre-lit:', 'war-theatre'));
      }
    }
    theatreLitRef.current = featuredItem === null && active && territories ? lens : NO_THEATRES;
    return () => {
      for (const child of [...lit.children]) {
        lit.remove(child);
        // The fill is GeometryFactory's to keep; the edge's lines are ours.
        child.traverse((part) => { if ((part as THREE.Line).isLine) { (part as THREE.Line).geometry.dispose(); ((part as THREE.Line).material as THREE.Material).dispose(); } });
      }
    };
  }, [featuredItem, featuredCountry, lens, theatreCountries, shaded, territories, active]);

  /*
   * State forces' arcs (theatre-lens.md, TL6): a state's forces named in an item, from
   * their country to where it happened, in the item's backing colour and dimmed with it.
   * Drawn by the globe's arcs layer, so handed to the globe rather than added here.
   */
  const allArcs = useMemo<WarArc[]>(() => {
    // Nothing is drawn while the layer is off, so no arc is either.
    const outlined = (c: string) => (territories?.byCode(c) ?? null) !== null;
    const middleOf = (code: string) => {
      const region = regionOf(code);
      const place = region ? regionPlace(region) : null;
      return place ? { lat: place.lat, lng: place.lng } : null;
    };
    const byId = new Map(drawn.map((it) => [it.id, it]));
    const featuring = featuredId !== null && byId.has(featuredId);
    const found = stateForceArcs(drawn, {
      // Where its mark stands: its point, or its country's middle (WC4).
      placeOf: (it) => (it.point ? { lat: it.point.lat, lng: it.point.lon } : middleOf(regionToOutline(it.jurisdiction!, outlined) ?? '')),
      countryOf: (code) => regionToOutline(code, outlined),
      middleOf,
    });
    // A force's items, for its arcs to open: the same force from the same country, whichever item drew the arc.
    const forceKey = (arc: { actor: string; from: string }) => `${arc.from}|${arc.actor}`;
    const byForce = new Map<string, ConflictItem[]>();
    for (const arc of found) {
      const list = byForce.get(forceKey(arc)) ?? [];
      if (!list.some((it) => it.id === arc.itemId)) list.push(byId.get(arc.itemId)!);
      byForce.set(forceKey(arc), list);
    }
    return found.map((arc) => {
      const it = byId.get(arc.itemId)!;
      const dim = featuring ? it.id !== featuredId : lens.length > 0 && !lens.includes(it.theatre?.slug ?? '');
      const shown = dim ? FEATURED_OTHERS_OPACITY : 1;
      const backing = backingOf(it);
      const color = WAR_CONFLICT_BACKING_LOOK[backing].color;
      return {
        startLat: arc.start.lat,
        startLng: arc.start.lng,
        endLat: arc.end.lat,
        endLng: arc.end.lng,
        color: [rgbaOf(color, ARC_FROM_ALPHA * shown), rgbaOf(color, ARC_TO_ALPHA * shown)],
        label: `${arc.actor}, from ${regionName(arc.from) ?? arc.from.toUpperCase()}, named in "${it.title}". `
          + 'The arc joins their country to where it happened; it is not a path anything took. A click lists what names them.',
        opens: noteSet(
          `War & Conflict · ${arc.actor}, from ${regionName(arc.from) ?? arc.from.toUpperCase()}`,
          [...(byForce.get(forceKey(arc)) ?? [it])].sort((a, b) => b.reportedAt - a.reportedAt),
          warConflictGlobeNote,
        ),
        altitude: Math.min(ARC_HIGHEST, Math.max(ARC_LOWEST, angleBetween(arc.start, arc.end) * ARC_RISE)),
        stroke: ARC_STROKE,
        backing,
      };
    });
  }, [drawn, territories, regionOf, regionName, featuredId, lens]);
  // The rail can turn the arcs off (plan B1).
  const arcs = showArcs ? allArcs : NO_ARCS;

  // What this browser has seen, for the pings on what is new (W4).
  useEffect(() => { if (active) noteWarConflictRead(snapshot.items, status.loaded); }, [active, snapshot, status.loaded]);

  useEffect(() => {
    const sprites = spritesRef.current;
    const areas = areasRef.current;
    clearGroup(sprites);
    clearGroup(areas);
    if (!active) { publishLegend(LAYER_ID, null); return; }

    // ── The items ──
    const featuring = featuredId !== null && drawn.some((it) => it.id === featuredId);
    // A card's featured item comes first; else a theatre picked in the brief dims the others (WC3).
    const emphasis = (it: ConflictItem) => (featuring
      ? (it.id === featuredId ? { size: FEATURED_SCALE, opacity: 1 } : { size: 1, opacity: FEATURED_OTHERS_OPACITY })
      : lens.length > 0 && !lens.includes(it.theatre?.slug ?? '') ? { size: 1, opacity: FEATURED_OTHERS_OPACITY } : { size: 1, opacity: 1 });
    const describe = (it: ConflictItem) => describeConflictItem(it, regionName);
    // One mark a placed item; one mark for each country's items that name no place in it (WC4).
    const marks: Array<{ group: ConflictItem[]; at: { lat: number; lon: number }; country: string | null }> = [];
    const countries = new Map<string, ConflictItem[]>();
    for (const it of drawn) {
      if (it.point) { marks.push({ group: [it], at: it.point, country: null }); continue; }
      const code = regionToOutline(it.jurisdiction!, (c) => (territories?.byCode(c) ?? null) !== null)!;
      if (!countries.has(code)) countries.set(code, []);
      countries.get(code)!.push(it);
    }
    for (const [code, group] of countries) {
      const place = regionPlace(regionOf(code)!);
      if (place) marks.push({ group, at: { lat: place.lat, lon: place.lng }, country: code });
    }
    const backingsDrawn = new Set<ConflictBacking>();
    const glyphsDrawn = new Set<string>();
    const headingOf = (name: string | null) => (name ? `War & Conflict · ${name}` : 'War & Conflict');
    const built = marks.map(({ group, at, country }) => {
        const newest = [...group].sort((a, b) => b.reportedAt - a.reportedAt);
        const worst = newest.reduce((w, it) => (rankOf(backingOf(it)) < rankOf(backingOf(w)) ? it : w));
        backingsDrawn.add(backingOf(worst));
        glyphsDrawn.add(glyphOf(worst));
        const name = country === null ? null : regionName(country) ?? country.toUpperCase();
        // Each mark opens the reports its hover names, newest first, with their sources (D-CT, CT3).
        const mark = {
          ...warConflictSpriteMark(worst, latLngToGlobeWorld(at.lat, at.lon, GLOBE_RADIUS_UNITS * REPORT_SPRITES), moment, describe),
          opens: noteSet(headingOf(name), newest, warConflictGlobeNote),
        };
        const { size, opacity } = emphasis(worst);
        const solid = Math.max(...group.map((it) => fadeAt(it, moment)));
        if (country === null || name === null) return { ...mark, sizePx: mark.sizePx * size, opacity: (mark.opacity ?? 1) * opacity };
        const named = newest.slice(0, ITEMS_NAMED).map((it) => `• ${it.title}`);
        const more = group.length > ITEMS_NAMED ? [`and ${group.length - ITEMS_NAMED} more`] : [];
        return {
          ...mark,
          sizePx: mark.sizePx * size,
          opacity: solid * opacity,
          tooltip: [
            `${group.length} ${group.length === 1 ? 'report' : 'reports'} about ${name} as a whole, newest first:`,
            ...named, ...more,
            'The lines name no place in the country; the mark stands at its centre.',
          ].join('\n'),
        };
      });
    const points = buildGlyphSprites(
      built,
      atlas,
      WAR_CONFLICT_LAYOUT,
      { userData: { layer: LAYER_LABEL, layers: marks.map(() => LAYER_LABEL), ids: marks.map((m) => m.group[0].id) } },
    );
    // Whether any mark reports deaths enough for its own ring: the key names the rings only then.
    const ringed = showItems && showDeaths && marks.some(({ group }) => ringRadiusPx(Math.max(0, ...group.map(deathsReported)), DEATH_RING_PX_PER_ROOT, DEATH_RING_MIN_PX) > 0);
    if (points) {
      /*
       * Where marks crowd, the most important is drawn and the rest fold under it (W1): a card's featured item,
       * then the theatre picked, then a critical warning, then deaths reported, then the newest.
       */
      const newestOf = (group: ConflictItem[]) => Math.max(...group.map((it) => it.reportedAt));
      const keyOf = ({ group }: (typeof marks)[number]) => {
        const worst = group.reduce((w, it) => (rankOf(backingOf(it)) < rankOf(backingOf(w)) ? it : w));
        return [
          featuring && group.some((it) => it.id === featuredId) ? 0 : 1,
          emphasis(worst).opacity < 1 ? 1 : 0,
          rankOf(backingOf(worst)),
          -newestOf(group),
        ];
      };
      const keys = marks.map(keyOf);
      const order = marks.map((_, i) => i).sort((a, b) => {
        for (let k = 0; k < keys[a].length; k += 1) if (keys[a][k] !== keys[b][k]) return keys[a][k] - keys[b][k];
        return a - b;
      });
      const priority = new Array<number>(marks.length);
      order.forEach((i, rank) => { priority[i] = rank; });
      declutterSprites(points, {
        priority,
        counts: marks.map(({ group }) => group.length),
        badges,
        // Deaths as reported, the largest figure a mark stands for (W4): its ring's area grows with it.
        ...(showDeaths ? { rings: { values: marks.map(({ group }) => Math.max(0, ...group.map(deathsReported))), color: new THREE.Color(WAR_CONFLICT_BACKING_LOOK.deadly.color), pxPerRoot: DEATH_RING_PX_PER_ROOT, minPx: DEATH_RING_MIN_PX } } : {}),
        // New since this browser's last visit, or arrived while it is open (W4): a ping, on screen only.
        pings: { since: marks.map(({ group }) => Math.max(-1, ...group.map(newSinceS))), color: new THREE.Color(PING_INK), clock: pageClockS },
        // The drawn mark hovers and opens everything under it, newest first.
        pileOf: (top, under) => {
          const items = [top, ...under].flatMap((i) => marks[i].group).sort((a, b) => b.reportedAt - a.reportedAt);
          const country = marks[top].country;
          const name = country === null ? null : regionName(country) ?? country.toUpperCase();
          const others = under.reduce((sum, i) => sum + marks[i].group.length, 0);
          const beside = `${under.length} ${under.length === 1 ? 'mark' : 'marks'}`;
          return {
            tooltip: [
              built[top].tooltip ?? '',
              `Under it, ${beside} more (${others} ${others === 1 ? 'report' : 'reports'}): a click lists all ${items.length}, newest first.`,
            ].filter(Boolean).join('\n'),
            opens: noteSet(`${headingOf(name)}, with ${beside} beside it`, items, warConflictGlobeNote) ?? null,
          };
        },
      });
      sprites.add(points);
    }

    // A point that stands for a province reads as an area: a faint ring round it.
    for (const it of drawn) {
      if (!it.point || it.precision !== 'state') continue;
      areas.add(GeometryFactory.buildBorderLines([ringAround(it.point, `${it.id}#ring`)], {
        elevation: RING_ELEVATION,
        color: toColor(WAR_CONFLICT_BACKING_LOOK[backingOf(it)].color),
        opacity: RING_OPACITY * fadeAt(it, moment) * emphasis(it).opacity,
      }));
    }

    if (marks.length === 0 && shaded.length === 0) { publishLegend(LAYER_ID, null); return; }
    publishLegend(LAYER_ID, {
      layerId: LAYER_ID,
      layer: LAYER_LABEL,
      colorMeans: 'a mark\'s backing is the most serious thing about it; a country\'s fill is its war\'s tier on Wikipedia\'s list, '
        + 'where the war is fought; an outline in that colour is a country on its list where it is not',
      shapeMeans: `the glyph is what happened: ${[...glyphsDrawn].map((g) => WAR_CONFLICT_GLYPH_MEANING[g as keyof typeof WAR_CONFLICT_GLYPH_MEANING]).join(', ')}; `
        + 'a mark at a country\'s centre is news about the whole country; a ring is a province; '
        + 'a number on a mark counts the reports it stands for, with those of marks crowded under it; '
        + 'a wider ring round a mark, more deaths reported: its area grows with the largest figure, as reported, never added',
      swatches: [
        ...CONFLICT_BACKINGS.filter((b) => showItems && backingsDrawn.has(b)).map((b) => ({
          color: WAR_CONFLICT_BACKING_LOOK[b].color, label: WAR_CONFLICT_BACKING_LOOK[b].means, style: WAR_CONFLICT_BACKING_LOOK[b].backing,
        })),
        // A card prints its swatches, not shapeMeans: the wide rings say what they are where any is drawn (W4).
        ...(ringed ? [{ color: WAR_CONFLICT_BACKING_LOOK.deadly.color, label: DEATH_RING_KEY, style: 'ring' }] : []),
        ...(showMap ? shaded : []).map(({ tier, wars: count }) => ({
          color: TIER_COLOR[tier], label: `${TIER_KEY[tier].name}: ${count} (${TIER_KEY[tier].means})`, shape: 'area',
        })),
        /*
         * Outlines, hatched where the screen draws hatching, in the worst outlined tier's
         * colour: on a war's list, not where it is fought (TL1, TL5). A card hatches them always.
         */
        ...(showMap ? shaded : []).filter((entry) => entry.outlined.length > 0).slice(0, 1).map(({ tier }) => (hatching
          ? { color: TIER_COLOR[tier], label: OUTER_HATCHED, shape: 'hatch' }
          : { color: TIER_COLOR[tier], label: OUTER_OUTLINED, shape: 'line', card: { label: OUTER_HATCHED, shape: 'hatch' } })),
        // A state force's arc (TL6), in the most serious backing among the arcs drawn.
        ...(arcs.length ? [{
          color: WAR_CONFLICT_BACKING_LOOK[CONFLICT_BACKINGS.find((b) => arcs.some((arc) => arc.backing === b)) ?? 'report'].color,
          label: ARC_KEY, shape: 'arc',
        }] : []),
      ],
    });
    return () => {
      clearGroup(sprites);
      clearGroup(areas);
      publishLegend(LAYER_ID, null);
    };
  }, [active, drawn, shaded, atlas, badges, territories, regionOf, regionName, moment, featuredId, lens, hatching, arcs, showItems, showDeaths, showMap]);

  const reports = useMemo(() => warConflictShareReports(drawn, regionOf), [drawn, regionOf]);
  const featured = useMemo(() => {
    const it = featuredId === null ? undefined : drawn.find((d) => d.id === featuredId);
    return it ? featuredWarConflictFor(it, regionOf, regionName) : null;
  }, [drawn, regionOf, regionName, featuredId]);

  const feeds = useMemo<FeedProvenance[]>(() => {
    if (!active) return [];
    // What their spec has that this build does not know, said rather than drawn as if known (IX1).
    const unknown = unknownIn(standing);
    const drift = unknown.events.length > 0 || unknown.sources.length > 0;
    const common = {
      lastUpdated: status.at === null ? null : new Date(status.at).toISOString(),
      error: status.error,
      loading: !status.loaded && !status.error,
      note: drift ? `${STANDING_NOTE} ${DRIFT_NOTE}` : STANDING_NOTE,
      noteShort: drift ? `${STANDING_NOTE_SHORT} ${DRIFT_NOTE_SHORT}` : STANDING_NOTE_SHORT,
    };
    const sources = [...new Set(standing.map((it) => it.source).filter((s): s is string => !!s))].map(sourceName);
    const past = snapshot.items.filter((it) => !standsAt(it, moment) && it.reportedAt <= moment.atS).length;
    const noPlace = standing.length - drawn.length;
    const counted = (list: Array<{ id: string; count: number }>) => list.map(({ id, count }) => `${id} (${count})`).join(', ');
    const said = [
      past ? `${past} past its three days, not drawn` : '',
      noPlace ? `${noPlace} naming no place drawn here` : '',
      unknown.events.length ? `an event this build has no glyph for: ${counted(unknown.events)}, drawn by category or as a report` : '',
      unknown.sources.length ? `a source this build does not name: ${counted(unknown.sources)}` : '',
    ].filter(Boolean);
    return [
      // Our own notes, nothing to credit: the operator dropped our name from every card (24 Oct; record D-L).
      { name: `War & Conflict${sources.length ? ` from ${sources.join(', ')}` : ', war news posted on The Record'}${said.length ? ` (${said.join('; ')})` : ''}`, shortName: 'War & Conflict', layer: 'WarConflict', ...common, credits: [] },
      // Wikipedia's list is CC BY-SA 4.0: credited, with its licence named (record D-L).
      { name: `The world's wars: ${snapshot.wars.length}, from Wikipedia's List of ongoing armed conflicts`, shortName: 'The war map', layer: 'WarConflict', ...common, credits: [CREDITS.wikipediaWars] },
    ];
  }, [active, status, snapshot, standing, drawn, moment]);

  const briefOf = useCallback(
    (day?: string, options?: { capture?: boolean }) => (active ? warConflictBrief(snapshot.items, snapshot.wars, day, options) : null),
    [active, snapshot],
  );

  const briefDays = useMemo(() => (active
    ? [...new Set(snapshot.items.map((it) => new Date(it.reportedAt * 1000).toISOString().slice(0, 10)))].sort().reverse()
    : []), [active, snapshot]);
  const itemsByIds = useCallback((ids: readonly string[]) => {
    const byId = new Map(snapshot.items.map((it) => [it.id, it]));
    return ids.map((id) => byId.get(id)).filter((it): it is ConflictItem => it !== undefined);
  }, [snapshot]);

  const tourCandidates = useCallback(
    () => (active ? { candidates: warCandidates(snapshot.items, snapshot.wars, regionOf, regionName).candidates, complete: status.loaded } : null),
    [active, status.loaded, snapshot, regionOf, regionName],
  );

  /** Every theatre named by an item or a war read, by slug: its name, and its worst war. */
  const theatresRead = useMemo(() => {
    const bySlug = new Map<string, { name: string; war: WarItem | null }>();
    if (!active) return bySlug;
    // The worst tier; between two of one tier, the first by name, so a card says the same each time.
    const before = (war: WarItem, than: WarItem) => WAR_TIERS.indexOf(war.tier) - WAR_TIERS.indexOf(than.tier) || war.name.localeCompare(than.name);
    for (const war of snapshot.wars) {
      for (const t of war.theatres) {
        const known = bySlug.get(t.slug);
        if (!known?.war || before(war, known.war) < 0) bySlug.set(t.slug, { name: known?.name ?? t.name, war });
      }
    }
    for (const it of snapshot.items) {
      if (it.theatre && !bySlug.has(it.theatre.slug)) bySlug.set(it.theatre.slug, { name: it.theatre.name, war: null });
    }
    return bySlug;
  }, [active, snapshot]);
  const theatreFacts = useCallback((slug: string): TheatreFacts | null => {
    const read = theatresRead.get(slug);
    if (!read) return null;
    const ids = new Set(drawn.filter((it) => it.theatre?.slug === slug).map((it) => it.id));
    const outlined = (c: string) => (territories?.byCode(c) ?? null) !== null;
    const codes = THEATRE_COUNTRIES[slug] ?? snapshot.items
      .filter((it) => it.theatre?.slug === slug && it.jurisdiction)
      .map((it) => regionToOutline(it.jurisdiction!, outlined))
      .filter((code): code is string => code !== null);
    return {
      slug,
      name: read.name,
      reports: reports.filter((report) => ids.has(report.id)),
      war: read.war ? { name: read.war.name, tierLabel: read.war.tierLabel } : null,
      countries: [...new Set(codes)].filter(outlined).map((code) => ({ code, region: territories!.byCode(code) as RegionOutline })),
    };
  }, [theatresRead, drawn, reports, snapshot, territories]);
  const theatreSlugs = useCallback(() => [...theatresRead.keys()].sort(), [theatresRead]);
  const theatreLit = useCallback(() => theatreLitRef.current, []);
  const theatreDaysTo = useCallback((day: string) => (active ? theatreDays(snapshot.items, day) : new Map()), [active, snapshot]);
  return useMemo(
    () => ({ feeds, reports, featured, briefOf, briefDays, itemsByIds, tourCandidates, theatreFacts, theatreSlugs, theatreLit, arcs, theatreDaysTo }),
    [feeds, reports, featured, briefOf, briefDays, itemsByIds, tourCandidates, theatreFacts, theatreSlugs, theatreLit, arcs, theatreDaysTo],
  );
}
