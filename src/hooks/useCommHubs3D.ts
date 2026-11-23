// src/hooks/useCommHubs3D.ts
// Hook for managing CommHubs 3D visualization on the Globe — real submarine cable
// infrastructure. Replaces useGlobeCommHubs.ts's empty placeholder entirely.
// Follows the single-file convention established by useCyberAttacks3D.ts (state +
// rendering + effects together) rather than splitting into separate hook files — this
// codebase's real house style, not a generic pattern to extract from.

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type React from 'react';
import * as THREE from 'three';
import { getSubmarineCableData } from '../services/comm-hubs/SubmarineCableService';
import { latLngToGlobeWorld } from '../utils/globeCoordinates';
// Cables sat at 1.001 and their landing points at 1.002 — under the base map, which is
// why a cable crossing land was invisible. See globeAltitudes.ts.
import { SURFACE_LINES, SURFACE_MARKS } from '../components/Globe/globeAltitudes';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { buildScreenPoints, drawAboveSurfaceLayers, markPxForCount } from '../components/Globe/screenPoints';
import { resolveMarkerStyle, type MarkerStyleChoices } from '../components/Globe/markerStyles';
import { publishLegend, cssColorOf, type LegendSwatch } from '../services/globe/globeLegendStore';
import {
  analyzeCountryConnectivity,
  buildLandingPointCountryMap,
  identifyChokepointCables,
  type CountryConnectivity,
  type CableChokepointMatch
} from '../utils/commHubsConnectivity';
import { isCableActiveByYear } from '../utils/commHubsTemporal';
import { usePopup } from '../components/Popup/PopupManager';
import { CommHubDetailPopup } from '../components/ui/CommHubDetailPopup/CommHubDetailPopup';
import type { CommHubPickResult, LandingPoint, SubmarineCable, SubmarineCableData } from '../types/CommHubs';
import { createLogger } from '@utils/logger';
import { isGlobeClick, pressOn, type PointerAt } from '../components/Globe/globeClick';
import { ridesShell } from '../globe-engine/shellLift';
const log = createLogger({ prefix: 'useCommHubs3D' });

// Pure pick-priority resolution: landing points win over cables at the same pixel (they
// genuinely overlap, since landing points sit at cable endpoints), regardless of which
// hit is nearer to the camera. Exported and kept pure/DOM-free specifically so it has a
// direct unit test — real pointer-event + camera raycasting through jsdom can't
// meaningfully be simulated (no precedent for it anywhere else in this codebase either).
/**
 * Returns the INTERSECTION, not just the object it hit.
 *
 * Every landing point is one point of a single THREE.Points now, so which one was hit
 * is the intersection's `index` — returning the object alone would identify the layer
 * and lose the mark.
 */
export function resolveCommHubHit(
  landingPointIntersects: THREE.Intersection[],
  cableIntersects: THREE.Intersection[]
): THREE.Intersection | null {
  if (landingPointIntersects.length > 0) return landingPointIntersects[0];
  if (cableIntersects.length > 0) return cableIntersects[0];
  return null;
}

// The pick radius for a mark of a size in pixels, shared with Diplomacy's places: pickRadius.ts.
import { pickRadiusUnits } from '../components/Globe/pickRadius';
import { registerLayerRoot } from '../globe-engine/compareLayers';
export { pickRadiusUnits };

/**
 * Which landing point a raycast hit, from the intersection's index into the mark set.
 *
 * Pure and tested for the same reason as resolveCommHubHit: this is the step where an
 * off-by-one silently opens a popup about the wrong place — a whole different country's
 * cable dependency — and nothing would fail. Returns null rather than guessing.
 */
export function landingPointAtIndex(object: THREE.Object3D, index: number | undefined): LandingPoint | null {
  const drawn = object.userData.landingPoints as Array<{ point: LandingPoint }> | undefined;
  if (!drawn || index === undefined) return null;
  return drawn[index]?.point ?? null;
}

// Pure throttle check for hover raycasting — same "extract it so it has a real test"
// reasoning as resolveCommHubHit above. Decouples the expensive two-pass raycast from
// raw pointermove event rate (which can exceed 60Hz on high-poll-rate input devices).
export function shouldThrottleHoverRaycast(now: number, lastRaycastTime: number, throttleMs: number): boolean {
  return now - lastRaycastTime < throttleMs;
}

// THREE.Group.clear() only detaches children — it never releases their GPU-side
// geometry/material buffers. Same real leak class fixed for useCyberAttacks3D.ts and
// useCyberThreats3D.ts before it.
function disposeGroupChildren(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0] as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    group.remove(child);
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
    else child.material?.dispose?.();
  }
}

// One sub-mode, independently-toggled real layers — same shape as ConflictZones'
// layerTypes and CyberThreats' layerTypes before it.
export interface CommHubsLayerTypes {
  cables: boolean;
  landingPoints: boolean;
  // Derived signal, not new fetched data — off by default like CyberThreats' density/
  // enrichment/knownGroups layers, since it's an analytical overlay on content that's
  // already shown, not this sub-mode's first content (unlike cables/landingPoints).
  connectivity: boolean;
}

const DEFAULT_LAYER_TYPES: CommHubsLayerTypes = {
  cables: true,
  landingPoints: true,
  connectivity: false
};

// Colorblind-safe: default landing point cyan vs. a distinguishable amber/orange for a
// real single-cable-dependency warning (not a red/green pairing).
/**
 * Cable widths in CSS pixels, and the pick slop added to them.
 *
 * 1.6 px reads as a line rather than a hairline at the card's scale without turning a
 * dense region like the North Atlantic into a solid mat; a planned cable is thinner as
 * well as dashed, so status survives being seen small.
 */
const CABLE_ACTIVE_PX = 1.6;
const CABLE_PLANNED_PX = 1.2;
const CABLE_PICK_SLOP_PX = 6;

/** A landing point's mark: pixels, by how many cables really converge there. */
const LANDING_POINT_FLOOR_PX = 7;
const LANDING_POINT_CAP_PX = 16;

const LANDING_POINT_COLOR = 0x00c2ff;
const LANDING_POINT_TBD_COLOR = 0x888888;
const LANDING_POINT_SINGLE_DEPENDENCY_COLOR = 0xffa630;
const CABLE_FALLBACK_COLOR = '#888888';
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const HOVER_RAYCAST_THROTTLE_MS = 16; // ~60fps ceiling on hover raycast frequency

// SubmarineCableService.ts only checks the source's color field is a string, not that
// it's a valid CSS hex color — an unrecognized string silently defaults THREE.Color to
// white and logs a console warning on every rebuild. Validate here, at the one place that
// actually hands it to THREE.js, rather than teaching the parser CSS color syntax.
function safeCableColor(color: string): THREE.Color {
  return new THREE.Color(HEX_COLOR_PATTERN.test(color) ? color : CABLE_FALLBACK_COLOR);
}

interface UseCommHubs3DOptions {
  globeRadius?: number;
  debugMode?: boolean;
  layerTypes?: CommHubsLayerTypes;
  // Real planned-vs-active status is always rendered honestly (dashed vs. solid, see
  // createCableLines); this only controls whether planned cables are shown at all.
  showPlannedCables?: boolean;
  // Historical cable-growth playback (Phase F): when set (the TimeScrubber is not live —
  // see useTemporalStateOptional()), only real cables with a known rfsYear <= this year
  // are shown. null/undefined means "live" — show everything, no temporal filter.
  historicalYearCutoff?: number | null;
  // The canvas the globe draws into, which picks are measured against. The first canvas
  // on the page is TinyGlobe's inset, not the globe's; see useNationalTerritories3D.
  getCanvas?: () => HTMLCanvasElement | null;
  /**
   * How the landing points are drawn — the person's choice for this layer
   * (decision D-F, step 6.3).
   *
   * The LANDING POINTS only. The cables are lines, and dashed already means
   * provisional on them (materialTheme.ts), so a mark style has nothing to say
   * about a cable.
   */
  markerStyles?: MarkerStyleChoices;
}

interface CommHubs3DState {
  data: SubmarineCableData | null;
  hubsGroup: THREE.Group;
  isLoading: boolean;
  error: string | null;
}

export const useCommHubs3D = (
  isActive: boolean,
  scene: THREE.Scene | null,
  camera: THREE.Camera | null,
  options: UseCommHubs3DOptions = {}
) => {
  const {
    globeRadius = 100,
    debugMode = false,
    layerTypes = DEFAULT_LAYER_TYPES,
    showPlannedCables = true,
    historicalYearCutoff: rawHistoricalYearCutoff = null,
    markerStyles
  } = options;

  /*
   * Keyed on CONTENT, not identity. Globe.tsx hands this the whole choices map,
   * which is a new object whenever the settings are re-read — a memo keyed on
   * the object itself would rebuild every landing-point mark for nothing.
   */
  const markerStyleKey = JSON.stringify(markerStyles ?? null);
  const getCanvasRef = useRef(options.getCanvas);
  getCanvasRef.current = options.getCanvas;
  // A non-finite cutoff (e.g. new Date(NaN).getFullYear() from a corrupted
  // TemporalContext.currentTime) would otherwise make isCableActiveByYear's `<= year`
  // comparison false for every real cable — NaN comparisons are always false — silently
  // hiding the entire cable layer with no error, rather than falling back to "live."
  // Validated once here so every consumer below (the render effect, the dependency
  // array) sees an already-safe value instead of re-deriving this check.
  const historicalYearCutoff = rawHistoricalYearCutoff !== null && Number.isFinite(rawHistoricalYearCutoff)
    ? rawHistoricalYearCutoff
    : null;

  const [state, setState] = useState<CommHubs3DState>({
    data: null,
    // Above the country fills, which drew over every cable and landing point this
    // group held while it sat at group order 0 (see screenPoints.ts).
    hubsGroup: ridesShell(drawAboveSurfaceLayers(new THREE.Group())),
    isLoading: false,
    error: null
  });


  const latLngToVector3 = useCallback((lat: number, lng: number, radius: number): THREE.Vector3 => {
    return latLngToGlobeWorld(lat, lng, radius);
  }, []);

  // Real per-landing-point convergence count — how many real cables land at each point.
  // Cheap to derive from data already fetched, same "aggregate what you have, don't fetch
  // more" trick used for CyberThreats' density layer.
  const cableCountByLandingPoint = useMemo(() => {
    const counts = new Map<string, number>();
    if (!state.data) return counts;
    for (const cable of state.data.cables) {
      for (const lp of cable.landingPoints) {
        counts.set(lp.id, (counts.get(lp.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [state.data]);

  // Real per-country redundancy signal (see commHubsConnectivity.ts's header for the
  // honest "at least this many, from what's known in this dataset" caveat). Only computed
  // when the connectivity layer is actually on — no reason to pay for it otherwise.
  const connectivity = useMemo<CountryConnectivity[]>(() => {
    if (!state.data || !layerTypes.connectivity) return [];
    return analyzeCountryConnectivity(state.data.cables);
  }, [state.data, layerTypes.connectivity]);

  const singleDependencyCountries = useMemo(() => {
    return new Set(connectivity.filter((c) => c.isSingleCableDependency).map((c) => c.country));
  }, [connectivity]);

  // Not gated behind layerTypes.connectivity — also used by click/hover detail (Phase D)
  // to show a real landing point's country regardless of whether the connectivity
  // overlay itself is toggled on. Cheap: one pass over already-fetched real data.
  const landingPointCountryMap = useMemo(() => {
    if (!state.data) return new Map<string, string>();
    return buildLandingPointCountryMap(state.data.cables);
  }, [state.data]);

  // Real per-landing-point list of connected real cables (id + name), for the click
  // detail popup. Precomputed once per dataset rather than re-scanned on every hover.
  const connectedCablesByLandingPoint = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    if (!state.data) return map;
    for (const cable of state.data.cables) {
      for (const lp of cable.landingPoints) {
        const existing = map.get(lp.id);
        const entry = { id: cable.id, name: cable.name };
        if (existing) existing.push(entry);
        else map.set(lp.id, [entry]);
      }
    }
    return map;
  }, [state.data]);

  // Real chokepoint-corridor matches — exposed for Phase D's detail popup, not yet given
  // its own dedicated visual encoding (see commHubsConnectivity.ts's disclosed-heuristic
  // caveat on CHOKEPOINTS' bounding boxes).
  const chokepointCables = useMemo<CableChokepointMatch[]>(() => {
    if (!state.data) return [];
    return identifyChokepointCables(state.data.cables);
  }, [state.data]);

  // Real cable path rendering: one THREE.Line per real path segment (a cable can have more
  // than one, e.g. branching routes), colored with the source's own real per-cable color
  // (there's no "severity" concept for a cable's mere existence, unlike CyberThreats — the
  // source's own real color already distinguishes cables from each other). Dashed for
  // cables not yet confirmed active (see SubmarineCableService.ts's isPlanned derivation),
  // solid for active — an honest status signal, not decorative.
  const createCableLines = useCallback((cable: SubmarineCable): Line2[] => {
    return cable.paths.map((path) => {
      const positions: number[] = [];
      path.forEach(([lng, lat]) => {
        const v = latLngToVector3(lat, lng, globeRadius * SURFACE_LINES);
        positions.push(v.x, v.y, v.z);
      });
      const geometry = new LineGeometry();
      geometry.setPositions(positions);
      const color = safeCableColor(cable.color);

      /*
       * Line2, not THREE.Line: WebGL's native line width is fixed at one DEVICE pixel
       * on every platform this runs on, so every cable in the network drew as a
       * hairline — half a CSS pixel on a 2x screen, and less again on a share card
       * rendered at twice the size and then shown small. LineMaterial's linewidth is
       * in pixels and is honoured. Same pipeline as the borders (fatBorderLines.ts),
       * including its resolution note: LineSegments2 keeps the uniform current itself.
       */
      const material = new LineMaterial({
        color,
        transparent: true,
        opacity: cable.isPlanned ? 0.6 : 0.85,
        linewidth: cable.isPlanned ? CABLE_PLANNED_PX : CABLE_ACTIVE_PX,
        // Dashed for a cable not yet confirmed active (SubmarineCableService's
        // isPlanned) — an honest status signal, not decoration. Native to this
        // material, where LineDashedMaterial needed computeLineDistances.
        dashed: cable.isPlanned,
        dashSize: 2,
        gapSize: 1.4,
      });
      const line = new Line2(geometry, material);
      line.computeLineDistances();

      line.userData = { cable, type: 'commHubCable' };
      return line;
    });
  }, [latLngToVector3, globeRadius]);

  // Real landing-point marker: sized by real cable-count converging there (log-scaled,
  // same technique as CyberThreats' cluster markers) — a point with 5 real cables reads as
  // more significant than one with a single real cable, honestly. When the connectivity
  // layer is on, a point in a real single-cable-dependency country (per this dataset) is
  // recolored amber as an honest redundancy warning.
  const createLandingPointMarks = useCallback((points: readonly LandingPoint[]): THREE.Points | null => {
    if (points.length === 0) return null;
    /*
     * These were spheres of 0.015 to 0.05 SCENE units on a 100-unit Earth. At the
     * share-card view that is an eighth of a pixel: the whole landing-point network,
     * 1,413 of them, drew nothing a person could see, and the cable-count sizing that
     * was the point of the layer could not be read at any zoom.
     *
     * One set of screen-space marks instead, sized in pixels by the same real count.
     */
    const drawn = points.map((point) => {
      // 0, not 1: a point with no real per-cable reference in this dataset (a real,
      // fairly common gap — see connectedCablesByLandingPoint below) has zero *known*
      // connections, not "assume at least one." Matches buildLandingPointPick's own
      // default for the exact same point, so the size shown here and the count the
      // click popup reports for it never disagree.
      const count = cableCountByLandingPoint.get(point.id) ?? 0;
      const country = landingPointCountryMap.get(point.id);
      const isSingleDependency = layerTypes.connectivity && country !== undefined && singleDependencyCountries.has(country);
      return { point, count, country, isSingleDependency };
    });

    const marks = buildScreenPoints(drawn.map((d) => ({
      position: latLngToVector3(d.point.latitude, d.point.longitude, globeRadius * SURFACE_MARKS),
      sizePx: markPxForCount(d.count, LANDING_POINT_FLOOR_PX, LANDING_POINT_CAP_PX),
      color: d.point.isTbd ? LANDING_POINT_TBD_COLOR
        : (d.isSingleDependency ? LANDING_POINT_SINGLE_DEPENDENCY_COLOR : LANDING_POINT_COLOR),
      tooltip: `${d.point.name} — ${d.count} cable${d.count === 1 ? '' : 's'}`
        + (d.point.isTbd ? ' · location not confirmed' : '')
        + (d.isSingleDependency ? ' · its country depends on a single cable' : ''),
    })), {
      rim: 'dark',
      opacity: 0.9,
      style: resolveMarkerStyle(markerStyles, 'CommHubs'),
      userData: {
        type: 'commHubLandingPoint',
        layer: 'Comm Hubs',
        // In draw order, so a raycast's `index` names the point it hit.
        landingPoints: drawn,
      },
    });
    return marks;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markerStyles is keyed by content below
  }, [latLngToVector3, globeRadius, cableCountByLandingPoint, landingPointCountryMap, singleDependencyCountries, layerTypes.connectivity, markerStyleKey]);

  // Click-to-detail: no generic parameterized raycast utility exists in this codebase
  // (7 files each independently instantiate THREE.Raycaster, none reusable — see
  // useNationalTerritories3D.ts's hardcoded precedent), so this is folded directly into
  // this hook rather than split into its own file that nothing else would import.
  const cameraRef = useRef<THREE.Camera | null>(null);
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const pointerVecRef = useRef<THREE.Vector2 | null>(null);
  const lastHoverRaycastRef = useRef(0);

  const { showPopup, hidePopup } = usePopup();
  const activePopupIdRef = useRef<string | null>(null);
  // Same stale-closure guard as useCountryInfoOverlay.ts: PopupManager's showPopup is
  // recreated on every popups.size change, so reading it through a ref instead of an
  // effect dependency avoids re-running pointer-listener setup every time ANY popup
  // anywhere opens or closes.
  const popupActionsRef = useRef({ showPopup, hidePopup });
  useEffect(() => {
    popupActionsRef.current = { showPopup, hidePopup };
  });

  const [hoveredItem, setHoveredItem] = useState<CommHubPickResult | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const buildLandingPointPick = useCallback((point: LandingPoint): CommHubPickResult => ({
    type: 'landingPoint',
    point,
    cableCount: cableCountByLandingPoint.get(point.id) ?? 0,
    country: landingPointCountryMap.get(point.id),
    connectedCables: connectedCablesByLandingPoint.get(point.id) ?? []
  }), [cableCountByLandingPoint, landingPointCountryMap, connectedCablesByLandingPoint]);

  // Real cable/landing-point picking at a screen coordinate. Landing points win over
  // cables at the same pixel (a genuinely likely overlap, not an edge case, since landing
  // points sit at cable endpoints) via two separate intersectObjects passes rather than
  // one mixed pass.
  const pickAt = useCallback((clientX: number, clientY: number): CommHubPickResult | null => {
    const cam = cameraRef.current;
    if (!cam) return null;
    const canvasEl = getCanvasRef.current?.() ?? (document.querySelector('canvas') as HTMLElement | null);
    if (!canvasEl) return null;
    const rect = canvasEl.getBoundingClientRect();
    // A zero-size rect (canvas mid-layout, display:none, or a transient resize) would
    // otherwise divide by zero below, producing an Infinity/NaN NDC coordinate — not a
    // crash (intersectObjects just finds nothing against a NaN ray), but worth a clear,
    // intentional no-op instead of doing pointless raycasting work against garbage input.
    if (rect.width === 0 || rect.height === 0) return null;

    if (!raycasterRef.current) raycasterRef.current = new THREE.Raycaster();
    if (!pointerVecRef.current) pointerVecRef.current = new THREE.Vector2();
    const raycaster = raycasterRef.current;
    const pointer = pointerVecRef.current;

    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    // THREE's default Line pick threshold (1 world unit) isn't scaled to this scene —
    // at the established globeRadius = 100 convention, thin cable lines are unreliably
    // clickable without widening it relative to the globe's real scale.
    raycaster.params.Line = { threshold: globeRadius * 0.015 };
    /*
     * Line2 reads its own parameter and adds the threshold to the material's PIXEL
     * width (LineSegments2.raycast), so this one is in pixels, not world units — a
     * world-unit value here would make every cable clickable from a continent away.
     */
    raycaster.params.Line2 = { threshold: CABLE_PICK_SLOP_PX };
    /*
     * And the marks are points: a THREE.Points hit otherwise needs the ray to pass
     * through the vertex itself, which no pointer ever does. The radius follows what is
     * DRAWN — the largest mark's on-screen radius, converted at this camera — so
     * clicking the dot a person can see picks it at any zoom.
     */
    raycaster.params.Points = {
      threshold: pickRadiusUnits(cam, rect.height, LANDING_POINT_CAP_PX / 2),
    };
    raycaster.setFromCamera(pointer, cam);

    const landingPointObjects = state.hubsGroup.children.filter((c) => c.userData.type === 'commHubLandingPoint');
    const cableObjects = state.hubsGroup.children.filter((c) => c.userData.type === 'commHubCable');
    const landingIntersects = raycaster.intersectObjects(landingPointObjects, false);
    const cableIntersects = raycaster.intersectObjects(cableObjects, false);

    const hit = resolveCommHubHit(landingIntersects, cableIntersects);
    if (!hit) return null;

    if (hit.object.userData.type === 'commHubLandingPoint') {
      const point = landingPointAtIndex(hit.object, hit.index);
      return point ? buildLandingPointPick(point) : null;
    }
    return { type: 'cable', cable: hit.object.userData.cable as SubmarineCable };
  }, [globeRadius, state.hubsGroup, buildLandingPointPick]);

  useEffect(() => {
    if (!isActive) {
      setHoveredItem(null);
      return;
    }

    function onPointerMove(e: PointerEvent) {
      setMousePosition({ x: e.clientX, y: e.clientY });
      // Throttled to roughly one raycast per animation frame, not one per raw pointer
      // event — decoupled the same way useNationalTerritories3D.ts's own hover raycast
      // runs off a requestAnimationFrame loop rather than the raw pointermove rate,
      // which can exceed 60Hz on high-poll-rate input devices. Each raycast here runs
      // two full intersectObjects passes over every real cable/landing-point object
      // (2,000+ at full dataset size); the tooltip's cursor-following position still
      // updates on every event above, so throttling only the expensive part is invisible
      // to the user.
      const now = performance.now();
      if (shouldThrottleHoverRaycast(now, lastHoverRaycastRef.current, HOVER_RAYCAST_THROTTLE_MS)) return;
      lastHoverRaycastRef.current = now;
      setHoveredItem(pickAt(e.clientX, e.clientY));
    }

    // A press that starts on the globe itself, kept until the pointer comes back up.
    let pressedAt: PointerAt | null = null;

    function onPointerDown(e: PointerEvent) {
      const canvas = getCanvasRef.current?.() ?? document.querySelector('canvas');
      pressedAt = pressOn(e, canvas);
    }

    function onPointerUp(e: PointerEvent) {
      const press = pressedAt;
      pressedAt = null;
      // Only a click on the globe itself picks; see globeClick.ts for both rules.
      const canvas = getCanvasRef.current?.() ?? document.querySelector('canvas');
      if (e.target !== canvas || !isGlobeClick(press, { x: e.clientX, y: e.clientY })) return;
      const pick = pickAt(e.clientX, e.clientY);
      const { showPopup: show, hidePopup: hide } = popupActionsRef.current;

      if (activePopupIdRef.current) {
        hide(activePopupIdRef.current);
        activePopupIdRef.current = null;
      }

      if (pick) {
        activePopupIdRef.current = show({
          component: CommHubDetailPopup as unknown as React.ComponentType<{ onClose: () => void; [key: string]: unknown }>,
          props: { item: pick },
          // The frame is the dialog, so it carries the accessible name.
          label: `${pick.type === 'cable' ? pick.cable.name : pick.point.name} details`,
          backdrop: true,
          zIndex: 4000,
          onClose: () => {
            activePopupIdRef.current = null;
          }
        });
      }
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isActive, pickAt]);

  // Close any open detail popup if this hook unmounts or the layer deactivates while one
  // is still open, rather than leaving it orphaned (same as useCountryInfoOverlay.ts).
  useEffect(() => {
    if (!isActive && activePopupIdRef.current) {
      popupActionsRef.current.hidePopup(activePopupIdRef.current);
      activePopupIdRef.current = null;
    }
  }, [isActive]);

  useEffect(() => {
    return () => {
      if (activePopupIdRef.current) popupActionsRef.current.hidePopup(activePopupIdRef.current);
    };
  }, []);

  // Add hubs group to scene
  useEffect(() => {
    if (!scene || !isActive) return;
    const hubsGroup = state.hubsGroup;
    scene.add(hubsGroup);
    // Its objects, for a comparison side by side (D-CM, CM1).
    const unnameForCompare = registerLayerRoot('CommHubs', hubsGroup);
    return () => {
      unnameForCompare();
      scene.remove(hubsGroup);
      disposeGroupChildren(hubsGroup);
      // The key goes with the marks it describes.
      publishLegend('CommHubs', null);
    };
  }, [scene, isActive, state.hubsGroup]);

  // Fetch real submarine cable data once per activation. Deliberately NOT re-polled on an
  // interval the way useCyberAttacks3D.ts is — this dataset has a real 7-day cache TTL at
  // the service level; nothing meaningfully changes within one browsing session. Also
  // deliberately not gated behind layerTypes — see SubmarineCableService.ts's own header:
  // fetching eagerly means real status data is ready by the time a user opens either layer,
  // not racing a fetch against first render.
  useEffect(() => {
    if (!isActive || state.data) return;
    /*
     * Cancelled-flag convention as in useCyberAttacks3D: a run that is cleaned up must not
     * write state it no longer owns.
     *
     * There is deliberately NO "already fetching" ref here any more. One sat in the guard
     * above, and together with this flag it stranded the layer: when the effect was cleaned
     * up mid-fetch, the original run was cancelled (so it never applied its result), while
     * the re-run saw the ref still true and returned without starting anything. Nothing
     * ran the effect again after the fetch settled, so the layer stayed empty until a
     * reload. React.StrictMode (main.tsx) mounts, cleans up and remounts every effect in
     * development, so that was EVERY dev load — measured: the full dataset fetched and
     * cached within 35 s, and not one cable drawn after two minutes. In production it
     * takes turning the layer off and on again during the ~30 s fetch.
     *
     * The ref was never needed to avoid duplicate downloads: getSubmarineCableData shares
     * one module-level in-flight promise, so a re-run simply joins the same request.
     */
    let cancelled = false;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    getSubmarineCableData()
      .then((data) => {
        if (cancelled) return;
        if (debugMode) log.debug(`📡 CommHubs3D: Loaded ${data.cables.length} real cables, ${data.landingPoints.length} real landing points`);
        setState((prev) => ({ ...prev, data, isLoading: false }));
      })
      .catch((error) => {
        if (cancelled) return;
        log.error('Error loading submarine cable data:', error);
        setState((prev) => ({ ...prev, isLoading: false, error: error instanceof Error ? error.message : 'Unknown error' }));
      });

    return () => {
      cancelled = true;
    };
  }, [isActive, state.data, debugMode]);

  // Build/rebuild the real visualization when data or active layers change. One THREE.js
  // object per real cable-path-segment/landing-point rather than merged/instanced
  // geometry — a deliberate v1 trade-off, not an oversight: ~521 cables (some
  // multi-segment) plus ~1,413 landing points can produce 2,000+ scene objects, more than
  // CyberThreats' ~50-190 country-clustered markers, but still well within what a modern
  // WebGL scene handles for static (non-per-frame-rebuilt) geometry. Revisit only if a
  // real, demonstrated frame-rate problem shows up — not before.
  useEffect(() => {
    if (!isActive || !state.data) return;

    disposeGroupChildren(state.hubsGroup);

    if (layerTypes.cables) {
      for (const cable of state.data.cables) {
        if (cable.isPlanned && !showPlannedCables) continue;
        if (historicalYearCutoff !== null && !isCableActiveByYear(cable, historicalYearCutoff)) continue;
        for (const line of createCableLines(cable)) state.hubsGroup.add(line);
      }
    }

    // Landing points are deliberately NOT filtered by historicalYearCutoff — a landing
    // point has no real per-point in-service date of its own (only cables do), and
    // deriving one from "earliest connected cable's rfsYear" would mean inferring a date
    // for coverage-gap points with zero real per-cable linkage (a real, fairly common
    // gap — see connectedCablesByLandingPoint). Scrubbing far back shows every real
    // landing point at full density alongside a sparse, historically-accurate cable set
    // — a known, disclosed trade-off (Phase F's plan text scoped this to cables only),
    // not an oversight.
    if (layerTypes.landingPoints) {
      const marks = createLandingPointMarks(state.data.landingPoints);
      if (marks) state.hubsGroup.add(marks);
    }

    /*
     * A cable's own colour comes from the source and distinguishes one cable from
     * another; it does not rank them, and the key says so rather than implying a scale
     * that is not there. What it does encode is status, and the landing-point colours
     * each carry a real claim.
     */
    const swatches: LegendSwatch[] = [];
    const drawnCables = state.hubsGroup.children.filter((c) => c.userData.type === 'commHubCable');
    /*
     * The cables get no swatch. A swatch is a dot of one colour, and a cable's colour
     * comes from the source to tell one cable from another — there is no single colour
     * that stands for "a cable", and picking one would be inventing an encoding. The
     * same goes for the dash that marks an unconfirmed cable: a dot cannot show it.
     * Both are stated in words instead.
     */
    const cableWords = drawnCables.length === 0 ? [] : [
      'a cable\'s colour identifies it, not its importance',
      ...(drawnCables.some((c) => (c.userData.cable as SubmarineCable).isPlanned)
        ? ['a dashed cable is not confirmed in service'] : []),
    ];
    const marks = state.hubsGroup.children.find((c) => c.userData.type === 'commHubLandingPoint');
    if (marks) {
      const drawn = marks.userData.landingPoints as Array<{ point: LandingPoint; isSingleDependency: boolean }>;
      swatches.push({ color: cssColorOf(LANDING_POINT_COLOR), label: 'landing point' });
      if (drawn.some((d) => d.isSingleDependency)) {
        swatches.push({ color: cssColorOf(LANDING_POINT_SINGLE_DEPENDENCY_COLOR), label: 'its country depends on one cable' });
      }
      if (drawn.some((d) => d.point.isTbd)) {
        swatches.push({ color: cssColorOf(LANDING_POINT_TBD_COLOR), label: 'location not confirmed' });
      }
    }
    publishLegend('CommHubs', (swatches.length || cableWords.length) ? {
      layerId: 'CommHubs',
      layer: 'Comm Hubs',
      sizeMeans: marks ? 'cables converging on that landing point' : undefined,
      colorMeans: cableWords.length ? cableWords.join('; ') : undefined,
      /*
       * Only when marks were drawn: this describes the landing points, and with
       * `landingPoints` toggled off the layer is cables alone, which have no
       * shape to report. The share card prints it, so an image says how its
       * marks were drawn instead of leaving a reader to guess why they are rings.
       */
      shapeMeans: marks ? resolveMarkerStyle(markerStyles, 'CommHubs') : undefined,
      swatches,
    } : null);

    if (debugMode) {
      log.debug(`📡 CommHubs3D: Rendered ${state.hubsGroup.children.length} real scene objects (cables=${layerTypes.cables}, landingPoints=${layerTypes.landingPoints})`);
    }
  }, [isActive, state.data, layerTypes.cables, layerTypes.landingPoints, layerTypes.connectivity, showPlannedCables, historicalYearCutoff, createCableLines, createLandingPointMarks, debugMode, state.hubsGroup]);

  return {
    cables: state.data?.cables ?? [],
    landingPoints: state.data?.landingPoints ?? [],
    datasetCableCount: state.data?.datasetCableCount ?? 0,
    fetchedAt: state.data?.fetchedAt ?? null,
    connectivity,
    chokepointCables,
    hubsGroup: state.hubsGroup,
    isLoading: state.isLoading,
    error: state.error,
    tooltip: {
      item: hoveredItem,
      position: mousePosition,
      visible: hoveredItem !== null
    }
  };
};
