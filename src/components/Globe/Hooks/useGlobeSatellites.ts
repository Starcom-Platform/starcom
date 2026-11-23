/**
 * useGlobeSatellites — Real satellite tracking visualization on the Globe.
 *
 * Extracted from Globe.tsx SATELLITES INTEGRATION section. Uses CelesTrak
 * data via SatelliteVisualizationService and draws each satellite as a point of fixed
 * on-screen size (see ../screenPoints.ts for why not spheres).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { satelliteVisualizationService } from '../../../services/Satellites/SatelliteVisualizationService';
import { collectGeometryStats } from '../../../utils/threeResourceMetrics';
import { visualizationResourceMonitor } from '../../../services/visualization/VisualizationResourceMonitor';
import { createLogger } from '@utils/logger';
import { buildSatellitePoints, colorForType, satelliteIconAtlas, satelliteSwatches } from '../satellitePoints';
import type { KindAtlas } from '../../../features/globe/marks/kindAtlas';
import { createCatalogPropagator, type CatalogSnapshots } from '../../../services/Satellites/catalogPropagator';
import type { OmmRecord } from '../../../services/Satellites/catalogPropagation';
import { stilledAt } from '../../../globe-engine/captureClock';
import { json2satrec, type SatRec } from 'satellite.js';
import { satelliteTrack } from '../../../services/Satellites/satelliteTrack';
import { EARTH_TURN_RAD_PER_S, groupPlanes, ringOf } from '../../../services/Satellites/orbitalPlanes';
import { debrisCloudOf } from '../../../services/Satellites/debrisClouds';
import { spreadOf, DAY_MS, type SpreadTurn } from '../../../services/Satellites/debrisSpread';
import { buildDebrisLapse, LAPSE_HOLD_MS, LAPSE_PLAY_MS, type DebrisLapse } from '../debrisLapse';
import { registerDebrisLapse, setDebrisLapseAt } from '../../../features/globe/debrisLapse/debrisLapseStore';
import { formatUtcMonth } from '../../../utils/utcTime';
import { buildLineBatch } from '../../../geopolitical/geometry/lineBatches';
import { GeometryFactory } from '../../../geopolitical/geometry/geometryFactory';
import { getGlobeNoteState, subscribeGlobeNotes } from '../../../features/globe/noteDetail/globeNoteStore';
import { ridesShell } from '../../../globe-engine/shellLift';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { SURFACE_LINES } from '../globeAltitudes';
import { ROLES } from '../../../styles/tokens';
import { publishLegend, cssColorOf } from '../../../services/globe/globeLegendStore';
import { drawAboveSurfaceLayers, setScreenPointsBlend, setScreenPointsSnapshots, setScreenPointsStyle, SCREEN_POINTS_RENDER_ORDER } from '../screenPoints';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { resolveMarkerStyle, type MarkerStyleChoices } from '../markerStyles';
import { satelliteNoteSet } from '../../../features/globe/noteDetail/satelliteNote';
import { getGlobeQuality, qualityStepOf, setGlobePlanesInUse, subscribeGlobeQuality } from '../../../services/globe/globeQuality';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

const log = createLogger({ prefix: 'Globe:Satellites' });
const SATELLITES_MODE_KEY = 'CyberCommand.Satellites' as const;

// Real bodies move. The whole catalogue is propagated in a worker (catalogPropagation.ts, at its true height,
// 100 scene units an Earth radius) for two moments a step apart, and the GPU blends between them each frame: once
// a second, as the solar system's bodies are placed (SolarSystemManager's PLACE_EVERY_MS). Before D-GV GV2 a
// hundred were moved on the page's thread, and before that none moved at all.
const STEP_MS = 1000;
/** How often the step is looked at: often enough to ask for the next pair halfway through a step. */
const POSITION_CHECK_MS = 100;
// How often to check whether the selected satellite set itself should be refreshed
// (re-fetch from CelesTrak / re-run curation). SatelliteVisualizationService already
// tracks its own CACHE_DURATION (1hr) / SELECTION_UPDATE_INTERVAL (5min) internally
// and no-ops if neither is due, so calling this check reasonably often is cheap; it's
// throttled here mainly to avoid doing the ID-set comparison every frame.
const SELECTION_CHECK_MS = 60_000;
/** The chosen satellite's lines, drawn again this often: the footprint moves with it, about 15 km in two seconds. */
const TRACK_REDRAW_MS = 2000;
/** The chosen satellite's lines: the accent cyan, the app's colour for what is chosen. */
const CHOSEN_LINE_COLOR = new THREE.Color(ROLES.accent.accent).getHex();
/** The ground track and footprint, on the surface lines' band. */
const GROUND_LINE_ELEVATION = (SURFACE_LINES - 1) * 100;
/**
 * The constellations' planes (D-GV GV2): Starlink's many faint, GPS's six plainer. Starlink's planes are 5° of node
 * apart and its satellites within a degree of their plane's; GPS's six are 60° apart.
 */
const PLANE_LOOK = {
  starlink: { color: 0x9fb4c0, opacity: 0.08, linewidth: 1, grouping: { inclinationStepDeg: 0.5, raanGapDeg: 1.5, minMembers: 8 } },
  gps_satellite: { color: 0x4488ff, opacity: 0.35, linewidth: 1.25, grouping: { inclinationStepDeg: 2, raanGapDeg: 10, minMembers: 3 } },
} as const;
/** The planes move with the stars, about 15° an hour against the Earth: drawn again this often. */
const PLANES_REDRAW_MS = 10_000;
/** The key's words for the rings. */
export const PLANE_KEY = 'a faint ring: one orbital plane of Starlink or GPS';
/** The key's words for the debris while the spread's lapse plays. */
export const DEBRIS_LAPSE_KEY = "Debris, each piece's plane turned back toward its breakup";
export const SATELLITE_PLANES_TYPE = 'satellitePlanes';
/** How a probe or a test finds the chosen satellite's lines. */
export const SATELLITE_ORBIT_TYPE = 'satelliteOrbit';
export const SATELLITE_GROUND_TYPE = 'satelliteGround';

/** A list whose items are made on first reading and kept: what a click opens, for thousands of marks. */
function lazyList<T>(length: number, make: (i: number) => T): T[] {
  const made = new Map<number, T>();
  return new Proxy(new Array<T>(length), {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) {
        const i = Number(key);
        if (i >= length) return undefined;
        if (!made.has(i)) made.set(i, make(i));
        return made.get(i);
      }
      return Reflect.get(target, key, receiver);
    },
    // Every index is there, made or not: map, forEach and the rest skip an index that is not.
    has(target, key) {
      if (typeof key === 'string' && /^\d+$/.test(key)) return Number(key) < length;
      return Reflect.has(target, key);
    },
  });
}

interface UseGlobeSatellitesOptions {
  globeRef: React.RefObject<GlobeMethods | undefined>;
  isLayerActive: (id: string) => boolean;
  /**
   * How the person chose to draw this layer's marks (decision D-F, step 6.3).
   * Read through resolveMarkerStyle so an unset or hand-edited value falls back
   * to what the layer drew before the choice existed.
   */
  markerStyles?: MarkerStyleChoices;
}

/**
 * Whether the satellite data actually arrived.
 *
 * This hook used to return only `{ groupRef }` — nothing about its data at all.
 * When CelesTrak's certificate expired on 2026-04-12 every load failed, and the
 * rest of the app had no way to know: the share card said "Layers shown:
 * Satellites" with no caveat for five months. A layer that cannot report its
 * source's health is indistinguishable from one whose sky is empty.
 */
export interface SatelliteSourceHealth {
  loading: boolean;
  /** Why the last initial load failed, or null. */
  error: string | null;
  /** Epoch ms of the last SUCCESSFUL load, or null when none has succeeded. */
  lastLoadedAt: number | null;
}

export function useGlobeSatellites({ globeRef, isLayerActive, markerStyles }: UseGlobeSatellitesOptions) {
  const [health, setHealth] = useState<SatelliteSourceHealth>({ loading: false, error: null, lastLoadedAt: null });
  // After the country fills in the draw order — see drawAboveSurfaceLayers.
  const groupRef = useRef<THREE.Group>(drawAboveSurfaceLayers(new THREE.Group()));
  // Hoverable: the catalogue knows each satellite's name (useGlobePointTooltips).
  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('Satellites', groupRef.current);
  useEffect(() => registerTooltipGroup(groupRef.current), []);
  const meshRef = useRef<THREE.Points | null>(null);
  const orderedIdsRef = useRef<string[]>([]);
  const animationFrameRef = useRef<number>();
  const lastPositionUpdateTimeRef = useRef(0);
  const lastSelectionCheckTimeRef = useRef(0);
  const lastPlanesTimeRef = useRef(0);

  /*
   * ─── WHY THE STYLE IS NOT A DEPENDENCY OF THE LOAD ─────────────────────────
   *
   * The style used to be read inside the effect below and listed in its
   * dependencies — by identity, as markerStyles. So picking a style for this
   * layer ran the effect's teardown, which calls
   * satelliteVisualizationService.dispose() and clears the catalogue, and then
   * its body, which loads the catalogue again. Restyling reloaded the data. It
   * also happened once on every visit: settings load on mount and replace the
   * default choices object with the stored one, the same choices in a new object.
   *
   * And it is why this hook could not be tested. A test that passed markerStyles
   * inline gave the effect a new object on every render, the effect set state,
   * the state re-rendered — and the vitest worker ran out of heap. The attempt
   * before this one was recorded as "a hook test crashed the vitest worker".
   *
   * Now the style is resolved to a string, which compares by value, and a
   * restyle rebuilds the marks from the satellites already loaded — through
   * restyleRef, which the load effect fills in because the builders it needs
   * live in its closure.
   */
  const style = resolveMarkerStyle(markerStyles, 'Satellites');
  const styleRef = useRef(style);
  // The named roles' icons for close in (OR30), once baked.
  const iconsRef = useRef<KindAtlas | null>(null);
  styleRef.current = style;
  const restyleRef = useRef<(() => void) | null>(null);
  /** The catalogue drawn, for a chosen satellite's elements. */
  const catalogueRef = useRef<ReturnType<typeof satelliteVisualizationService.catalogue>>([]);
  // The plane rings are read from the satellites, not data of their own: given up with the glow where the governor
  // steps a device down (the owner, 2026-10-24). Every satellite stays.
  const planeRings = qualityStepOf(useSyncExternalStore(subscribeGlobeQuality, getGlobeQuality, getGlobeQuality)).planeRings;
  const planeRingsRef = useRef(planeRings);
  planeRingsRef.current = planeRings;
  const redrawRingsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!globeRef.current) return;

    const globeObj = globeRef.current as unknown as { scene: () => THREE.Scene };
    const scene = globeObj?.scene();
    const group = groupRef.current;
    if (!scene || !group) return;

    let cancelled = false;

    const disposeMaterial = (mat: THREE.Material | THREE.Material[] | undefined) => {
      if (!mat) return;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    };

    const clearGroup = () => {
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
          child.geometry?.dispose();
          disposeMaterial(child.material as THREE.Material | THREE.Material[] | undefined);
        }
      }
      meshRef.current = null;
      orderedIdsRef.current = [];
      // The card's key goes with the marks it describes — see globeLegendStore.
      publishLegend('Satellites', null);
    };

    const teardown = () => {
      clearGroup();
      if (scene.children.includes(group)) scene.remove(group);
      satelliteVisualizationService.dispose();
      visualizationResourceMonitor.clearMode(SATELLITES_MODE_KEY);
    };

    const recordGeometry = (target: THREE.Object3D | THREE.Object3D[]) => {
      visualizationResourceMonitor.recordGeometry(SATELLITES_MODE_KEY, collectGeometryStats(target));
    };

    type Catalogue = ReturnType<typeof satelliteVisualizationService.catalogue>;
    let catalogue: Catalogue = [];
    const propagator = createCatalogPropagator();
    /** When the snapshots on the GPU begin, in ms since the epoch; the next pair, asked for before it is needed. */
    let drawnFromMs: number | null = null;
    let queued: CatalogSnapshots | null = null;
    let asking = false;
    let heights: Float32Array | null = null;
    // The planes the constellations fly in (D-GV GV2), and the snapshots their rings are read from.
    let planes: Array<{ kind: 'starlink' | 'gps_satellite'; members: number[] }> = [];
    let latest: { from: Float32Array; to: Float32Array } | null = null;
    const planesGroup = new THREE.Group();
    planesGroup.userData = { type: SATELLITE_PLANES_TYPE };
    scene.add(planesGroup);
    // The debris clouds' spread since each breakup, modelled (D-GV GV2, step 6), and the lapse playing it.
    let turns: SpreadTurn[] = [];
    let lapse: { run: DebrisLapse; startedAt: number; atMs: number; month: string } | null = null;
    const clearPlanes = () => {
      for (const child of [...planesGroup.children]) {
        planesGroup.remove(child);
        const line = child as THREE.Mesh;
        line.geometry?.dispose();
        (line.material as THREE.Material | undefined)?.dispose();
      }
    };
    const drawPlanes = () => {
      clearPlanes();
      if (!latest || planes.length === 0 || !planeRingsRef.current) return;
      for (const kind of ['starlink', 'gps_satellite'] as const) {
        const look = PLANE_LOOK[kind];
        const paths = planes.filter((plane) => plane.kind === kind)
          .map((plane, k) => ({ id: `${kind}:${k}`, positions: ringOf(plane.members, latest!.from, latest!.to, EARTH_TURN_RAD_PER_S * (STEP_MS / 1000)) ?? [], color: look.color }))
          .filter((path) => path.positions.length >= 6);
        const batch = buildLineBatch(paths, { opacity: look.opacity, linewidth: look.linewidth, dashed: false, dashSize: 1, gapSize: 0, dashScale: 1, renderOrder: SCREEN_POINTS_RENDER_ORDER - 2 });
        if (batch) planesGroup.add(batch);
      }
    };

    const legendFor = (sats: Catalogue) => {
      const ringed = planes.length > 0 && planeRingsRef.current;
      if (lapse) {
        // While the lapse plays only the debris is drawn, and at a moment modelled, not observed.
        publishLegend('Satellites', {
          layerId: 'Satellites',
          layer: 'Satellites',
          when: `modelled, ${lapse.month}`,
          colorMeans: 'role',
          shapeMeans: styleRef.current,
          swatches: [{ color: cssColorOf(colorForType('debris')), label: DEBRIS_LAPSE_KEY }],
        });
        return;
      }
      publishLegend('Satellites', {
        layerId: 'Satellites',
        layer: 'Satellites',
        /*
         * No sizeMeans: every satellite is drawn the same size now, and "Absent
         * when size carries nothing" is the store's convention. This said "role —
         * stations largest" beside "colour: role" — one fact on two channels.
         */
        // One hue, the space kind's; the named roles bright, each its icon close in; the many dimmed (OR30).
        colorMeans: 'satellites; brighter the named roles, each its icon close in',
        shapeMeans: styleRef.current,
        // From the catalogue actually drawn: a kind with nothing in it gets no swatch.
        swatches: [
          ...satelliteSwatches(sats.map((sat) => sat.type)),
          ...(ringed ? [{ color: cssColorOf(PLANE_LOOK.gps_satellite.color), label: PLANE_KEY, shape: 'line' }] : []),
        ],
      });
    };

    /*
     * The whole catalogue, about 12,000, where a hundred were drawn (D-GV GV2): each at its place in the first
     * snapshot, moving toward the second on the GPU. A satellite that does not propagate is drawn at the Earth's
     * centre, where the planet hides it; its hover and click are never reached.
     */
    const buildMesh = (sats: Catalogue, first: CatalogSnapshots) => {
      // A new catalogue mid-lapse: the lapse was drawn from the old one.
      stopLapse();
      clearGroup();
      const from = first.positions[0];
      heights = first.heights;
      const words = (i: number) => {
        const km = heights?.[i];
        return Number.isFinite(km) ? `, ${Math.round(km as number)} km` : '';
      };
      const points = buildSatellitePoints(
        sats.map((sat, i) => ({
          position: new THREE.Vector3(from[i * 3], from[i * 3 + 1], from[i * 3 + 2]),
          type: sat.type,
          tooltip: `${sat.name} — ${debrisCloudOf(sat.debrisOf)?.name ?? sat.type.replace(/_/g, ' ')}${words(i)}`,
        })),
        { type: 'satelliteGroup', count: sats.length },
        { style: styleRef.current, blend: true, icons: iconsRef.current },
      );
      // What a click opens, made when it is asked for: twelve thousand notes made up front would never be read.
      points.userData.opens = lazyList(sats.length, (i) => satelliteNoteSet({ ...sats[i], altitude: heights?.[i] ?? NaN }));
      if (cancelled) {
        points.geometry.dispose();
        disposeMaterial(points.material as THREE.Material);
        return;
      }
      setScreenPointsSnapshots(points, first.positions[0], first.positions[1] ?? first.positions[0]);
      drawnFromMs = first.timesMs[0];
      latest = { from: first.positions[0], to: first.positions[1] ?? first.positions[0] };
      planes = (['starlink', 'gps_satellite'] as const).flatMap((kind) => groupPlanes(
        sats.flatMap((sat, index) => (sat.type === kind && sat.rawTle
          ? [{ index, inclinationDeg: Number(sat.rawTle.INCLINATION), raanDeg: Number(sat.rawTle.RA_OF_ASC_NODE) }] : [])),
        PLANE_LOOK[kind].grouping,
      ).map((members) => ({ kind, members })));
      setGlobePlanesInUse(planes.length > 0);
      drawPlanes();
      turns = spreadOf(sats.flatMap((sat, index) => (sat.debrisOf && sat.rawTle ? [{
        index,
        cloud: sat.debrisOf,
        meanMotionRevPerDay: Number(sat.rawTle.MEAN_MOTION),
        eccentricity: Number(sat.rawTle.ECCENTRICITY),
        inclinationDeg: Number(sat.rawTle.INCLINATION),
      }] : [])), (cloud) => {
        const at = Date.parse(debrisCloudOf(cloud)?.breakupAt ?? '');
        return Number.isFinite(at) ? at : undefined;
      });
      registerDebrisLapse(turns.length > 0 ? { play: playLapse, stop: stopLapse } : null);
      points.onBeforeRender = chainBlend(points.onBeforeRender);
      group.add(points);
      legendFor(sats);
      meshRef.current = points;
      catalogueRef.current = sats;
      orderedIdsRef.current = sats.map((sat) => sat.id);
      recordGeometry(points);
      log.debug(`🛰️ Drew ${sats.length} satellites, propagated as a whole`);
    };

    /** The blend, each frame: how far the time drawn is from the first snapshot to the second. */
    function chainBlend(base: THREE.Object3D['onBeforeRender']): THREE.Object3D['onBeforeRender'] {
      return function blendStep(this: THREE.Object3D, ...args) {
        base.apply(this, args);
        const points = meshRef.current;
        if (!points || drawnFromMs === null) return;
        // A still is drawn for its own moment, so the same shot makes the same picture.
        const at = stilledAt() ?? Date.now();
        setScreenPointsBlend(points, (at - drawnFromMs) / STEP_MS);
      };
    }

    /**
     * When CelesTrak served the catalogue on display — never when it was read,
     * and never "now" for want of an answer. See SatelliteDataManager.
     */
    const servedAt = (): number => {
      const at = satelliteVisualizationService.getStats().lastUpdate;
      if (!at) throw new Error('the catalogue loaded with no record of when CelesTrak served it');
      return at.getTime();
    };

    /** The catalogue to the propagator, and its first two moments. */
    const propagateAfresh = async (sats: Catalogue): Promise<CatalogSnapshots> => {
      await propagator.load(sats.map((sat) => sat.rawTle as unknown as OmmRecord));
      const now = Date.now();
      return propagator.step([now, now + STEP_MS]);
    };

    const loadSatellites = async () => {
      setHealth((h) => ({ ...h, loading: true, error: null }));
      try {
        await satelliteVisualizationService.initialize();
        if (cancelled) return;
        const sats = satelliteVisualizationService.catalogue();
        /*
         * Zero satellites from a source that should return thousands is a
         * failure, not a finding. Treated as "loaded" it would be the same
         * silent empty sky this health report exists to end.
         */
        if (sats.length === 0) throw new Error('the source returned no satellites');
        const first = await propagateAfresh(sats);
        // The roles' icons for close in (OR30): baked once; without a canvas, none, and the dots stand.
        iconsRef.current = await satelliteIconAtlas().catch(() => null);
        if (cancelled) return;
        const lastLoadedAt = servedAt();
        catalogue = sats;
        buildMesh(sats, first);
        setHealth({ loading: false, error: null, lastLoadedAt });
      } catch (error) {
        if (cancelled) return;
        log.error('🛰️ Failed to load satellite data:', error);
        /*
         * ─── WHAT USED TO BE HERE ────────────────────────────────────────────
         *
         * On failure this drew a green sphere at (0, 110, 0) — directly above
         * the North Pole — with userData `{ type: 'satellite', name: 'ISS
         * (Fallback)' }`. The real ISS orbits at 51.6° inclination and never
         * passes over the pole. From 2026-04-12, when CelesTrak's certificate
         * expired and every load failed, anyone with this layer on was shown
         * an invented ISS in a physically impossible position. A layer whose data
         * failed draws nothing and says why; the card states that the source did
         * not load, and why.
         */
        clearGroup();
        setHealth((h) => ({ ...h, loading: false, error: error instanceof Error ? error.message : String(error) }));
      }
    };

    /*
     * Each step: once the GPU is halfway from the first snapshot to the second, the next pair is asked for, from
     * where the second ends; it is put on the GPU as the second is reached. So the marks never wait on the worker,
     * and nothing per satellite runs on the page's thread.
     */
    const stepPositions = () => {
      const points = meshRef.current;
      if (!points || drawnFromMs === null) return;
      const now = Date.now();
      if (queued && now >= queued.timesMs[0]) {
        setScreenPointsSnapshots(points, queued.positions[0], queued.positions[1] ?? queued.positions[0]);
        drawnFromMs = queued.timesMs[0];
        latest = { from: queued.positions[0], to: queued.positions[1] ?? queued.positions[0] };
        heights = queued.heights;
        queued = null;
      }
      // Fallen far behind (the tab was hidden): start again from now.
      const behind = now - drawnFromMs > 3 * STEP_MS;
      if (!asking && !queued && (behind || now - drawnFromMs >= STEP_MS / 2)) {
        asking = true;
        const from = behind ? now : drawnFromMs + STEP_MS;
        propagator.step([from, from + STEP_MS])
          .then((next) => { if (!cancelled) queued = next; })
          .catch((error) => log.warn('A propagation step failed:', error))
          .finally(() => { asking = false; });
      }
    };

    // Rare: when CelesTrak's two hours are up, the catalogue again, and the propagator with it if it changed.
    const checkSelectionRefresh = async () => {
      if (!satelliteVisualizationService.isRefreshDue()) return;
      try {
        await satelliteVisualizationService.getSatelliteData();
        if (cancelled) return;
        const sats = satelliteVisualizationService.catalogue();
        /*
         * The same bar as the first load. Zero satellites is not a recovery —
         * after a failed first load this is the path that clears the error, and
         * clearing it with nothing to draw would caption an empty sky as loaded.
         */
        if (sats.length === 0) throw new Error('the source returned no satellites');
        const lastLoadedAt = servedAt();
        const sameSet = sats.length === catalogue.length && sats.every((sat, i) => sat.id === catalogue[i].id);
        if (!sameSet || !meshRef.current) {
          const first = await propagateAfresh(sats);
          if (cancelled) return;
          catalogue = sats;
          queued = null;
          buildMesh(sats, first);
        }
        setHealth((h) => ({ ...h, error: null, lastLoadedAt }));
      } catch (error) {
        log.warn('🛰️ Selection refresh check failed:', error);
        /*
         * A failed REFRESH is not a failed source: the last good satellites are
         * still drawn. Setting `error` would caption them "nothing from it
         * appears here", which is false. lastLoadedAt stays where it was, so an
         * aging dataset surfaces as staleness instead — unless there are none,
         * when this is a retry and its reason is the current one.
         */
        if (cancelled || meshRef.current) return;
        setHealth((h) => ({ ...h, error: error instanceof Error ? error.message : String(error) }));
      }
    };

    // A restyle, in place: the same marks, moving as they were (screenPoints.ts keeps the blend through it).
    restyleRef.current = () => {
      if (cancelled || !meshRef.current) return;
      setScreenPointsStyle(meshRef.current, styleRef.current);
      legendFor(catalogue);
    };
    // The governor's step gave the rings up or gave them back: drawn or cleared now, and the key with them.
    redrawRingsRef.current = () => {
      if (cancelled || !meshRef.current) return;
      drawPlanes();
      legendFor(catalogue);
    };

    /*
     * The lapse: the live marks and rings put aside, the debris turned back to the first breakup and played forward
     * to the moment the live marks stood at, then today held a moment and the live view given back.
     */
    function stopLapse() {
      if (!lapse) return;
      group.remove(lapse.run.points);
      lapse.run.dispose();
      lapse = null;
      if (meshRef.current) meshRef.current.visible = true;
      planesGroup.visible = true;
      setDebrisLapseAt(null);
      if (!cancelled && meshRef.current) legendFor(catalogue);
    }
    function playLapse() {
      if (cancelled || lapse || !latest || drawnFromMs === null || !meshRef.current) return;
      const run = buildDebrisLapse(turns, latest.from, drawnFromMs, styleRef.current);
      if (!run) return;
      group.add(run.points);
      meshRef.current.visible = false;
      planesGroup.visible = false;
      lapse = { run, startedAt: performance.now(), atMs: run.startMs, month: formatUtcMonth(run.startMs) };
      setDebrisLapseAt(run.startMs);
      legendFor(catalogue);
    }
    const stepLapse = (now: number) => {
      if (!lapse) return;
      const elapsed = now - lapse.startedAt;
      if (elapsed > LAPSE_PLAY_MS + LAPSE_HOLD_MS) { stopLapse(); return; }
      lapse.atMs = lapse.run.at(elapsed / LAPSE_PLAY_MS);
      // The key says the month, published again only when it changes; the store is told the day, which it keeps
      // from repeating, so the control is not drawn again every frame.
      const month = formatUtcMonth(lapse.atMs);
      if (month !== lapse.month) {
        lapse.month = month;
        legendFor(catalogue);
      }
      setDebrisLapseAt(Math.floor(lapse.atMs / DAY_MS) * DAY_MS);
    };

    const tick = () => {
      if (!cancelled && isLayerActive('Satellites') && !(typeof document !== 'undefined' && document.hidden)) {
        const now = performance.now();
        if (now - lastPositionUpdateTimeRef.current >= POSITION_CHECK_MS) {
          lastPositionUpdateTimeRef.current = now;
          stepPositions();
        }
        stepLapse(now);
        if (now - lastPlanesTimeRef.current >= PLANES_REDRAW_MS) {
          lastPlanesTimeRef.current = now;
          drawPlanes();
        }
        if (now - lastSelectionCheckTimeRef.current >= SELECTION_CHECK_MS) {
          lastSelectionCheckTimeRef.current = now;
          checkSelectionRefresh();
        }
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    if (isLayerActive('Satellites')) {
      log.debug('🛰️ SATELLITES MODE ACTIVATED');
      if (!scene.children.includes(group)) {
        scene.add(group);
      }
      loadSatellites();
      animationFrameRef.current = requestAnimationFrame(tick);
    } else {
      teardown();
    }

    return () => {
      cancelled = true;
      stopLapse();
      registerDebrisLapse(null);
      propagator.dispose();
      clearPlanes();
      scene.remove(planesGroup);
      setGlobePlanesInUse(false);
      restyleRef.current = null;
      redrawRingsRef.current = null;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      teardown();
    };
  }, [globeRef, isLayerActive]);

  // Keyed on the resolved style, a string: the same choices in a new object do
  // not re-run this, and a changed choice restyles without touching the load.
  useEffect(() => { restyleRef.current?.(); }, [style]);
  useEffect(() => { redrawRingsRef.current?.(); }, [planeRings]);

  // The chosen satellite's orbit, ground track and footprint (D-GV GV2), while its note is open.
  useEffect(() => {
    const scene = (globeRef.current as unknown as { scene?: () => THREE.Scene } | undefined)?.scene?.();
    if (!scene) return;
    // The orbit in space, in the scene's frame as the satellites are; the ground lines on the surface, riding the
    // territories' shell as every surface line does, in the globe mesh's frame (see useGlobeRegionMarks).
    const space = new THREE.Group();
    space.userData = { type: SATELLITE_ORBIT_TYPE };
    const ground = ridesShell(new THREE.Group());
    ground.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    ground.userData = { type: SATELLITE_GROUND_TYPE };
    scene.add(space, ground);
    let chosen: { id: string; satrec: SatRec; color: number } | null = null;

    const clear = () => {
      for (const group of [space, ground]) {
        for (const child of [...group.children]) {
          group.remove(child);
          child.traverse((part) => {
            const line = part as THREE.Mesh;
            if (!line.geometry) return;
            line.geometry.dispose();
            (line.material as THREE.Material).dispose();
          });
        }
      }
    };
    const draw = () => {
      clear();
      if (!chosen || !isLayerActive('Satellites')) return;
      const track = satelliteTrack(chosen.satrec, stilledAt() ?? Date.now());
      if (!track) return;
      const orbit = buildLineBatch(
        [{ id: `orbit:${chosen.id}`, positions: track.orbit, color: chosen.color }],
        { opacity: 0.85, linewidth: 1.5, dashed: false, dashSize: 1, gapSize: 0, dashScale: 1, renderOrder: SCREEN_POINTS_RENDER_ORDER - 1 },
      );
      if (orbit) space.add(orbit);
      ground.add(GeometryFactory.buildBorderLines(
        [{ id: `track:${chosen.id}`, coordinates: track.groundTrack }],
        { elevation: GROUND_LINE_ELEVATION, color: chosen.color, opacity: 0.45, linewidth: 1.25 },
      ));
      ground.add(GeometryFactory.buildBorderLines(
        [{ id: `footprint:${chosen.id}`, coordinates: track.footprint }],
        { elevation: GROUND_LINE_ELEVATION, color: chosen.color, opacity: 0.7, linewidth: 1.5 },
      ));
    };
    const onNotes = () => {
      const { open, index } = getGlobeNoteState();
      const id = open?.heading === 'Satellites' ? open.notes[index]?.id ?? null : null;
      if (id === (chosen?.id ?? null)) return;
      const sat = id ? catalogueRef.current.find((s2) => s2.id === id) : undefined;
      let satrec: SatRec | null = null;
      try { satrec = sat?.rawTle ? json2satrec(sat.rawTle as unknown as OmmRecord) : null; } catch { satrec = null; }
      // In the app's cyan, which means chosen (tokens.ts): a quiet grey satellite's lines would barely show.
      chosen = sat && satrec && !satrec.error ? { id: sat.id, satrec, color: CHOSEN_LINE_COLOR } : null;
      draw();
    };
    const stop = subscribeGlobeNotes(onNotes);
    onNotes();
    const timer = setInterval(() => { if (chosen) draw(); }, TRACK_REDRAW_MS);
    return () => {
      stop();
      clearInterval(timer);
      clear();
      scene.remove(space, ground);
    };
  }, [globeRef, isLayerActive]);

  return { groupRef, ...health };
}
