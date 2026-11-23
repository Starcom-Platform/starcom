// useDiplomaticEvents3D.ts — the DiplomaticEvents sub-mode layer. Reuses Piece 1's
// country centroids for marker/connection placement and the shared connectionLines.ts
// (Piece 4) for event connections between two-country events. Real data now —
// GDELTEventService.ts's live GDELT Event Database, filtered/categorized via
// diplomaticEventFilters.ts and diplomaticEventTheme.ts.
//
// Same "deliberately simpler than National Territories" shape as useResourceZones3D.ts:
// no hover/select interactivity, no adaptive LOD (this layer doesn't even touch baked
// polygon geometry — only country centroids and small marker spheres). The one piece of
// motion this layer DOES have — animateEvents — drives a "marching dashes" effect on
// connection lines via LineMaterial's dashOffset uniform, incremented each frame.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { nationalTerritoriesService } from '../services/NationalTerritoriesService';
import { GeoPoliticalConfig } from '../../hooks/useGeoPoliticalSettings';
import { latLonToVector3 } from '../utils/latLonToVector3';
import type { CountryCentroid } from '../utils/countryCentroids';
import { buildConnectionLines } from '../geometry/connectionLines';
import { useSimpleGeoOverlayLayer, prefersReducedMotion } from './useSimpleGeoOverlayLayer';
import { categorizeGdeltEvent, diplomaticEventColor, DIPLOMATIC_CONNECTION_COLOR, DIPLOMATIC_CONFLICT_COLOR, DIPLOMATIC_CATEGORY_NAMES, DIPLOMATIC_CATEGORIES, type DiplomaticEventCategory } from '../theme/diplomaticEventTheme';
import type { RealGdeltEvent } from '../../services/geopolitical/GDELTEventService';
import { useRealDiplomaticEvents } from './useRealDiplomaticEvents';
import { tallyEventsByCountry, bucketPairsByCount } from '../utils/eventAggregation';
import { buildScreenPoints, markPxForCount, type ScreenPoint, type ScreenPointStyle } from '../../components/Globe/screenPoints';
import { resolveMarkerStyle, type MarkerStyleChoices } from '../../components/Globe/markerStyles';
import { publishLegend, swatchesFromMarks, cssColorOf, type LayerLegend, type LegendSwatch } from '../../services/globe/globeLegendStore';
import { filterDiplomaticEvents } from '../utils/diplomaticEventFilters';
import { gatherPlaces, type DiplomaticPlace } from '../utils/diplomaticPlaces';
import { placeKeyAtHits, withinItsMark } from '../utils/diplomaticPick';
import { countryRelations, type CountryRelation } from '../utils/diplomaticRelations';
import { withinSpan } from '../utils/gdeltTimeSpan';
import { useCountrySelection } from '../../context/CountrySelectionContext';
import { takeCountryPanel } from '../../context/countryPanel';
import { useRealConflictEvents } from './useRealConflictEvents';
import { useDiplomaticRelatedIntel } from './useDiplomaticRelatedIntel';
import { claimGlobeClicks, CLAIM_RANK, isGlobeClick, pressOn, type PointerAt } from '../../components/Globe/globeClick';
import { pickRadiusUnits } from '../../components/Globe/pickRadius';
import { buildGlyphSprites, type GlyphSpriteMark } from '../../components/Globe/intelReportSprites';
import { DIPLOMACY_LAYOUT, diplomacyAtlas, diplomacyRowFor } from '../../components/Globe/diplomacySprites';
import { useCameraDetailTier } from '../../components/Globe/Hooks/useCameraDetailTier';
import { snapshotDayNote, useGdeltSpan } from './useGdeltSpan';
import { DIPLOMACY_CATEGORY_SYMBOLS } from '../../symbols/symbolRegistry';
import { counted, fill, messagesNow, numbered } from '../../i18n/app/i18n';
import { GUNMETAL } from '../../styles/tokens';

const MARKER_RADIUS = 102; // slightly outside territories (101) / resource zones (~101.5-103.6)
const CONNECTION_RADIUS = 101.6;
const MARKER_BASE_SIZE = 1.5; // globe-scale units, before markerSize/goldstein-derived scale multiply
const DASH_ANIMATION_SPEED = 8; // uv units/sec, matches typical LineMaterial dash sizes (3-4 units)
// Name tagged onto the connections sub-group so the animation effect below
// can find it via groupRef.current.getObjectByName — the shared
// useSimpleGeoOverlayLayer factory owns groupRef and has no opinion about
// what's inside it, so this hook looks up its own sub-content by name rather
// than needing a second, factory-provided ref.
const CONNECTIONS_GROUP_NAME = 'diplomatic-connections';

/*
 * Plain words for the CAMEO categories, for a hover a person reads: English, as the rest of the
 * hover is, until step 3 of D-DP redraws these marks and their words come from the catalogue.
 */
const CATEGORY_WORDS: Record<DiplomaticEventCategory, string> = Object.fromEntries(
  Object.entries(DIPLOMATIC_CATEGORY_NAMES).map(([category, names]) => [category, names.words]),
) as Record<DiplomaticEventCategory, string>;

interface UseDiplomaticEventsParams {
  enabled: boolean;
  scene: THREE.Scene | null;
  config: GeoPoliticalConfig['diplomaticEvents'];
  /**
   * How the person chose to draw this layer's country marks
   * (decision D-F, step 6.3).
   *
   * Separate from `config` on purpose: that is the GeoPolitical settings, and a
   * mark style is a CyberCommand setting shared by every layer. The caller has
   * both; this hook does not need to know where it came from.
   */
  markerStyles?: MarkerStyleChoices;
  /** The globe's camera and canvas, for a click on a place to pick it (DP8). Passed in like the other layer hooks'. */
  camera?: THREE.Camera | null;
  getCanvas?: () => HTMLCanvasElement | null;
}

/** How near the ray is searched for marks: the largest drawn, a glyph up close, and slop; each hit then answers by its own size. */
const PLACE_PICK_RADIUS_PX = 18;

function centroidToVector3(point: Pick<CountryCentroid, 'lat' | 'lng'>, radius: number): THREE.Vector3 {
  // Same [x, y, -z] convention as connectionLines.ts's toUnitVector /
  // fatBorderLines.ts's per-vertex projection.
  const v = latLonToVector3(point.lat, point.lng, { radius, elevation: 0, invertX: false });
  return new THREE.Vector3(v.x, v.y, -v.z);
}

/**
 * One mark per country, sized by how many events name it and coloured by the category
 * most of them fall in.
 *
 * This drew ONE SPHERE PER (EVENT, COUNTRY), all of a country's at its single centroid:
 * measured from the shipped snapshot, 2,085 events made 4,170 spheres over 125
 * countries, each with its own geometry and material, nearly all stacked exactly on top
 * of one another. The stack hid its own size — a country with one event looked like a
 * country with ninety — and cost ten thousand objects to say it.
 *
 * Exported for direct unit testing, mirroring buildResourceZoneFills.
 */
export function buildEventMarkers(
  events: RealGdeltEvent[],
  centroids: Map<string, CountryCentroid>,
  markerSize: number,
  /** How the person chose to draw them (decision D-F, step 6.3). */
  style?: ScreenPointStyle,
): THREE.Points | null {
  const tallies = tallyEventsByCountry(events, {
    actors: (event) => [event.actor1ISO3, event.actor2ISO3],
    category: (event) => categorizeGdeltEvent(event.eventRootCode, event.eventCode),
    goldstein: (event) => event.goldsteinScale,
  });
  // The operator's marker-size setting still applies, clamped so it cannot take a mark
  // below what a card can show or turn it into a blot.
  const scale = Math.max(0.6, Math.min(2, markerSize || 1));
  // What each colour drawn stands for, collected as the marks are built so the card's
  // key names the categories that are on this globe and no others.
  const drawn: Array<{ color: string; category: string; order: number }> = [];
  const points = tallies.flatMap((tally) => {
    const centroid = centroids.get(tally.countryCode);
    // A category is needed for the colour; an event set with none is not drawn, the
    // same stance as the per-event version, which skipped an uncategorisable event.
    if (!centroid || !tally.dominantCategory) return [];
    const category = tally.dominantCategory as DiplomaticEventCategory;
    drawn.push({ color: cssColorOf(diplomaticEventColor(category)), category: CATEGORY_WORDS[category], order: DIPLOMATIC_CATEGORIES.indexOf(category) });
    return [{
      position: centroidToVector3(centroid, MARKER_RADIUS),
      sizePx: markPxForCount(tally.count) * scale,
      magnitude: tally.count,
      color: diplomaticEventColor(category),
      // What the mark stands for: a size alone cannot say "of which how many, and of
      // what kind", and the events behind it are no longer drawn one by one.
      tooltip: `${tally.countryCode}: ${tally.count} diplomatic event${tally.count === 1 ? '' : 's'}`
        + `, mostly ${CATEGORY_WORDS[category]} (${tally.dominantCount})`,
    }];
  });
  if (points.length === 0) return null;
  // Bright fills on a globe that is dark half the time: a dark rim holds them over
  // cloud and ice (screenPoints.ts).
  const marks = buildScreenPoints(points, {
    rim: 'dark', opacity: 0.95, style,
    userData: {
      source: 'diplomatic-events',
      layer: 'Diplomacy',
      countries: tallies.map((t) => t.countryCode),
      // In CAMEO's order, as the layers popup lists them (D-DP, DP4).
      legendSwatches: swatchesFromMarks([...drawn].sort((a, b) => a.order - b.order)),
    },
  });
  return marks;
}

/** How solid a place's mark is: told by two outlets or more, or by one (DP9). Neither is hidden. */
const PLACE_TIER_OPACITY = { once: 0.5, told: 0.95 } as const;
/** Up close a mark carries a glyph (DP12): never smaller than a glyph can be read at. */
const PLACE_GLYPH_FLOOR_PX = 18;
const PLACE_GLYPH_CAP_PX = 32;

type DiplomacyWords = ReturnType<typeof messagesNow>['diplomacy'];

/** What a place's mark says when hovered, the same for its disc and its glyph. */
function placeHoverOf(place: DiplomaticPlace, words: DiplomacyWords): string {
  const hover = fill(words.placeHover, {
    place: place.name,
    reports: counted(words.reports, place.events.length),
    told: counted(words.toldByOutlets, place.outlets),
    most: numbered(place.dominantCount),
    kind: words.categories[place.dominantCategory].words,
  });
  return place.countryOnly ? fill(words.countryOnlyHover, { hover }) : hover;
}

/**
 * The key's lines for the places drawn: each kind in CAMEO's order — as its glyph in its colour where
 * the marks are glyphs, so one line says both — then what a ring and a dim mark mean.
 */
function placeSwatches(places: readonly DiplomaticPlace[], words: DiplomacyWords, countryShape: string, glyphs = false): LegendSwatch[] {
  const kinds = DIPLOMATIC_CATEGORIES.filter((category) => places.some((p) => p.dominantCategory === category));
  const swatches: LegendSwatch[] = kinds.map((category) => ({
    color: cssColorOf(diplomaticEventColor(category)),
    label: words.categories[category].words,
    ...(glyphs ? { symbol: DIPLOMACY_CATEGORY_SYMBOLS[category].id } : {}),
  }));
  if (places.some((p) => p.countryOnly)) swatches.push({ color: GUNMETAL[300], label: words.legendCountryOnly, shape: countryShape });
  if (places.some((p) => p.outlets < 2)) swatches.push({ color: GUNMETAL[500], label: words.legendToldOnce });
  return swatches;
}

/**
 * One mark per place GDELT states (decision D-DP, step 3: DP2, DP9, DP13, DP14), where the events
 * happened rather than at the countries named. Its size is the distinct outlets that told its stories
 * (diplomaticPlaces.ts); a place told by one outlet is the smallest size and dimmer, never hidden; its
 * colour is the kind most of its events are. A place GDELT put only at a country, for want of a city,
 * is a hollow ring, and a dashed one under the Ring style, where every mark is a ring.
 *
 * One object per tier and placement, four at most: a mark's opacity and style are its material's.
 * Exported for direct unit testing, as buildEventMarkers is.
 */
export function buildPlaceMarks(
  events: RealGdeltEvent[],
  markerSize: number,
  /** How the person chose to draw this layer's marks (decision D-F, step 6.3). */
  style: ScreenPointStyle = 'disc',
): THREE.Group | null {
  const places = gatherPlaces(events);
  if (places.length === 0) return null;
  const words = messagesNow().diplomacy;
  const scale = Math.max(0.6, Math.min(2, markerSize || 1));
  const countryStyle: ScreenPointStyle = style === 'ring' ? 'dashedRing' : 'ring';
  const buckets = new Map<string, { tier: keyof typeof PLACE_TIER_OPACITY; placedAt: 'point' | 'country'; points: ScreenPoint[]; keys: string[] }>();

  for (const place of places) {
    const tier = place.outlets >= 2 ? 'told' : 'once';
    const placedAt = place.countryOnly ? 'country' : 'point';
    const key = `${tier}-${placedAt}`;
    const bucket = buckets.get(key) ?? { tier, placedAt, points: [], keys: [] };
    buckets.set(key, bucket);
    bucket.keys.push(place.key);
    bucket.points.push({
      position: centroidToVector3(place, MARKER_RADIUS),
      sizePx: markPxForCount(place.outlets) * scale,
      magnitude: place.outlets,
      color: diplomaticEventColor(place.dominantCategory),
      tooltip: placeHoverOf(place, words),
    });
  }

  const group = new THREE.Group();
  // The dimmer first, so the widely told draw over them where they meet.
  for (const key of ['once-point', 'once-country', 'told-point', 'told-country']) {
    const bucket = buckets.get(key);
    if (!bucket) continue;
    group.add(buildScreenPoints(bucket.points, {
      // Bright fills on a globe that is dark half the time: a dark rim holds them over cloud and ice.
      rim: 'dark',
      opacity: PLACE_TIER_OPACITY[bucket.tier],
      style: bucket.placedAt === 'country' ? countryStyle : style,
      // Each mark's place, in the order of its marks: what a click picks by (DP8).
      userData: { source: 'diplomatic-events', layer: 'Diplomacy', tier: bucket.tier, placedAt: bucket.placedAt, placeKeys: bucket.keys },
    }));
  }
  group.userData = {
    source: 'diplomatic-events', layer: 'Diplomacy', places: places.map((p) => p.name),
    legendSwatches: placeSwatches(places, words, countryStyle),
  };
  return group;
}

/**
 * The same places up close (DP12): each its kind's glyph on a mark of its colour, a ring for a
 * country-only place and dashed under the Ring style, dimmer when told by one outlet, and never
 * smaller than a glyph reads at. One object; the atlas is diplomacySprites.ts's.
 */
export function buildPlaceSprites(
  events: RealGdeltEvent[],
  markerSize: number,
  style: ScreenPointStyle,
  atlas: THREE.Texture,
): THREE.Points | null {
  const places = gatherPlaces(events);
  if (places.length === 0) return null;
  const words = messagesNow().diplomacy;
  const scale = Math.max(0.6, Math.min(2, markerSize || 1));
  const backing = style === 'ring' || style === 'glow' ? style : 'disc';
  const marks: GlyphSpriteMark[] = places.map((place) => ({
    position: centroidToVector3(place, MARKER_RADIUS),
    sizePx: Math.max(PLACE_GLYPH_FLOOR_PX, markPxForCount(place.outlets, PLACE_GLYPH_FLOOR_PX, PLACE_GLYPH_CAP_PX) * scale),
    cell: DIPLOMATIC_CATEGORIES.indexOf(place.dominantCategory),
    row: diplomacyRowFor(backing, place.countryOnly),
    motion: 0,
    opacity: place.outlets >= 2 ? 1 : 0.55,
    tooltip: placeHoverOf(place, words),
  }));
  const sprites = buildGlyphSprites(marks, atlas, DIPLOMACY_LAYOUT, {
    userData: {
      source: 'diplomatic-events', layer: 'Diplomacy', places: places.map((p) => p.name), placeKeys: places.map((p) => p.key),
      legendSwatches: placeSwatches(places, words, style === 'ring' ? 'dashedRing' : 'ring', true),
    },
  });
  return sprites;
}

/**
 * The marks and the key the card is given, where the person chose to stand them (D-DP, DP2): where
 * each event happened, or at each country involved; up close, with the atlas baked, as glyphs (DP12).
 * Exported for direct unit testing.
 */
export function diplomacyMarks(
  events: RealGdeltEvent[],
  centroids: Map<string, CountryCentroid>,
  config: Pick<GeoPoliticalConfig['diplomaticEvents'], 'markerSize' | 'placeBy'>,
  style: ScreenPointStyle,
  /** The glyphs' atlas when the camera is close; null or absent, the discs. */
  glyphs?: THREE.Texture | null,
): { object: THREE.Object3D | null; legend: LayerLegend | null } {
  const words = messagesNow().diplomacy;
  if (config.placeBy === 'actors') {
    const marks = buildEventMarkers(events, centroids, config.markerSize, style);
    return {
      object: marks,
      legend: marks ? {
        layerId: 'DiplomaticEvents',
        layer: 'Diplomacy',
        // Said so a shared image explains its own marks rather than leaving a
        // reader to guess why they are rings (decision D-F, step 6.3).
        shapeMeans: style,
        sizeMeans: 'events in that country',
        colorMeans: 'the category most of them fall in',
        swatches: (marks.userData.legendSwatches ?? []) as LegendSwatch[],
      } : null,
    };
  }
  const places = glyphs ? buildPlaceSprites(events, config.markerSize, style, glyphs) : buildPlaceMarks(events, config.markerSize, style);
  return {
    object: places,
    legend: places ? {
      layerId: 'DiplomaticEvents',
      layer: 'Diplomacy',
      shapeMeans: style,
      sizeMeans: words.legendSize,
      colorMeans: words.legendColour,
      swatches: places.userData.legendSwatches as LegendSwatch[],
    } : null,
  };
}

/*
 * The weights are far apart on purpose, and their heights too: an arc that rises clears
 * the globe's silhouette, and a few hundred of those at once pile into a band around the
 * limb whatever their opacity. Faint arcs stay near the surface; standing relationships
 * arc and read.
 *
 * Nothing is hidden — every pair is drawn, which a threshold would not do. The bands
 * themselves come from the snapshot's real distribution (eventAggregation.ts).
 */
const CONNECTION_WEIGHTS: Record<'faint' | 'plain' | 'bold', { linewidth: number; opacityScale: number; arcHeight: number }> = {
  faint: { linewidth: 0.8, opacityScale: 0.22, arcHeight: 1.5 },
  plain: { linewidth: 1.6, opacityScale: 0.5, arcHeight: 3.5 },
  bold: { linewidth: 3.2, opacityScale: 1, arcHeight: 7 },
};


/**
 * A selected country's arcs (D-DP, DP5, DP16): one to each counterpart it shares events with in the
 * span shown, cooperation in DIPLOMATIC_CONNECTION_COLOR and conflict (CAMEO 14–20, the same snapshot)
 * in DIPLOMATIC_CONFLICT_COLOR, nearer the surface so a pair with both reads as two. Width by reports,
 * in the three weights the old all-pairs web used. Nothing selected, no arcs: the web of every pair
 * covered the globe.
 */
export function buildRelationArcs(
  country: string,
  relations: readonly CountryRelation[],
  centroids: Map<string, CountryCentroid>,
  opacity: number,
): THREE.Group {
  const group = new THREE.Group();
  const from = centroids.get(country);
  if (!from) return group;
  const base = Math.max(0.05, Math.min(1, opacity));
  for (const kind of ['cooperation', 'conflict'] as const) {
    const pairs = relations
      .filter((relation) => relation[kind] > 0 && centroids.has(relation.counterpart))
      .map((relation) => ({ a: country, b: relation.counterpart, count: relation[kind], events: [] as RealGdeltEvent[] }));
    for (const bucket of bucketPairsByCount(pairs)) {
      const { linewidth, opacityScale, arcHeight } = CONNECTION_WEIGHTS[bucket.weight];
      const height = kind === 'conflict' ? arcHeight * 0.55 : arcHeight;
      const lines = buildConnectionLines(bucket.pairs.map((pair) => ({ id: `${kind}-${pair.b}`, from, to: centroids.get(pair.b)! })), {
        radius: CONNECTION_RADIUS,
        arcHeight: height,
        color: kind === 'conflict' ? DIPLOMATIC_CONFLICT_COLOR : DIPLOMATIC_CONNECTION_COLOR,
        // A selected country's few arcs are the point, not a web to keep quiet: half opacity and up,
        // by weight and the setting (0.2 at the default 40% read as nothing on the build).
        opacity: 0.5 + 0.5 * Math.min(1, base * opacityScale * 2),
        linewidth,
        dashed: false,
      });
      lines.userData = { kind, weight: bucket.weight, pairs: bucket.pairs.length, arcHeight: height };
      group.add(lines);
    }
  }
  return group;
}

export function useDiplomaticEvents3D({ enabled, scene, config, markerStyles, camera, getCanvas }: UseDiplomaticEventsParams) {
  const markStyle = resolveMarkerStyle(markerStyles, 'DiplomaticEvents');
  /*
   * The key goes with the marks. buildContent publishes it as it draws and is not
   * called at all when the layer is switched off, so switching off has to withdraw it
   * here — a legend for a layer that is no longer drawn would be a key to an empty
   * globe. Two effects rather than one: withdrawing in the cleanup of an
   * `enabled`-keyed effect could also fire on the way back ON, racing the publish.
   */
  useEffect(() => { if (!enabled) publishLegend('DiplomaticEvents', null); }, [enabled]);
  useEffect(() => () => publishLegend('DiplomaticEvents', null), []);

  /*
   * The data's error used to be dropped here: only `events` was taken, and the
   * `error` returned below came from building the scene alone. A GDELT failure
   * therefore reached nothing — not the settings panel, not the share card —
   * and the layer drew an empty sky that read as "no diplomatic activity".
   */
  const { events: realEvents, asOf, from, error: dataError, loading: dataLoading } = useRealDiplomaticEvents(enabled);
  // What is shown of the day: the shared time's to say (D-E; DP15).
  const { span, window: pausedWindow, coverage } = useGdeltSpan({ from, asOf });
  // What is drawn, for the marks and for the drawer alike.
  const shownEvents = useMemo(() => filterDiplomaticEvents(realEvents, config, span), [realEvents, config, span]);
  const placesShown = enabled && config.placeBy !== 'actors';

  /*
   * The drawer (DP8): a click on a place selects it, Escape or the drawer's Close lets it go. The key is
   * kept while filters hide the place, so it comes back when they no longer do.
   */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useEffect(() => { if (!placesShown) setSelectedKey(null); }, [placesShown]);
  const selectedPlace = useMemo(
    () => (selectedKey ? gatherPlaces(shownEvents).find((place) => place.key === selectedKey) ?? null : null),
    [selectedKey, shownEvents],
  );
  /*
   * A selected country (DP5, DP16): while Diplomacy is drawn, a country clicked or found by search is
   * this layer's, its arcs on the globe and its events in the drawer, and its popup does not open over
   * them. Given back when the layer goes, the selection with it, so the popup does not open then.
   */
  const countrySelection = useCountrySelection({ optional: true });
  const selectCountryRef = useRef(countrySelection?.selectCountry);
  selectCountryRef.current = countrySelection?.selectCountry;
  useEffect(() => {
    if (!enabled) return;
    const giveBack = takeCountryPanel();
    return () => {
      selectCountryRef.current?.(null);
      giveBack();
    };
  }, [enabled]);
  const selectedCountry = enabled ? countrySelection?.selectedCountry ?? null : null;
  const selectedCode = selectedCountry?.countryCode ?? null;
  // Its conflict, from the same snapshot (CAMEO 14–20), read only while a country is selected.
  const conflict = useRealConflictEvents(enabled && selectedCode !== null);
  const relations = useMemo(() => {
    if (!selectedCode || !span) return [];
    const conflictShown = conflict.events.filter((event) => withinSpan(event, span));
    return countryRelations(selectedCode, shownEvents, conflictShown);
  }, [selectedCode, span, shownEvents, conflict.events]);
  const countryEvents = useMemo(
    () => (selectedCode ? shownEvents.filter((e) => e.actor1ISO3 === selectedCode || e.actor2ISO3 === selectedCode) : []),
    [selectedCode, shownEvents],
  );

  const [countryNames, setCountryNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void nationalTerritoriesService.getCountryDirectory().then((directory) => {
      if (live) setCountryNames(new Map(directory.map((entry) => [entry.countryCode, entry.name])));
    });
    return () => { live = false; };
  }, [enabled]);

  /*
   * Up close, each place is its kind's glyph (DP12): from the full-detail tier, under 1.5 globe radii
   * (useCameraDetailTier, with its hysteresis), the default view being 2.5. The atlas is baked the
   * first time a person comes close; until it is, or where it cannot be, the discs stay.
   */
  const close = useCameraDetailTier(undefined, enabled && config.placeBy !== 'actors') === 2;
  const [glyphs, setGlyphs] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!close || glyphs) return;
    let live = true;
    void diplomacyAtlas().then((atlas) => { if (live && atlas) setGlyphs(atlas); });
    return () => { live = false; };
  }, [close, glyphs]);

  const buildContent = useCallback(async () => {
    const centroids = await nationalTerritoriesService.getCountryCentroids();
    // Live, the snapshot's own day, never the wall clock's: against the clock an older snapshot
    // filters to nothing (LoadedGdeltSnapshot.asOf). Paused, the shared window.
    const events = shownEvents;

    const newGroup = new THREE.Group();
    const { object: marks, legend } = diplomacyMarks(events, centroids, config, markStyle, close ? glyphs : null);
    if (marks) newGroup.add(marks);

    /*
     * The card's key, from the marks just built — swatches for the kinds drawn, withdrawn
     * when there are none. A mark takes the colour of the kind MOST of its events are,
     * which is what the legend has to say: the colour is a dominant kind, not the only one
     * behind that mark.
     */
    // Said when a paused window reaches past the snapshot's day — with a bare line when nothing is
    // drawn, since an empty globe there is not a quiet day (DP15).
    const note = snapshotDayNote(coverage, { from, asOf }, pausedWindow);
    /*
     * Arcs only for a selected country (DP5): the web of every pair covered the globe. The key says
     * which colour is which, naming the country.
     */
    const arcs = selectedCode && config.showConnections && relations.length
      ? buildRelationArcs(selectedCode, relations, centroids, config.connectionOpacity / 100)
      : null;
    if (arcs && arcs.children.length) {
      arcs.name = CONNECTIONS_GROUP_NAME;
      newGroup.add(arcs);
    }
    const words = messagesNow().diplomacy;
    const country = selectedCountry?.name ?? (selectedCode ? countryNames.get(selectedCode) ?? selectedCode : '');
    const arcSwatches: LegendSwatch[] = arcs && arcs.children.length ? [
      ...(relations.some((r) => r.cooperation > 0) ? [{ color: cssColorOf(DIPLOMATIC_CONNECTION_COLOR), label: fill(words.legendCooperation, { country }), shape: 'line' }] : []),
      ...(relations.some((r) => r.conflict > 0) ? [{ color: cssColorOf(DIPLOMATIC_CONFLICT_COLOR), label: fill(words.legendConflict, { country }), shape: 'line' }] : []),
    ] : [];
    const keyed = legend && arcSwatches.length ? { ...legend, swatches: [...legend.swatches, ...arcSwatches] } : legend;
    publishLegend('DiplomaticEvents', note
      ? { ...(keyed ?? { layerId: 'DiplomaticEvents', layer: 'Diplomacy', swatches: [] }), when: note }
      : keyed);

    return newGroup;
    // The style too: without it a newly chosen style showed only after something else changed.
  }, [config, shownEvents, asOf, from, pausedWindow, coverage, markStyle, close, glyphs, selectedCode, selectedCountry, relations, countryNames]);

  const { loading, error, groupRef } = useSimpleGeoOverlayLayer({
    enabled,
    scene,
    compareLayer: 'DiplomaticEvents',
    layerId: 'geopolitical-diplomatic-events',
    // Above the country fills (95), which are drawn as a decal over whatever came
    // before them — at 91 every one of these marks was tinted by the base map.
    layerOrder: 191,
    buildContent
  });

  // "Marching dashes" animation on connection lines when animateEvents is on.
  useEffect(() => {
    if (!enabled || !config.animateEvents || prefersReducedMotion()) return;
    let frame: number;
    let last = performance.now();
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const cg = groupRef.current?.getObjectByName(CONNECTIONS_GROUP_NAME) as THREE.Group | undefined;
      if (!cg) return;
      cg.children.forEach((child) => {
        if (child instanceof LineSegments2) {
          child.material.dashOffset -= DASH_ANIMATION_SPEED * dt;
        }
      });
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [enabled, config.animateEvents, groupRef]);

  /*
   * A click on a place (DP8), as CommHubs picks its marks: the place under the pointer claims the area
   * beneath it, so the country there does not open as well, and a report's glyph, nearer still, wins.
   */
  const cameraRef = useRef<THREE.Camera | null>(null);
  cameraRef.current = camera ?? null;
  const getCanvasRef = useRef(getCanvas);
  getCanvasRef.current = getCanvas;
  const pickPlace = useCallback((clientX: number, clientY: number): string | null => {
    const cam = cameraRef.current;
    const canvas = getCanvasRef.current?.();
    const group = groupRef.current;
    if (!cam || !canvas || !group) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: pickRadiusUnits(cam, rect.height, PLACE_PICK_RADIUS_PX) };
    raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), cam);
    const marks: THREE.Object3D[] = [];
    group.traverse((object) => { if (object instanceof THREE.Points && object.userData.placeKeys) marks.push(object); });
    const unitsPerPx = pickRadiusUnits(cam, rect.height, 1);
    return placeKeyAtHits(raycaster.intersectObjects(marks, false).filter((hit) => withinItsMark(hit, unitsPerPx)), cam.position);
  }, [groupRef]);

  useEffect(() => {
    if (!placesShown) return;
    let over = false;
    let lastMove = 0;
    let pressedAt: PointerAt | null = null;
    const canvasOf = () => getCanvasRef.current?.() ?? null;
    const release = claimGlobeClicks(() => ({ mark: false, area: over }), CLAIM_RANK.places);
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastMove < 50) return;
      lastMove = now;
      over = e.target === canvasOf() && pickPlace(e.clientX, e.clientY) !== null;
    };
    // In the capture phase, so the layers beneath know before their own press handlers run; a touch has no hover.
    const onPressCapture = (e: PointerEvent) => { over = e.target === canvasOf() && pickPlace(e.clientX, e.clientY) !== null; };
    const onDown = (e: PointerEvent) => { pressedAt = pressOn(e, canvasOf(), 'mark', CLAIM_RANK.places); };
    const onUp = (e: PointerEvent) => {
      const press = pressedAt;
      pressedAt = null;
      if (e.target !== canvasOf() || !isGlobeClick(press, { x: e.clientX, y: e.clientY })) return;
      const key = pickPlace(e.clientX, e.clientY);
      if (key) setSelectedKey(key);
    };
    // Escape lets go of the place first, then the country.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSelectedKey((key) => {
        if (key === null) selectCountryRef.current?.(null);
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onPressCapture, true);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      release();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onPressCapture, true);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [placesShown, pickPlace]);

  // Related intel (step 8): the Intel Reports about the countries in view, in the time shown.
  const relatedCountries = useMemo(
    () => (selectedPlace ? [...new Set(selectedPlace.events.flatMap((e) => [e.actor1ISO3, e.actor2ISO3]))] : selectedCode ? [selectedCode] : []),
    [selectedPlace, selectedCode],
  );
  const relatedReports = useDiplomaticRelatedIntel(relatedCountries, span, relatedCountries.length > 0);

  return {
    loading, error: error ?? (dataError ? `GDELT: ${dataError}` : null), dataLoading, asOf, relatedReports,
    /** The drawer's (DP8): whether places are drawn, the place selected, country names, and letting it go. */
    placesShown, selectedPlace, countryNames, clearSelection: () => setSelectedKey(null),
    /** A selected country's (DP5, DP16): who it is, its counterparts and its events, and letting it go. */
    selectedCountry: selectedCode ? { code: selectedCode, name: selectedCountry?.name ?? countryNames.get(selectedCode) ?? selectedCode } : null,
    relations, countryEvents, clearCountry: () => selectCountryRef.current?.(null),
  };
}
