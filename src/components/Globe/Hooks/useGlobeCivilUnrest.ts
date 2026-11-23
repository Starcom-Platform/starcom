/**
 * useGlobeCivilUnrest: Civil Unrest on the globe (decision D-CU, docs/missions/01-architecture-decisions/
 * civil-unrest.md). Mecha Jono's protest desk, from The Record (services/civilUnrest/civilUnrest.ts), in the
 * sections that are on: Civil Unrest and Protest surges.
 *
 * - A place's days of unrest as one crowd glyph (CU2): at the city a note gives, else at its country's middle;
 *   the hover names each day, its kinds and each crowd count beside its claimant. The countries with a day
 *   standing are lightly tinted in chartreuse (CU1).
 * - A protest surge as a broken ring at its country's middle, the country's edge dashed round it (CU4): a surge
 *   in reporting, not in protest, as its hover and its card say. Never the crowd glyph.
 *
 * Read only while a section is on. It says what it draws: the key, the card's line, and whenReady, which holds a
 * card until the notes are read and their countries outlined.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import {
  civilUnrestItems, civilUnrestStatus, startCivilUnrest, subscribeCivilUnrest, type CivilUnrestItem, type CivilUnrestSection,
} from '../../../services/civilUnrest/civilUnrest';
import { byPlace, civilUnrestNote, drawnFor, placeHover, surgeHover, type UnrestMoment } from '../../../services/civilUnrest/civilUnrestView';
import type { RegionOutline } from '../../../services/raverWatch/usStates';
import { buildGlyphSprites, disposeIntelSprites, type GlyphSpriteMark } from '../intelReportSprites';
import { CIVIL_UNREST_LAYOUT, civilUnrestAtlas, civilUnrestMark } from '../civilUnrestSprites';
import { GeometryFactory, type LineFeature, type PolygonFeature } from '../../../geopolitical/geometry/geometryFactory';
import { buildBorderLineBatches } from '../../../geopolitical/geometry/fatBorderLines';
import type { LineLook } from '../../../geopolitical/geometry/lineBatches';
import { createTerritoryFillMaterial } from '../../../geopolitical/theme/territoryFillMaterial';
import { TERRITORY_FILLS_ORDER } from '../../../geopolitical/theme/applyTerritoryLook';
import { regionPlace } from '../../../features/globe/capture/regionPlace';
import type { TerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { civilUnrestGlobeNote, noteSet } from '../../../features/globe/noteDetail/globeNotesOf';
import { latLngToGlobeWorld, GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { drawAboveSurfaceLayers } from '../screenPoints';
import { CLOUDS, REPORT_SPRITES, SURFACE_LINES } from '../globeAltitudes';
import { ridesShell } from '../../../globe-engine/shellLift';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import type { FeedProvenance } from '../../../features/globe/capture/shareCardProvenance';
import { civilUnrestShareReports, featuredCivilUnrestFor } from '../../../features/globe/capture/civilUnrestReports';
import type { FeaturedReport, ShareReportInfo } from '../../../features/globe/capture/shareReports';
import { DATA_SCALES } from '../../../styles/tokens';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const GLOBE_RADIUS_UNITS = 100;
/** 0.1° of latitude: how finely a point is ever placed. */
const TENTH_OF_A_DEGREE_M = 11_100;
const COLOR = parseInt(DATA_SCALES.civilUnrest.slice(1), 16);
/** How light the tint is: lighter than an Organisation's fill, so the countries' own colours still read (CU2). */
export const UNREST_TINT_OPACITY = 0.22;
const FILL_ELEVATION = ((CLOUDS + SURFACE_LINES) / 2 - 1) * GLOBE_RADIUS_UNITS;
const LINE_ELEVATION = (SURFACE_LINES - 1) * GLOBE_RADIUS_UNITS;
/** A surge's country edge, dashed: a ring round the country, never a fill (CU4). */
const SURGE_EDGE_LOOK: LineLook = { opacity: 0.9, linewidth: 1.6, dashed: true, dashSize: 1.2, gapSize: 0.9, dashScale: 1, renderOrder: 108 };
/** How this layer's tint and rings are found by a probe or a test. */
export const CIVIL_UNREST_TINT_TYPE = 'civilUnrestTint';
export const PROTEST_SURGE_RING_TYPE = 'protestSurgeRings';

const NOTE_SHORT = 'Civil Unrest: crowd counts as each claimant states them; a surge is in reporting, not in protest.';

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of Civil Unrest: false while a section is on and its notes are not read, or its countries not outlined. */
export function civilUnrestReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

export interface UseGlobeCivilUnrestOptions {
  scene: THREE.Scene | null;
  active: Readonly<Record<CivilUnrestSection, boolean>>;
  /** The countries' outlines; undefined until they have loaded. */
  territories?: TerritoryIndex;
  /** The window chosen on the timeline, in ms; null while live. */
  window: { start: number; end: number } | null;
  /** The moment the timeline is paused at, in ms; null while live. */
  moment?: number | null;
  /** The item a card is about, when it is one of Civil Unrest's. */
  featuredId?: string | null;
  /** The countries with a day standing, lightly tinted (CU1); the rail turns it off (OR5). Default on. */
  tint?: boolean;
}

/** A note drawn, at the place its mark stands, with that place's name and how far from there it may be, in metres. */
export interface CivilUnrestDrawn { item: CivilUnrestItem; lat: number; lng: number; placeName: string; precisionM: number }

export interface CivilUnrestOnGlobe {
  feeds: FeedProvenance[];
  anyOn: boolean;
  /** Every note drawn, each at its mark's place, newest first: what listReports and a card read. */
  drawn: CivilUnrestDrawn[];
  /** The drawn notes as listReports lists them, and the featured one as a card states it. */
  reports: ShareReportInfo[];
  featured: FeaturedReport | null;
  /** The drawn notes that carry a licence, each at its place: a card credits those in its picture. */
  licensed: ReadonlyArray<{ id: string; lat: number; lng: number; licence: string }>;
  status: { loaded: boolean; error: string | null };
}

const polygonsOf = (geometry: RegionOutline['geometry']): Array<Array<Array<[number, number]>>> =>
  (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as Array<Array<Array<[number, number]>>>;

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child);
    if ((child as THREE.Points).isPoints) disposeIntelSprites(child as THREE.Points);
    child.traverse((part) => {
      const mesh = part as THREE.Mesh;
      if (mesh.geometry && !(part as THREE.Points).isPoints) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (material && !(part as THREE.Points).isPoints) (Array.isArray(material) ? material : [material]).forEach((m) => m.dispose());
    });
  }
}

export function useGlobeCivilUnrest({ scene, active, territories, window, moment: pausedAt = null, featuredId = null, tint = true }: UseGlobeCivilUnrestOptions): CivilUnrestOnGlobe {
  const anyOn = active.CivilUnrest || active.ProtestSurges;
  const sectionsKey = `${+active.CivilUnrest}${+active.ProtestSurges}`;

  // Read only while a section is on; one read however many ask.
  useEffect(() => (anyOn ? startCivilUnrest() : undefined), [anyOn]);
  const items = useSyncExternalStore(subscribeCivilUnrest, civilUnrestItems, civilUnrestItems);
  const status = useSyncExternalStore(subscribeCivilUnrest, civilUnrestStatus, civilUnrestStatus);

  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    if (!anyOn || window) return undefined;
    const timer = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 60_000);
    return () => clearInterval(timer);
  }, [anyOn, window]);
  const windowStart = window?.start ?? null;
  const windowEnd = window?.end ?? null;
  const moment = useMemo<UnrestMoment>(() => (windowStart !== null && windowEnd !== null
    ? { atS: (pausedAt ?? windowEnd) / 1000, window: { fromS: windowStart / 1000, untilS: windowEnd / 1000 } }
    : { atS: (pausedAt ?? minute * 60_000) / 1000, window: null }), [minute, windowStart, windowEnd, pausedAt]);

  const notes = useMemo(
    () => drawnFor(items, moment, { CivilUnrest: sectionsKey[0] === '1', ProtestSurges: sectionsKey[1] === '1' }),
    [items, moment, sectionsKey],
  );
  const days = useMemo(() => byPlace(notes.filter((n) => n.section === 'CivilUnrest')), [notes]);
  const surges = useMemo(() => byPlace(notes.filter((n) => n.section === 'ProtestSurges')), [notes]);

  // Each place, where its mark stands and what it is called: the city a note gives, else its country's middle.
  const country = useMemo(() => (code: string): RegionOutline | null => territories?.byCode(code) ?? null, [territories]);
  const placeOf = useMemo(() => (first: CivilUnrestItem): { lat: number; lng: number; name: string; precisionM: number } | null => {
    const region = first.jurisdiction ? country(first.jurisdiction) : null;
    if (first.point) return { lat: first.point.lat, lng: first.point.lon, name: first.placeName ?? region?.name ?? 'a city', precisionM: TENTH_OF_A_DEGREE_M };
    const middle = region ? regionPlace(region) : null;
    return middle && region ? { lat: middle.lat, lng: middle.lng, name: region.name, precisionM: middle.precisionM } : null;
  }, [country]);

  const [atlas, setAtlas] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let live = true;
    void civilUnrestAtlas().then((texture) => { if (live) setAtlas(texture); });
    return () => { live = false; };
  }, []);

  const spritesRef = useRef<THREE.Group>(ridesShell(drawAboveSurfaceLayers(new THREE.Group())));
  // The tint and the surges' rings, ours to dispose. In the fills' frame.
  const shapesRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    return group;
  })());
  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('CivilUnrest', spritesRef.current);
  useLayerRoot('CivilUnrest', shapesRef.current);
  useEffect(() => registerTooltipGroup(spritesRef.current), []);
  useEffect(() => {
    if (!scene) return undefined;
    const groups = [shapesRef.current, spritesRef.current];
    scene.add(...groups);
    return () => { scene.remove(...groups); };
  }, [scene]);

  // The countries with a day standing, tinted; and each surge's country, its edge dashed round it.
  const tinted = useMemo(() => (tint ? [...new Set(days.places.flatMap((p) => p.items.map((i) => i.jurisdiction).filter((c): c is string => !!c)))].sort() : []), [days, tint]);
  const ringed = useMemo(() => [...new Set(surges.places.flatMap((p) => p.items.map((i) => i.jurisdiction).filter((c): c is string => !!c)))].sort(), [surges]);
  const tintKey = tinted.join(',');
  const ringKey = ringed.join(',');
  useEffect(() => {
    const group = shapesRef.current;
    clearGroup(group);
    const fills = new THREE.Group();
    fills.userData = { type: CIVIL_UNREST_TINT_TYPE, countries: tinted };
    for (const code of tinted) {
      const region = country(code);
      if (!region) continue;
      const features: PolygonFeature[] = polygonsOf(region.geometry)
        .flatMap((rings, i) => (rings[0] && rings[0].length >= 4 ? [{ id: `civil-unrest:${code}#${i}`, rings }] : []));
      const built = GeometryFactory.buildTerritoryPolygons(features, { color: COLOR, opacity: UNREST_TINT_OPACITY, elevation: FILL_ELEVATION });
      for (const part of built.children) {
        const geometry = (part as THREE.Mesh).geometry;
        if (!geometry) continue;
        const mesh = new THREE.Mesh(geometry, createTerritoryFillMaterial({ baseColorHex: COLOR, opacity: UNREST_TINT_OPACITY }));
        mesh.renderOrder = TERRITORY_FILLS_ORDER + 1;
        fills.add(mesh);
      }
    }
    const edges: LineFeature[] = ringed.flatMap((code) => {
      const region = country(code);
      return region ? polygonsOf(region.geometry).flatMap((rings, i) => (rings[0] && rings[0].length >= 4 ? [{ id: `protest-surge:${code}#${i}`, coordinates: rings[0] }] : [])) : [];
    });
    const rings = buildBorderLineBatches(edges, () => ({ color: COLOR, look: SURGE_EDGE_LOOK }), { elevation: LINE_ELEVATION });
    rings.userData = { type: PROTEST_SURGE_RING_TYPE, countries: ringed };
    group.add(fills, rings);
    return () => clearGroup(group);
    // tintKey and ringKey stand for tinted and ringed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tintKey, ringKey, country]);

  // Every note drawn, at its mark's place.
  const drawn = useMemo<CivilUnrestDrawn[]>(() => [...days.places, ...surges.places].flatMap((place) => {
    const at = placeOf(place.items[0]);
    return at ? place.items.map((item) => ({ item, lat: at.lat, lng: at.lng, placeName: at.name, precisionM: at.precisionM })) : [];
  }), [days, surges, placeOf]);

  // The marks: a crowd a place of days, a broken ring a country of surges; each opens the notes its hover names.
  useEffect(() => {
    const group = spritesRef.current;
    clearGroup(group);
    const marks: GlyphSpriteMark[] = [];
    for (const [section, places] of [['CivilUnrest', days.places], ['ProtestSurges', surges.places]] as const) {
      for (const place of places) {
        const at = placeOf(place.items[0]);
        if (!at) continue;
        const tooltip = section === 'CivilUnrest' ? placeHover(place.items, at.name) : surgeHover(place.items, at.name);
        marks.push({
          ...civilUnrestMark(section, latLngToGlobeWorld(at.lat, at.lng, GLOBE_RADIUS_UNITS * REPORT_SPRITES), tooltip),
          opens: noteSet(`${section === 'CivilUnrest' ? 'Civil Unrest' : 'Protest surges'} · ${at.name}`, place.items, civilUnrestGlobeNote),
        });
      }
    }
    const points = marks.length ? buildGlyphSprites(marks, atlas, CIVIL_UNREST_LAYOUT) : null;
    if (points) group.add(points);
    return () => clearGroup(group);
  }, [days, surges, placeOf, atlas]);

  // A card waits for the notes while a section is on, and for their countries.
  const countryStanding = useMemo(() => notes.some((note) => !note.point && !!note.jurisdiction), [notes]);
  useEffect(() => {
    if (anyOn && !status.loaded && !status.error) readiness = { ready: false, why: 'Civil Unrest was still being read from The Record' };
    else if (countryStanding && !territories) readiness = { ready: false, why: "Civil Unrest's countries were still being outlined" };
    else readiness = { ready: true };
  }, [anyOn, status, countryStanding, territories]);
  useEffect(() => () => { readiness = { ready: true }; }, []);

  useEffect(() => {
    if (!days.places.length) return undefined;
    publishLegend('CivilUnrest', {
      layerId: 'CivilUnrest',
      layer: 'Civil Unrest',
      shapeMeans: 'a crowd at the city a day of unrest names, else at its country\'s middle; its hover gives each crowd count beside its claimant',
      swatches: [{ color: DATA_SCALES.civilUnrest, label: 'a day of unrest; its country lightly tinted', shape: 'line' }],
    });
    return () => publishLegend('CivilUnrest', null);
  }, [days.places.length]);
  useEffect(() => {
    if (!surges.places.length) return undefined;
    publishLegend('ProtestSurges', {
      layerId: 'ProtestSurges',
      layer: 'Protest surges',
      shapeMeans: 'a broken ring at the country, its edge dashed: a surge in reporting, not in protest',
      swatches: [{ color: DATA_SCALES.civilUnrest, label: 'a surge in reporting, not in protest', shape: 'line' }],
    });
    return () => publishLegend('ProtestSurges', null);
  }, [surges.places.length]);

  const feeds = useMemo<FeedProvenance[]>(() => {
    const at = status.at === null ? null : new Date(status.at).toISOString();
    const base = { lastUpdated: at, error: status.error, loading: !status.loaded && !status.error, noteShort: NOTE_SHORT, credits: [] };
    const note = civilUnrestNote(days.places.reduce((n, p) => n + p.items.length, 0), surges.places.reduce((n, p) => n + p.items.length, 0), days.unplaced.length + surges.unplaced.length);
    return [
      ...(active.CivilUnrest ? [{ ...base, name: 'Civil Unrest: days of protest and unrest, posted on The Record', shortName: 'Civil Unrest', layer: 'CivilUnrest', note }] : []),
      ...(active.ProtestSurges ? [{ ...base, name: 'Protest surges: surges in reporting of protest, posted on The Record', shortName: 'Protest surges', layer: 'ProtestSurges', note }] : []),
    ];
  }, [active.CivilUnrest, active.ProtestSurges, status, days, surges]);

  const licensed = useMemo(
    () => drawn.flatMap(({ item, lat, lng }) => (item.licence ? [{ id: item.id, lat, lng, licence: item.licence }] : [])),
    [drawn],
  );

  const reports = useMemo(() => civilUnrestShareReports(drawn), [drawn]);
  const featured = useMemo(() => {
    const it = featuredId === null ? undefined : drawn.find((d) => d.item.id === featuredId);
    return it ? featuredCivilUnrestFor(it) : null;
  }, [drawn, featuredId]);

  return { feeds, anyOn, drawn, reports, featured, licensed, status: { loaded: status.loaded, error: status.error } };
}
