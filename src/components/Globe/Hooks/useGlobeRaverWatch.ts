/**
 * Raver Watch on the globe (globe record, section 19, Phase 1 step 3).
 *
 * Mecha Jono's safety notes for people at dance events, read from The Record
 * only while one of the mode's layers is on. An item applying at the moment
 * the globe shows is drawn where it applies:
 *
 *   a point     its glyph on its level's backing (raverWatchSprites.ts), at
 *               0.1°, faded as its end nears (RW3, RW6);
 *   a region    a country, or a US state (RW4), as a faint outline in the mode's violet, since the note said
 *               "this country", not a point in it (as useGlobeRegionMarks
 *               draws a report about a territory). Not in its level's
 *               colour: red and amber lines on borders mean a provisional
 *               border. The key names each country outlined, with its level.
 *
 * What is not drawn is said, in the feed each layer gives the key: what has
 * ended, what applies to a region with no outline here (a US state, until
 * their outlines are added), and what names no place. An empty layer must
 * never read as nothing having been sent.
 *
 * From v1.1 (Mecha Jono's answers and the owner's decisions of 2026-10-01):
 *
 *   scene events are drawn at their town, a week ahead, faint until they
 *               begin and struck through when called off, one mark a town
 *               (the hover lists them);
 *   a point that stands for a state is drawn with a faint ring round it, so
 *               it reads as an area, not a place;
 *   a subdivision with no outline here is outlined as its country, and a
 *               warning for all of Europe outlines Europe;
 *   policy news is not drawn, and what names no place is not drawn: both are
 *               listed in the panel (RaverWatchPanel), which this returns.
 *
 * From v1.2 (their update of 2026-10-02, and the owner's decision RW12):
 *
 *   a scene event at a public venue is drawn at the venue, one mark a venue,
 *               and its hover gives the address and credits OpenStreetMap;
 *               every other event stays at its town;
 *   HeatRisk is drawn: the NWS level at a town with a rave that week, from
 *               Orange up, as the heat glyph on its note's level.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { latLngToGlobeWorld, GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { buildScreenPoints, drawAboveSurfaceLayers, SCREEN_POINTS_RENDER_ORDER } from '../screenPoints';
import { DATA_SCALES } from '../../../styles/tokens';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { noteSet, raverWatchGlobeNote } from '../../../features/globe/noteDetail/globeNotesOf';
import { REPORT_SPRITES } from '../globeAltitudes';
import { buildGlyphSprites, disposeIntelSprites } from '../intelReportSprites';
import {
  raverWatchAtlas, raverWatchSpriteMark, RAVER_WATCH_LAYOUT, RAVER_WATCH_LEVELS, RAVER_WATCH_LEVEL_LOOK, RAVER_WATCH_GLYPH_MEANING,
  RAVER_WATCH_REGION_COLOR,
} from '../raverWatchSprites';
import {
  raverWatchItems, raverWatchStatus, raverWatchUnread, startRaverWatch, subscribeRaverWatch, type RaverWatchItem, type RaverWatchLevel,
  type UnreadKind,
} from '../../../services/raverWatch/raverWatch';
import {
  countriesOf, describeItem, elsewhere, fadeAt, flareAt, heatAround, heatRiskName, glyphOf, isNews, isPolicyNews, levelOf, notDrawn, regionToOutline, standsAt, tonightOf,
  VENUE_CREDIT, type RaverWatchMoment, type Tonight,
} from '../../../services/raverWatch/raverWatchView';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { GeometryFactory, type LineFeature } from '../../../geopolitical/geometry/geometryFactory';
import type { TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import { loadUsStates, US_STATE_CODE, type UsStates } from '../../../services/raverWatch/usStates';
import type { FeedProvenance } from '../../../features/globe/capture/shareCardProvenance';
import type { FeaturedReport, ShareReportInfo } from '../../../features/globe/capture/shareReports';
import { raverWatchShareReports, featuredRaverWatchFor } from '../../../features/globe/capture/raverWatchReports';
import { closeUpKind, insetFor, type CardInset, type CloseUpRefusal } from '../../../features/globe/capture/closeUpInset';
import { FEATURED_SCALE, FEATURED_OTHERS_OPACITY } from './useGlobeIntelSprites';
import { ridesShell } from '../../../globe-engine/shellLift';
import { heatCandidates, raveCandidates } from '../../../features/globe/tour/playlistSources';
import type { TourOffer } from '../../../features/globe/tour/briefingPlaylist';

const GLOBE_RADIUS_UNITS = 100;
/** Above the borders and a report's subject territory, so an alert's region reads over both. */
const OUTLINE_ELEVATION = 0.35;
/** Faint: a whole country is a far larger mark than a point, and would otherwise shout (RW4). */
const OUTLINE_OPACITY = 0.6;
/** The most countries the key names, one line each, before it says how many more. */
const REGIONS_NAMED = 6;

/** The layers that draw. The other two wait: their missions and sites are not published yet. */
export type RaverWatchDrawnLayer = 'DrugCheckAlerts' | 'SceneIncidents' | 'SceneEvents' | 'HeatRisk';
const DRAWN_LAYERS: readonly RaverWatchDrawnLayer[] = ['DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk'];
const LABEL: Record<RaverWatchDrawnLayer, string> = {
  DrugCheckAlerts: 'Drug-check alerts', SceneIncidents: 'Scene incidents', SceneEvents: 'Scene events', HeatRisk: 'Heat risk',
};
/** How far a state-precision point's ring reaches, in degrees: an area, drawn faintly, not a border. */
const STATE_RING_DEG = 2;
/** At most this many of a town's events are named in its hover; the rest are counted. */
const EVENTS_NAMED = 5;
/** How this layer's flares are found by a probe or a test (raver-nights.md, RN1). */
export const RAVER_WATCH_FLARE_TYPE = 'raverWatchFlares';
/**
 * A flare's ring, as wide as its glyph times this as it starts, growing by the next
 * through its twenty minutes, and fading from this opacity to none: it swells and
 * fades round the glyph, leaving the glyph itself clear.
 */
const FLARE_FROM = 1.3;
const FLARE_GROWTH = 1.7;
const FLARE_OPACITY = 0.85;
const FLARE_KEY = 'just started: a ring that swells and fades';
/** How this layer's heat halos are found by a probe or a test (raver-nights.md, RN2). */
export const RAVER_WATCH_HALO_TYPE = 'raverWatchHeatHalos';
/** A halo's light: soft, under the glyph, so the glyph still reads over it. */
const HALO_OPACITY = 0.55;
/** What a layer's marks mean, in the key; a scene incident's are listed by what is drawn. */
const SHAPE_MEANS: Partial<Record<RaverWatchDrawnLayer, string>> = {
  DrugCheckAlerts: 'the lab’s flask; a country an alert applies to is outlined in violet, and named here with its level; a ring is a whole state',
  SceneEvents: 'one mark a town, or a public venue where the listing names one (venue and address: OpenStreetMap contributors, ODbL); '
    + 'faint until the first begins, struck through when all are called off',
  HeatRisk: 'a thermometer at a town with an event this week, where the NWS HeatRisk is Orange (2 of 4) or higher; '
    + 'one mark a town, at its worst day, its hover naming each day',
};

/** The standing note as a card prints it (IM11). */
const STANDING_NOTE_SHORT = 'Raver Watch items show while they apply, placed to about 11 km, or at a public venue.';

/** What every Raver Watch feed says of its data, whatever its state. */
const STANDING_NOTE = 'Raver Watch: each item is drawn while it applies, by the dates its note states, '
  + 'faded as its end nears, and placed no finer than about 11 km, except a scene event at a public venue, drawn at the venue.';

/** Said when notes of a kind no layer here reads were refused (IX1): their spec has moved on from this build's. */
const unreadNote = (unread: readonly UnreadKind[]) => {
  const total = unread.reduce((n, u) => n + u.count, 0);
  const kinds = unread.map((u) => `${u.kind} ${u.count}`).join(', ');
  return `${total} ${total === 1 ? 'note' : 'notes'} of a kind this build does not read (${kinds}) ${total === 1 ? 'is' : 'are'} not shown.`;
};
const UNREAD_NOTE_SHORT = 'Some notes are of a kind this build does not read.';

export interface UseGlobeRaverWatchOptions {
  scene: THREE.Scene | null;
  /** Which of its layers are on. */
  active: Record<RaverWatchDrawnLayer, boolean>;
  /**
   * Whether Harm reduction sites is shown (D-LS, LS7). This build draws none, and Mecha Jono posted none on
   * 2026-10-17; shown, its feed says which, so the globe is never silently empty.
   */
  harmReductionSites?: boolean;
  territories: TerritoryIndex | undefined;
  /** The window chosen on the timeline, in ms; null while live (RW7). */
  window: { start: number; end: number } | null;
  /**
   * The moment the timeline is paused at, in ms, inside its window; null while live.
   * What a flare and a fade are measured from (RN5): a paused moment or a sweep's
   * frame, not the end of the step around it. Absent, the window's end.
   */
  moment?: number | null;
  /** The report chosen to feature in a capture (featuredReportStore), or null. */
  featuredId?: string | null;
}

/** What the globe's share card and handle need from this layer. */
export interface RaverWatchOnGlobe {
  /** One per layer that is on, for the key and the card. */
  feeds: FeedProvenance[];
  /** The items drawn, as the handle lists them (contract v8). */
  reports: ShareReportInfo[];
  /** The featured item as the card states it, when it is one of these and drawn. */
  featured: FeaturedReport | null;
  /** What is listed instead of drawn, for the panel: no place, policy news, or scene news. */
  listed: { unplaced: RaverWatchItem[]; news: RaverWatchItem[]; sceneNews: RaverWatchItem[] };
  /** Whether any of its layers is on, so the panel shows. */
  anyOn: boolean;
  /** Why a drawn item may not have a close-up (IM2, IM36): null when it may, undefined when it is not drawn here. */
  closeUpRefusal: (id: string) => string | null | undefined;
  /**
   * A drawn item's close-up (IM34): its neighbours among the items drawn, and a
   * heat town's state lines, loaded from Starcom only then. Undefined when the
   * item is not drawn here.
   */
  closeUp: (id: string) => Promise<CardInset | CloseUpRefusal | undefined>;
  /**
   * Why an item this layer holds is not drawn (Mecha Jono's ask D): its layer
   * off, news, outside the moment shown, or no place to draw. Null when it is
   * drawn; undefined when it is not one of Raver Watch's.
   */
  whyNotDrawn: (id: string) => string | null | undefined;
  /**
   * What a briefing tour of tonight's raves or of the heat watch would stop at,
   * and whether the read is done (briefing-playlists.md, BP5); null while its
   * layers are off.
   */
  tourCandidates: (playlist: 'raves' | 'heat', nowMs: number) => TourOffer | null;
  /**
   * Tonight from a moment in unix seconds, for its card (raver-nights.md, RN3, RN7):
   * every scene event read, whatever is drawn, with the heat notes beside them.
   */
  tonightFrom: (fromS: number) => Tonight;
  /** The drawn notes that carry a licence, each at its place: a card credits those in its picture (Interchange 3.25). */
  licensed: ReadonlyArray<{ id: string; lat: number; lng: number; licence: string }>;
}

const toColor = (css: string) => parseInt(css.slice(1), 16);

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if ((child as THREE.Points).isPoints) disposeIntelSprites(child as THREE.Points);
    child.traverse((node) => {
      const line = node as THREE.Line;
      if (!line.isLine) return;
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
  }
}

/** Where a region's outline and name come from: countries, and US states once fetched. */
interface Regions { territories: TerritoryIndex | undefined; states: UsStates | undefined }

const regionOf = (code: string, { territories, states }: Regions) =>
  (US_STATE_CODE.test(code) ? states?.get(code) : territories?.byCode(code)) ?? null;

/** Whether a region has an outline here. */
const canOutline = (regions: Regions) => (code: string) => regionOf(code, regions) !== null;

/**
 * The regions an item outlines: its jurisdiction, or its country when the
 * subdivision has no outline here; every country of a wide area; or none.
 */
function regionsOfItem(item: RaverWatchItem, regions: Regions): string[] {
  if (item.region) return countriesOf(item.region).filter(canOutline(regions));
  if (item.point || !item.jurisdiction) return [];
  const code = regionToOutline(item.jurisdiction, canOutline(regions));
  return code ? [code] : [];
}

/** A faint ring of STATE_RING_DEG round a point that stands for a whole state or province. */
function ringAround(point: { lat: number; lon: number }, id: string): LineFeature {
  const coordinates: Array<[number, number]> = [];
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * 2 * Math.PI;
    coordinates.push([point.lon + (STATE_RING_DEG * Math.cos(a)) / Math.max(Math.cos((point.lat * Math.PI) / 180), 0.2), point.lat + STATE_RING_DEG * Math.sin(a)]);
  }
  return { id, coordinates };
}

/** A region's outline, as the lines the border builder draws: its outer rings. */
function outlineOf(code: string, regions: Regions): LineFeature[] {
  const territory = regionOf(code, regions);
  if (!territory) return [];
  const polygons = territory.geometry.type === 'Polygon' ? [territory.geometry.coordinates] : territory.geometry.coordinates;
  return polygons.flatMap((rings, i) => (rings[0] && rings[0].length >= 2 ? [{ id: `${code}#${i}`, coordinates: rings[0] }] : []));
}

/** Draws the mode's layers that are on, and returns a feed for each, for the key and the card. */
export function useGlobeRaverWatch({ scene, active, harmReductionSites = false, territories, window, featuredId = null, moment: pausedAt = null }: UseGlobeRaverWatchOptions): RaverWatchOnGlobe {
  const on = (layer: string): layer is RaverWatchDrawnLayer => (DRAWN_LAYERS as readonly string[]).includes(layer) && active[layer as RaverWatchDrawnLayer];
  const anyOn = active.DrugCheckAlerts || active.SceneIncidents || active.SceneEvents || active.HeatRisk;

  // Read only while a layer is on; one read however many ask.
  useEffect(() => (anyOn || harmReductionSites ? startRaverWatch() : undefined), [anyOn, harmReductionSites]);
  const items = useSyncExternalStore(subscribeRaverWatch, raverWatchItems, raverWatchItems);
  const unread = useSyncExternalStore(subscribeRaverWatch, raverWatchUnread, raverWatchUnread);
  const status = useSyncExternalStore(subscribeRaverWatch, raverWatchStatus, raverWatchStatus);

  // Live, the moment moves on by the minute: often enough to fade and to end
  // an item, and not so often that the globe redraws for nothing.
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    if (!anyOn || window) return;
    setMinute(Math.floor(Date.now() / 60_000));
    const timer = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(timer);
  }, [anyOn, window]);
  const windowStart = window?.start ?? null;
  const windowEnd = window?.end ?? null;
  const moment = useMemo<RaverWatchMoment>(() => (windowStart !== null && windowEnd !== null
    ? { atS: (pausedAt ?? windowEnd) / 1000, window: { fromS: windowStart / 1000, untilS: windowEnd / 1000 } }
    : { atS: minute * 60, window: null }), [minute, windowStart, windowEnd, pausedAt]);

  const [atlas, setAtlas] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let live = true;
    void raverWatchAtlas().then((texture) => { if (live) setAtlas(texture); });
    return () => { live = false; };
  }, []);

  const spritesRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  const outlinesRef = useRef<THREE.Group>((() => {
    // Built in the globe mesh's frame, hung off the scene: turned into the scene's frame,
    // or a country is outlined 90° of longitude away (see useGlobeRegionMarks).
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    return group;
  })());
  useEffect(() => registerTooltipGroup(spritesRef.current), []);
  useEffect(() => {
    if (!scene) return;
    const groups = [spritesRef.current, outlinesRef.current];
    groups.forEach((group) => scene.add(group));
    return () => { groups.forEach((group) => scene.remove(group)); };
  }, [scene]);

  const activeKey = `${active.DrugCheckAlerts}:${active.SceneIncidents}:${active.SceneEvents}:${active.HeatRisk}`;

  // The US states, fetched only once an item on a layer that is on names one (RW4).
  const namesAState = useMemo(
    () => items.some((item) => on(item.layer) && US_STATE_CODE.test(item.jurisdiction ?? '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `on` reads `active`, keyed here by value
    [items, activeKey],
  );
  const [states, setStates] = useState<UsStates | undefined>(undefined);
  useEffect(() => {
    if (!namesAState || states) return;
    let live = true;
    void loadUsStates().then((loaded) => { if (live) setStates(loaded); });
    return () => { live = false; };
  }, [namesAState, states]);
  const regions = useMemo<Regions>(() => ({ territories, states }), [territories, states]);
  /** The items drawn: on a layer that is on, applying at this moment, and not policy news (listed instead). */
  const drawn = useMemo(
    () => items.filter((item) => on(item.layer) && standsAt(item, moment) && !isNews(item)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `on` reads `active`, keyed here by value
    [items, moment, activeKey],
  );

  // The HeatRisk notes read, for the towns an event stands in (RN2, RN4), whether HeatRisk is drawn or not.
  const heatNotes = useMemo(() => items.filter((it) => it.layer === 'HeatRisk'), [items]);
  useEffect(() => {
    const sprites = spritesRef.current;
    const outlines = outlinesRef.current;
    clearGroup(sprites);
    clearGroup(outlines);
    const regionName = (code: string) => regionOf(code, regions)?.name ?? null;
    const levelsDrawn = new Map<RaverWatchDrawnLayer, Set<RaverWatchLevel>>();
    const noteLevel = (item: RaverWatchItem) => {
      const layer = item.layer as RaverWatchDrawnLayer;
      if (!levelsDrawn.has(layer)) levelsDrawn.set(layer, new Set());
      levelsDrawn.get(layer)!.add(levelOf(item));
    };
    const regionsDrawn = new Map<RaverWatchDrawnLayer, string[]>();
    const noteRegionNamed = (item: RaverWatchItem, name: string) => {
      const layer = item.layer as RaverWatchDrawnLayer;
      const level = levelOf(item);
      regionsDrawn.set(layer, [...(regionsDrawn.get(layer) ?? []), `${name}: ${level === 'info' ? 'information' : `level ${level}`}`]);
    };
    const noteRegion = (item: RaverWatchItem, code: string) => noteRegionNamed(item, regionName(code) ?? code.toUpperCase());

    /*
     * A featured item is drawn larger and the rest fainter, as a featured report
     * is (decision D-F, section 18); when the featured one is not drawn here,
     * nothing is dimmed.
     */
    const featuring = featuredId !== null && drawn.some((item) => item.id === featuredId);
    const emphasis = (item: RaverWatchItem) => (!featuring ? { size: 1, opacity: 1 }
      : item.id === featuredId ? { size: FEATURED_SCALE, opacity: 1 } : { size: 1, opacity: FEATURED_OTHERS_OPACITY });

    const describe = (it: RaverWatchItem) => describeItem(it, regionName, moment);
    /*
     * One mark a place. Alerts and incidents are few and each is its own mark;
     * a town holds dozens of scene events in a week, so its events share one
     * mark, a little larger for more, whose hover names the next few. A public
     * venue is a place of its own, apart from its town's mark. HeatRisk comes
     * as a note per town per day, each standing from when it was sent, so a
     * town's days share one mark too, at the worst of them.
     */
    const marksOf: RaverWatchItem[][] = [];
    const towns = new Map<string, RaverWatchItem[]>();
    for (const item of drawn.filter((it) => it.point)) {
      if (item.layer !== 'SceneEvents' && item.layer !== 'HeatRisk') { marksOf.push([item]); continue; }
      const key = `${item.layer}:${item.point!.lat},${item.point!.lon}`;
      if (!towns.has(key)) { towns.set(key, []); marksOf.push(towns.get(key)!); }
      towns.get(key)!.push(item);
    }
    // A town whose events are all called off is drawn first, so a live one near it lies on top.
    marksOf.sort((a, b) => Number(b.every((it) => it.cancelled)) - Number(a.every((it) => it.cancelled)));
    // The item each mark is drawn as, so the key names only the levels drawn.
    const drawnAs: RaverWatchItem[] = [];
    // Each mark whose events stand in heat, and the worst of it.
    const haloed: Array<{ id: string; position: THREE.Vector3; sizePx: number; level: number; opacity: number }> = [];
    // Each mark whose events have just started, and how far through its flare the newest is (RN1, RN5).
    const flaring: Array<{ id: string; position: THREE.Vector3; sizePx: number; color: string; phase: number; opacity: number }> = [];
    const points = buildGlyphSprites(
      marksOf.map((group) => {
        const heat = group[0].layer === 'HeatRisk';
        // Soonest first: an event by its start, a HeatRisk day by when it ends.
        const ordered = [...group].sort((a, b) => (heat ? a.validUntil - b.validUntil : (a.start ?? a.validFrom) - (b.start ?? b.validFrom)));
        const rank = (it: RaverWatchItem) => RAVER_WATCH_LEVELS.indexOf(levelOf(it));
        // A town's mark is struck through only when every event in it is called off; a town's heat is its worst day.
        const first = heat
          ? ordered.reduce((worst, it) => (rank(it) < rank(worst) ? it : worst))
          : ordered.find((it) => !it.cancelled) ?? ordered[0];
        const mark = raverWatchSpriteMark(
          first,
          latLngToGlobeWorld(first.point!.lat, first.point!.lon, GLOBE_RADIUS_UNITS * REPORT_SPRITES),
          moment,
          describe,
        );
        drawnAs.push(first);
        const { size, opacity } = emphasis(first);
        // The worst heat among a mark's events (only scene events ever have it).
        const heats = group.flatMap((it) => { const level = heatAround(it, heatNotes); return level === null ? [] : [{ it, level }]; });
        if (heats.length) {
          const worst = heats.reduce((a, b) => (b.level > a.level ? b : a));
          haloed.push({ id: worst.it.id, position: mark.position, sizePx: mark.sizePx * size, level: worst.level, opacity: emphasis(worst.it).opacity });
        }
        // The newest start among a mark's events flares (only scene events ever do).
        const phases = group.flatMap((it) => { const p = flareAt(it, moment); return p === null ? [] : [{ it, p }]; });
        if (phases.length) {
          const newest = phases.reduce((a, b) => (b.p < a.p ? b : a));
          flaring.push({
            id: newest.it.id, position: mark.position, sizePx: mark.sizePx * size, phase: newest.p,
            color: RAVER_WATCH_LEVEL_LOOK[levelOf(newest.it)].color, opacity: emphasis(newest.it).opacity,
          });
        }
        if (group.length === 1) return { ...mark, sizePx: mark.sizePx * size, opacity: (mark.opacity ?? 1) * opacity };
        const named = ordered.slice(0, EVENTS_NAMED).map((it) => describeItem(it, regionName, moment, { credit: false }));
        const more = group.length > EVENTS_NAMED ? [`and ${group.length - EVENTS_NAMED} more`] : [];
        const atVenue = first.precision === 'venue';
        if (heat) {
          return {
            ...mark,
            sizePx: mark.sizePx * size,
            opacity: (mark.opacity ?? 1) * opacity,
            tooltip: [`${group.length} HeatRisk days here, soonest first:`, ...named, ...more].join('\n'),
          };
        }
        return {
          ...mark,
          sizePx: mark.sizePx * size * Math.min(1.6, 1 + 0.15 * Math.log2(group.length)),
          // Solid once any of them has begun.
          opacity: Math.max(...group.map((it) => raverWatchSpriteMark(it, mark.position, moment, () => '').opacity ?? 1)) * opacity,
          tooltip: [
            `${group.length} scene events ${atVenue ? 'at' : 'in'} ${first.location ?? 'this town'}, soonest first:`,
            ...named, ...more, ...(atVenue ? [VENUE_CREDIT] : []),
          ].join('\n'),
        };
      }).map((mark, i) => {
        // Each mark opens the notes its hover names, soonest first, with their sources (D-CT, CT3).
        const group = marksOf[i];
        const heat = group[0].layer === 'HeatRisk';
        const ordered = [...group].sort((a, b) => (heat ? a.validUntil - b.validUntil : (a.start ?? a.validFrom) - (b.start ?? b.validFrom)));
        return { ...mark, opens: noteSet(`Raver Watch · ${LABEL[group[0].layer as RaverWatchDrawnLayer]}`, ordered, raverWatchGlobeNote) };
      }),
      atlas,
      RAVER_WATCH_LAYOUT,
      // `layers`, per mark, is what describeView counts a mark under.
      { userData: { layer: 'Raver Watch', layers: marksOf.map((group) => LABEL[group[0].layer as RaverWatchDrawnLayer]), ids: marksOf.map((group) => group[0].id) } },
    );
    if (points) {
      sprites.add(points);
      drawnAs.forEach(noteLevel);
      /*
       * A halo of light round each event standing in heat (RN2), drawn just before the
       * glyphs among the layer's marks, so it lies under them.
       */
      for (const halo of haloed) {
        const light = buildScreenPoints(
          [{ position: halo.position, sizePx: halo.sizePx, color: toColor(DATA_SCALES.heatRisk[halo.level]) }],
          { style: 'glow', opacity: HALO_OPACITY * halo.opacity, userData: { type: RAVER_WATCH_HALO_TYPE, ids: [halo.id] } },
        );
        light.renderOrder = SCREEN_POINTS_RENDER_ORDER - 1;
        sprites.add(light);
      }
      // A ring round each event just started, swelling and fading through its twenty minutes (RN1).
      for (const flare of flaring) {
        sprites.add(buildScreenPoints(
          [{ position: flare.position, sizePx: flare.sizePx * (FLARE_FROM + FLARE_GROWTH * flare.phase), color: toColor(flare.color) }],
          { style: 'ring', opacity: (1 - flare.phase) * FLARE_OPACITY * flare.opacity, userData: { type: RAVER_WATCH_FLARE_TYPE, ids: [flare.id] } },
        ));
      }
    }

    // A point that stands for a state reads as an area: a faint ring round it.
    for (const item of drawn) {
      if (!item.point || item.precision !== 'state') continue;
      outlines.add(GeometryFactory.buildBorderLines([ringAround(item.point, `${item.id}#ring`)], {
        elevation: OUTLINE_ELEVATION,
        color: toColor(RAVER_WATCH_REGION_COLOR),
        opacity: OUTLINE_OPACITY * 0.6 * fadeAt(item, moment) * emphasis(item).opacity,
      }));
    }

    for (const item of drawn) {
      const codes = regionsOfItem(item, regions);
      const features = codes.flatMap((code) => outlineOf(code, regions));
      if (features.length === 0) continue;
      outlines.add(GeometryFactory.buildBorderLines(features, {
        elevation: OUTLINE_ELEVATION,
        color: toColor(RAVER_WATCH_REGION_COLOR),
        opacity: OUTLINE_OPACITY * fadeAt(item, moment) * emphasis(item).opacity,
      }));
      // A wide area is named as itself, not country by country.
      if (item.region) noteRegionNamed(item, item.region === 'europe' ? 'Europe' : item.region);
      else noteRegion(item, codes[0]);
    }

    for (const layer of DRAWN_LAYERS) {
      const levels = levelsDrawn.get(layer) ?? new Set<RaverWatchLevel>();
      const regions = regionsDrawn.get(layer) ?? [];
      if (!active[layer] || (levels.size === 0 && regions.length === 0)) { publishLegend(layer, null); continue; }
      const glyphs = [...new Set(drawn.filter((item) => item.layer === layer).map(glyphOf))];
      publishLegend(layer, {
        layerId: layer,
        layer: LABEL[layer],
        colorMeans: layer === 'SceneEvents'
          ? 'scene events carry no level: violet, the mode’s own'
          : layer === 'HeatRisk'
            ? 'the level its note states, red from HeatRisk 3 and amber at 2; the backing says it too'
            : 'the level its note states; the backing says it too',
        shapeMeans: SHAPE_MEANS[layer] ?? `the glyph is what happened: ${glyphs.map((glyph) => RAVER_WATCH_GLYPH_MEANING[glyph]).join(', ')}`,
        swatches: [
          ...RAVER_WATCH_LEVELS.filter((level) => levels.has(level)).map((level) => ({
            color: RAVER_WATCH_LEVEL_LOOK[level].color,
            // A scene event states no level: its disc says what it is, not "information".
            label: layer === 'SceneEvents' ? 'a scene event (a disc)' : RAVER_WATCH_LEVEL_LOOK[level].means,
            style: RAVER_WATCH_LEVEL_LOOK[level].backing,
          })),
          // Each heat level haloed, while one is drawn (RN2).
          ...(layer === 'SceneEvents' && points
            ? [...new Set(haloed.map((h) => h.level))].sort().map((level) => ({
              color: DATA_SCALES.heatRisk[level], label: `in a town at HeatRisk ${level} (${heatRiskName(level)}) that day: a halo`, shape: 'glow',
            }))
            : []),
          // A flare, while one is drawn (RN1).
          ...(layer === 'SceneEvents' && points && flaring.length
            ? [{ color: flaring[0].color, label: FLARE_KEY, shape: 'ring' }]
            : []),
          ...regions.slice(0, REGIONS_NAMED).map((label) => ({ color: RAVER_WATCH_REGION_COLOR, label, shape: 'line' })),
          ...(regions.length > REGIONS_NAMED
            ? [{ color: RAVER_WATCH_REGION_COLOR, label: `and ${regions.length - REGIONS_NAMED} more outlined`, shape: 'line' }]
            : []),
        ],
      });
    }
    return () => {
      clearGroup(sprites);
      clearGroup(outlines);
      DRAWN_LAYERS.forEach((layer) => publishLegend(layer, null));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `active` is keyed by value
  }, [drawn, atlas, regions, moment, activeKey, featuredId, heatNotes]);

  // A subdivision with no outline here stands as its country, for the handle as on the globe.
  const regionFor = useMemo(() => (code: string) => {
    const outlined = regionToOutline(code, canOutline(regions));
    return outlined ? regionOf(outlined, regions) : null;
  }, [regions]);
  const reports = useMemo(() => raverWatchShareReports(drawn, regionFor), [drawn, regionFor]);
  const featured = useMemo(() => {
    const item = featuredId === null ? undefined : drawn.find((it) => it.id === featuredId);
    return item ? featuredRaverWatchFor(item, regionFor) : null;
  }, [drawn, regionFor, featuredId]);
  const listed = useMemo(
    () => elsewhere(items.filter((item) => on(item.layer)), moment, canOutline(regions)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `on` reads `active`, keyed here by value
    [items, moment, regions, activeKey],
  );

  const drawnFeeds = useMemo<FeedProvenance[]>(() => DRAWN_LAYERS.filter((layer) => active[layer]).map((layer) => {
    const ofLayer = items.filter((item) => item.layer === layer);
    const sources = [...new Set(ofLayer.filter((item) => standsAt(item, moment)).map((item) => item.source))];
    const missing = notDrawn(ofLayer, moment, canOutline(regions));
    const said = [
      missing.ended ? `${missing.ended} past its end, not drawn` : '',
      missing.notYet ? `${missing.notYet} not begun` : '',
      missing.outsideWeekend ? `${missing.outsideWeekend} outside their own town's weekend, not drawn` : '',
      missing.regionNotDrawn ? `${missing.regionNotDrawn} for a region not outlined here, listed` : '',
      missing.noPlace ? `${missing.noPlace} naming no place, listed` : '',
      missing.news ? `${missing.news} policy news, listed` : '',
      missing.sceneNews ? `${missing.sceneNews} scene news, listed` : '',
    ].filter(Boolean);
    return {
      name: `${LABEL[layer]}${sources.length ? ` from ${sources.join(', ')}` : ', posted on The Record'}`
        + (said.length ? ` (${said.join('; ')})` : ''),
      // The layer it feeds, for the globe's loading status (D-LS).
      layer,
      lastUpdated: status.at === null ? null : new Date(status.at).toISOString(),
      error: status.error,
      loading: !status.loaded && !status.error,
      note: unread.length ? `${STANDING_NOTE} ${unreadNote(unread)}` : STANDING_NOTE,
      noteShort: unread.length ? `${STANDING_NOTE_SHORT} ${UNREAD_NOTE_SHORT}` : STANDING_NOTE_SHORT,
      shortName: LABEL[layer],
      // Our own notes, nothing to credit: the operator dropped our name from every card (24 Oct; record D-L).
      credits: [],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `active` is keyed by value
  }), [items, unread, status, moment, regions, activeKey]);
  // Harm reduction sites: how many Mecha Jono posted, none drawn by this build yet (D-LS, LS7).
  const harmPosted = useMemo(() => items.filter((item) => item.layer === 'HarmReductionSites').length, [items]);
  const feeds = useMemo<FeedProvenance[]>(() => (harmReductionSites ? [...drawnFeeds, {
    name: `Harm-reduction sites posted on The Record (${harmPosted ? `${harmPosted} posted, not drawn: this build does not draw them yet` : 'none posted'})`,
    shortName: 'Harm-reduction sites',
    layer: 'HarmReductionSites',
    lastUpdated: status.at === null ? null : new Date(status.at).toISOString(),
    error: status.error,
    loading: !status.loaded && !status.error,
    // Our own notes, nothing to credit: the operator dropped our name from every card (24 Oct; record D-L).
    credits: [],
  }] : drawnFeeds), [drawnFeeds, harmReductionSites, harmPosted, status]);

  const closeUpRefusal = useCallback((id: string): string | null | undefined => {
    const item = drawn.find((it) => it.id === id);
    if (!item) return undefined;
    const kind = closeUpKind(item);
    return typeof kind === 'string' ? null : kind.refused;
  }, [drawn]);
  const closeUp = useCallback(async (id: string): Promise<CardInset | CloseUpRefusal | undefined> => {
    const item = drawn.find((it) => it.id === id);
    if (!item) return undefined;
    const kind = closeUpKind(item);
    if (typeof kind !== 'string') return kind;
    return insetFor(item, drawn, kind === 'heat' ? await loadUsStates() : undefined, territories);
  }, [drawn, territories]);

  const whyNotDrawn = useCallback((id: string): string | null | undefined => {
    const item = items.find((it) => it.id === id);
    if (!item) return undefined;
    if (reports.some((report) => report.id === id)) return null;
    if (!(DRAWN_LAYERS as readonly string[]).includes(item.layer)) return `"${id}" is a ${item.layer} note, which no layer here draws.`;
    const layer = item.layer as RaverWatchDrawnLayer;
    if (!active[layer]) return `"${id}" is a ${LABEL[layer]} note, and ${LABEL[layer]} is off: setLayer('${layer}') or pinLayers(['${layer}']).`;
    if (isNews(item)) return `"${id}" is ${isPolicyNews(item) ? 'policy' : 'scene'} news, listed in the Raver Watch panel and never drawn.`;
    if (!standsAt(item, moment)) {
      const minute = (s: number) => `${new Date(s * 1000).toISOString().slice(0, 16).replace('T', ' ')}Z`;
      const from = item.start ?? item.validFrom;
      const until = item.end ?? item.validUntil;
      return `"${id}" applies from ${minute(from)} until ${minute(until)}, outside the moment the globe shows: set the time window, or a shot's time.`;
    }
    const where = item.jurisdiction ?? item.region;
    return where
      ? `"${id}" applies to ${where}, which has no outline here: it is listed in the Raver Watch panel.`
      : `"${id}" names no place the globe can draw: it is listed in the Raver Watch panel as unplaced.`;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `active` is keyed by value
  }, [items, reports, moment, activeKey]);

  const tourCandidates = useCallback((playlist: 'raves' | 'heat', nowMs: number) => {
    if (!anyOn) return null;
    const inRegions = (code: string) => regionOf(code, regions);
    const candidates = playlist === 'raves' ? raveCandidates(items, nowMs, inRegions) : heatCandidates(items, nowMs, inRegions);
    return { candidates, complete: status.loaded };
  }, [anyOn, status.loaded, items, regions]);

  // Tonight from a moment, for its card (raver-nights.md, RN3): every scene event read, and the heat notes beside them.
  const tonightFrom = useCallback((fromS: number) => tonightOf(items, fromS), [items]);
  const licensed = useMemo(
    () => drawn.flatMap((it) => (it.license && it.point ? [{ id: it.id, lat: it.point.lat, lng: it.point.lon, licence: it.license }] : [])),
    [drawn],
  );

  return useMemo(
    () => ({ feeds, reports, featured, listed, anyOn, closeUpRefusal, closeUp, whyNotDrawn, tourCandidates, tonightFrom, licensed }),
    [feeds, reports, featured, listed, anyOn, closeUpRefusal, closeUp, whyNotDrawn, tourCandidates, tonightFrom, licensed],
  );
}
