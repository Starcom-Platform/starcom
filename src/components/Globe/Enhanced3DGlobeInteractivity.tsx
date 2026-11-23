/**
 * Enhanced3DGlobeInteractivity - UNIFIED 3D interaction for Intel Reports
 * 
 * This component provides a complete 3D interaction system for Intel Report models
 * with consolidated mouse handling to eliminate infinite loops.
 * 
 * ARCHITECTURAL CHANGE: Removed useIntel3DInteraction hook dependency and merged
 * logic directly to eliminate competing event systems.
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { IntelReportOverlayMarker } from '../../interfaces/IntelReportOverlay';
import { useGlobeRightClickInteraction } from '../../hooks/useGlobeRightClickInteraction';
import { IntelReportTooltip } from '../ui/IntelReportTooltip/IntelReportTooltip';
import { sectionOf, type ReportGroup } from './placeMenu';
import { GlobeGroupMenu, TerritoryHoverLabel } from '../ui/GlobeGroupMenu/GlobeGroupMenu';
import { modelKind } from '../../interfaces/IntelReportOverlay';
import { describeHoveredMarker } from './markerPresentation';
import { GlobeContextAction, GlobeContextActionData } from '../ui/GlobeContextMenu/GlobeContextMenu';
import { claimGlobeClicks, type GlobeClickClaim } from './globeClick';
import { useGlobePlacePick } from './Hooks/useGlobePlacePick';
import PlacePickHint from './PlacePickHint';
// Loaded on demand: it is only ever shown after the user opens it, so the globe
// need not carry it in the first-visit payload. (It also once pulled in
// @solana/web3.js; the wallet is retired, plan item 4.4.)
const OfflineIntelReportsManager = React.lazy(() =>
  import('../Intel/OfflineIntelReportsManager').then((m) => ({ default: m.OfflineIntelReportsManager }))
);
import { findPrimaryGlobeMesh, getGlobeMeshRadius, worldPointToGeoOnGlobe } from '../../utils/globeSurfaceMapping';
import { clickPrecisionM } from './clickPrecision';
import { useVisualizationOverlay } from '../../hooks/useVisualizationOverlay';
import { rlshTelemetryService } from '../../services/RLSHTelemetryService';
import { useRLSHSelectionMemory } from '../../features/globe/rlsh/useSelectionMemory';
import { useModelScreenProjection } from '../../features/globe/rendering/useModelScreenProjection';
import { useCursorTrail3D } from '../../features/globe/rendering/useCursorTrail3D';
import { useFloatingPanels } from '../HUD/FloatingPanels/FloatingPanelContext';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import { globeContextDestination } from './globeContextDestinations';
import { hudSuccess, hudInfo, hudWarning, hudError } from '../../utils/hudNotifications';
import { haversineDistanceKm, estimateUtcOffsetHours } from '../../utils/geoDistance';
import { globeBookmarkService } from '../../services/globe/GlobeBookmarkService';
import { intelReportVisualizationService } from '../../services/IntelReportVisualizationService';
import { getIntelReportPriority } from '../../utils/intelReportPriority';
import { createLogger } from '@utils/logger';
import { groundUnderShell } from '../../globe-engine/shellLift';
import { useIntelRlshPopupFlow } from '../../features/globe/interaction/useIntelRlshPopupFlow';
import { usePointerClickDrag } from '../../features/globe/interaction/usePointerClickDrag';
import { useHoverRaycastMove } from '../../features/globe/interaction/useHoverRaycastMove';
import { setHoverOwner } from './hoverOwners';
import {
  INITIAL_INTERACTION_STATE, type InteractiveIntelMark, type UnifiedInteractionState,
} from '../../features/globe/interaction/interactionState';
const log = createLogger({ prefix: 'Enhanced3DGlobeInteractivity' });

// The mark a hover or click names, kept with the pointer's state (features/globe/interaction).
export type { InteractiveIntelMark };

interface Enhanced3DGlobeInteractivityProps {
  globeRef: React.RefObject<{ camera: () => THREE.Camera; scene: () => THREE.Scene; renderer?: () => { domElement: HTMLCanvasElement } }>;
  intelReports: IntelReportOverlayMarker[];
  visualizationMode: {
    mode: string;
    subMode: string;
  };
  models: InteractiveIntelMark[];
  onHoverChange?: (reportId: string | null) => void;
  containerRef?: React.RefObject<HTMLDivElement>;
  /**
   * The Intel Report sprite layer, raycast in preference to the models
   * (decision D-F, step 6, part 4).
   *
   * When it is there, what a person clicks is the glyph they can see. When it
   * is not — the atlas could not be rasterised — the models are rendering
   * instead and the mesh path below is what picks them. Neither is dead code:
   * they are the two halves of one fallback.
   */
  pickLayer?: THREE.Object3D | null;
  /** Which report a picked index means. Paired with pickLayer. */
  reportAt?: (index: number) => IntelReportOverlayMarker | null;
  /**
   * The outlined territories containing a point, the smallest first, each with
   * the reports about it as a whole (BA9). A click inside one opens them; null
   * when no territory is outlined.
   */
  territoryGroupsAt?: ((lat: number, lng: number) => ReportGroup[]) | null;
  /** Whether the globe's glyphs wear their category's emblem (BA15): the menu at the click shows them too. */
  categoryEmblems?: boolean;
}


export const Enhanced3DGlobeInteractivity: React.FC<Enhanced3DGlobeInteractivityProps> = ({
  globeRef,
  intelReports,
  visualizationMode,
  models,
  onHoverChange,
  containerRef: parentContainerRef,
  pickLayer = null,
  reportAt,
  territoryGroupsAt = null,
  categoryEmblems = false
}) => {
  const localContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = parentContainerRef || localContainerRef;
  const { cursorTrailIndicatorEnabled } = useVisualizationOverlay();
  const intelReportsRef = useRef(intelReports);
  
  
  
  // Cross-app navigation & floating panels
  const { addActiveFeature } = useFloatingPanels();
  const { navigateToApp } = useApplicationRouter();

  // UI state
  const [showOfflineManager, setShowOfflineManager] = useState(false);
  // Set by the "Measure Distance" context-menu action; while set, the next click
  // anywhere on the globe completes the measurement (see the effect below).
  const [measurementOrigin, setMeasurementOrigin] = useState<{ lat: number; lng: number } | null>(null);
  
  // State for UI components
  const [tooltipVisible, setTooltipVisible] = useState(false);
  // While a report's card shows, the point and country tooltips hold back (hoverOwners.ts).
  useEffect(() => { setHoverOwner('reportCard', tooltipVisible); }, [tooltipVisible]);
  useEffect(() => () => setHoverOwner('reportCard', false), []);
  const tooltipHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // New features state
  const cachedGlobeMeshRef = useRef<THREE.Mesh | null>(null);
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());

  /**
   * Whether the marker interaction system should be running at all.
   *
   * This was `hasInteractiveMarkers` — derived from subMode — and that was the wrong
   * question in the wrong place. Every one of its 27 call sites gates MACHINERY:
   * listeners, raycasting, cursor, effect setup, tooltip mounting. None of them
   * asks what kind of thing anything is; those eight sites now dispatch on the
   * marker itself.
   *
   * Presence is `models.length > 0`, NOT an isLayerActive() call, and that
   * distinction is load-bearing. Layer gating already happened upstream:
   * Globe.tsx builds activeIntelLikeReports from the active layers, so anything
   * arriving here is by definition on an active layer. Reading isLayerActive
   * again here would be worse than redundant — it is a useCallback over
   * [primaryLayerId, pinnedLayers], so its identity changes on every pin
   * toggle, and it appears in ten dependency arrays below. That would tear down
   * and re-add every mouse listener whenever anyone pinned anything.
   *
   * A boolean is what makes this safe: `models` gets a new array identity on
   * every rebuild, but `models.length > 0` only changes when the globe goes
   * from empty to occupied or back.
   *
   * The consequence worth naming: a PINNED layer's markers are now interactive.
   * Before, they rendered only if their layer happened to be primary — and
   * after the selector became additive, they rendered and could not be touched.
   */
  const hasInteractiveMarkers = models.length > 0;
  /*
   * Whether a click or a hover here can open anything: a mark, or an outlined
   * territory (BA9). Territories alone count, because a globe whose only intel
   * is about territories as a whole has no marks and still has reports to open.
   */
  const listensForClicks = hasInteractiveMarkers || territoryGroupsAt !== null;
  // Read from the pointer handlers, which must not be rebuilt each time the reports change.
  const territoryGroupsAtRef = useRef(territoryGroupsAt);
  territoryGroupsAtRef.current = territoryGroupsAt;
  /** Where the last primary click landed, in the viewport: the menu at the click opens there (K8). */
  const clickPointRef = useRef({ x: 0, y: 0 });
  /** Which outlined territories the pointer is inside, said beside it (BA9). */
  const [territoryHover, setTerritoryHover] = useState<{ lines: string[]; x: number; y: number } | null>(null);
  /*
   * What is under the pointer, read by the layers beneath at the moment they are
   * pressed (globeClick.ts): a glyph takes their clicks, an outlined territory a
   * country's. Kept from the last hover, which a click always follows.
   */
  const pointerOverRef = useRef<GlobeClickClaim>({ mark: false, area: false });
  const listensForClicksRef = useRef(listensForClicks);
  listensForClicksRef.current = listensForClicks;
  useEffect(() => claimGlobeClicks(() => (listensForClicksRef.current ? pointerOverRef.current : { mark: false, area: false })), []);

  // Still needed, but only as the fallback for describing nothing-hovered.
  const isRLSHMode = visualizationMode.mode === 'HeroWatch' && visualizationMode.subMode === 'RLSH';

  /**
   * Are any RLSH markers on the globe?
   *
   * useRLSHSelectionMemory took `isRLSHMode` and cleared its group index when
   * false, which is a presence question about a KIND — the one site the
   * classification called genuinely both. It indexes the whole models array, so
   * it cannot take a per-marker kind; what it needs is whether there is
   * anything of that kind to index.
   */
  const hasRlshMarkers = useMemo(
    () => models.some((model) => modelKind(model) === 'rlsh'),
    [models],
  );
  const rlshSelectionMemory = useRLSHSelectionMemory({ isRLSHMode: hasRlshMarkers, models });

  // UNIFIED STATE MANAGEMENT - Direct state instead of hook (its shape: features/globe/interaction/interactionState.ts)
  const [unifiedInteractionState, setUnifiedInteractionState] = useState<UnifiedInteractionState>(INITIAL_INTERACTION_STATE);

  // Refs for high-frequency updates that don't need React re-renders
  const isDraggingRef = useRef(false);
  const currentCursorRef = useRef<string>('grab');
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster()); // Reuse raycaster for performance
  /*
   * The pick layer and what an index in it means, as they are now. The pointer handlers are memoised
   * and did not depend on them, so once reports arrived after the globe mounted, a glyph's index was read
   * against the list of an earlier render: a click on a mark in Greece opened a report in Kentucky, or
   * nothing (critique C5, "on Intel Reports a click doesn't always work"). Read through refs, always current.
   */
  const pickLayerRef = useRef(pickLayer);
  pickLayerRef.current = pickLayer;
  const reportAtRef = useRef(reportAt);
  reportAtRef.current = reportAt;

  useEffect(() => {
    intelReportsRef.current = intelReports;
  }, [intelReports]);


  // Direct cursor management without React re-renders
  const updateCursor = useCallback((newCursor: string) => {
    if (currentCursorRef.current !== newCursor && containerRef.current) {
      currentCursorRef.current = newCursor;
      containerRef.current.style.cursor = newCursor;
    }
  }, [containerRef]);

  /*
   * Screen position tracking for UI positioning.
   *
   * ADR-0002 extraction: this owned a useState, a getter and an 85-line
   * interval effect, and shared no mutable state with anything else in the
   * file — which is why it went first. The gate stays here because computing it
   * needs `unifiedInteractionState`, which the hook is deliberately kept away
   * from; it receives the answer, not the state.
   */
  const { getModelScreenPosition } = useModelScreenProjection({
    models,
    globeRef,
    containerRef,
    enabled:
      hasInteractiveMarkers
      && (unifiedInteractionState.hoveredModel !== null
        || unifiedInteractionState.clickedModel !== null),
  });

  // Helper functions for model interactions
  const clearClickedState = useCallback(() => {
    setUnifiedInteractionState(prev => ({
      ...prev,
      clickedModel: null
    }));
  }, []);

  const resolveGlobeMesh = useCallback((scene: THREE.Scene): THREE.Mesh | null => {
    const cached = cachedGlobeMeshRef.current;
    if (cached && cached.parent) {
      return cached;
    }

    const found = findPrimaryGlobeMesh(scene);
    cachedGlobeMeshRef.current = found;
    return found;
  }, []);

  /*
   * The cursor trail: sixteen refs, eleven constants and four effects, one of
   * them a 169-line animation loop. ADR-0002's second extraction.
   *
   * Placed after resolveGlobeMesh because it needs it — the globe mesh lookup
   * is shared with concerns staying here, so it is passed in rather than owned.
   *
   * Two writers drive this and only ever one at a time: in intel modes the
   * mousemove handler below calls the controller, and in non-intel modes the
   * hook attaches its own listeners. Changing either means checking both.
   */
  const {
    noteCursorScreenMotion,
    setCursorSurfaceTarget,
    hideCursorIndicator,
    resetCursorTrail,
  } = useCursorTrail3D({
    cursorTrailIndicatorEnabled,
    hasInteractiveMarkers,
    globeRef,
    containerRef,
    resolveGlobeMesh,
  });

  // Handle context menu actions with enhanced offline Intel Report support
  /**
   * Opens the application a context-menu action names, carrying what the menu knew
   * (decision D-F, step 3.3). Two of these navigated to /netrunner/<target>, an
   * address with no route, and one to a page behind a wallet sign-in.
   */
  const openFromMenu = useCallback((actionId: string, lat: number, lng: number, precisionM?: number) => {
    const destination = globeContextDestination(actionId, { lat, lng, precisionM });
    if (destination) navigateToApp(destination.app, 'standalone', destination.context);
  }, [navigateToApp]);

  /** How precisely a click gives a place from where the camera is now (plan item 0.11). */
  const clickPrecisionHere = useCallback((): number | undefined => {
    const globeObj = globeRef.current;
    const camera = globeObj?.camera() as THREE.PerspectiveCamera | undefined;
    const scene = globeObj?.scene();
    if (!camera || !scene || typeof camera.fov !== 'number') return undefined;
    const mesh = resolveGlobeMesh(scene);
    return clickPrecisionM({
      cameraDistance: camera.position.length(),
      globeRadius: mesh ? getGlobeMeshRadius(mesh) : 100,
      fovDeg: camera.fov,
      viewportHeightPx: containerRef.current?.clientHeight || window.innerHeight,
    });
  }, [globeRef, resolveGlobeMesh, containerRef]);

  /** The point on the globe under a screen position, or null when it is off the globe. */
  const geoAt = useCallback((clientX: number, clientY: number): { lat: number; lng: number } | null => {
    const container = containerRef.current;
    const camera = globeRef.current?.camera();
    const scene = globeRef.current?.scene();
    if (!container || !camera || !scene) return null;
    const rect = container.getBoundingClientRect();
    mouseRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    const globeMesh = resolveGlobeMesh(scene);
    if (!globeMesh) return null;
    const intersects = raycasterRef.current.intersectObject(globeMesh, true);
    if (intersects.length === 0) return null;
    // The place drawn under the pointer, on a raised territories shell too (globe-engine/shellLift.ts).
    return worldPointToGeoOnGlobe(groundUnderShell(raycasterRef.current.ray, intersects[0].point), globeMesh);
  }, [containerRef, globeRef, resolveGlobeMesh]);

  // The report form asked for its place (plan item 3.5): the next click on the
  // globe opens the form again with it, as "Create Intel Report" from the menu does.
  const placePicking = useGlobePlacePick({
    canvas: () => globeRef.current?.renderer?.().domElement ?? containerRef.current?.querySelector('canvas'),
    locate: geoAt,
    onPick: (lat, lng) => openFromMenu('create-intel-report', lat, lng, clickPrecisionHere()),
    onCancel: () => navigateToApp('inteldashboard', 'standalone', { restoreDraft: 'true' }),
  });

  const handleCustomContextAction = useCallback(async (
    action: GlobeContextAction, 
    data?: GlobeContextActionData
  ) => {
    log.debug('🎯 Context action triggered:', { action: action.id, data });

    if (!data?.geoLocation) {
      log.warn('No geo location provided for action:', action.id);
      return;
    }

    const { lat, lng } = data.geoLocation;

    // Handle specific actions with enhanced offline support
    switch (action.id) {
      case 'create-intel-report': {
        // The report form, at the spot, with how precisely the click gave it
        // (plan item 0.11). It saved at once with an automatic title and no
        // content, into one of two stores depending on whether a wallet was
        // connected; a wallet has nothing to do with writing a report.
        openFromMenu(action.id, lat, lng, clickPrecisionHere());
        break;
      }
      
      case 'bookmark-location': {
        const bookmark = globeBookmarkService.addBookmark(lat, lng);
        const total = globeBookmarkService.getBookmarks().length;
        log.debug('📌 Bookmarked location:', bookmark);
        hudSuccess('Location Bookmarked', `${bookmark.label} saved (${total} total)`);
        break;
      }

      case 'view-offline-reports': {
        // OfflineIntelReportsManager (the sync/conflict-resolution UI for
        // reports saved offline before plan item 0.11) was fully built and
        // imported into this render tree, but nothing ever called
        // setShowOfflineManager(true) — a genuine, working feature with no
        // way to reach it. This context-menu action is that entry point.
        setShowOfflineManager(true);
        break;
      }

      case 'location-details': {
        log.debug('🌍 Showing location details for:', { lat, lng });
        const hemisphere = lat > 0 ? 'Northern' : 'Southern';
        const utcOffset = estimateUtcOffsetHours(lng);
        const offsetLabel = `UTC${utcOffset >= 0 ? '+' : ''}${utcOffset}`;
        hudInfo(
          'Location Details',
          `${lat.toFixed(6)}, ${lng.toFixed(6)} — ${hemisphere} Hemisphere, ~${offsetLabel} (estimated)`
        );
        break;
      }

      case 'area-statistics': {
        log.debug('📊 Fetching area statistics for:', { lat, lng });
        try {
          const AREA_STATS_RADIUS_KM = 500;
          const nearby = await intelReportVisualizationService.getIntelReportMarkers({
            radiusFilter: { centerLat: lat, centerLng: lng, radiusKm: AREA_STATS_RADIUS_KM }
          });
          if (nearby.length === 0) {
            hudInfo('Area Statistics', `No intel reports within ${AREA_STATS_RADIUS_KM}km of this location.`);
          } else {
            const byPriority = nearby.reduce<Record<string, number>>((acc, marker) => {
              const key = getIntelReportPriority(marker);
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {});
            const breakdown = Object.entries(byPriority)
              .map(([priority, count]) => `${count} ${priority}`)
              .join(', ');
            hudInfo(
              'Area Statistics',
              `${nearby.length} intel ${nearby.length === 1 ? 'report' : 'reports'} within ${AREA_STATS_RADIUS_KM}km — ${breakdown}`
            );
          }
        } catch (error) {
          log.error('Failed to compute area statistics', error);
          hudError('Area Statistics Failed', error instanceof Error ? error.message : 'Unknown error');
        }
        break;
      }
      
      case 'satellite-view':
        log.debug('🛰️ Opening satellite tracking at:', { lat, lng });
        addActiveFeature('satellite-tracking');
        break;
      
      case 'historical-data':
        log.debug('🗺️ Opening timeline for:', { lat, lng });
        addActiveFeature('timeline');
        break;
      
      case 'measure-distance':
        log.debug('📏 Starting distance measurement from:', { lat, lng });
        setMeasurementOrigin({ lat, lng });
        hudInfo('Measurement Started', `Origin: ${lat.toFixed(4)}, ${lng.toFixed(4)} — click anywhere on the globe to measure, or Esc to cancel`);
        break;
      
      case 'scan-area':
        log.debug('🔍 Launching NetRunner scan from:', { lat, lng });
        openFromMenu('scan-area', lat, lng);
        break;
      
      case 'signal-analysis':
        log.debug('📡 Launching signal analysis from:', { lat, lng });
        openFromMenu('signal-analysis', lat, lng);
        break;
      
      case 'threat-assessment':
        log.debug('⚠️ Opening threat assessment for:', { lat, lng });
        addActiveFeature('threat-assessment');
        break;
      
      case 'share-location':
        log.debug('Sharing location:', { lat, lng });
        navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        hudSuccess('Coordinates Copied', `${lat.toFixed(6)}, ${lng.toFixed(6)} copied to clipboard`);
        break;
      
      case 'report-incident':
        log.debug('🚨 Opening cases dashboard for incident at:', { lat, lng });
        openFromMenu('report-incident', lat, lng);
        break;
      
      default:
        log.debug('🔧 Action not yet implemented:', action.id);
        hudWarning('Coming Soon', `"${action.label}" is under development`);
        break;
    }
  }, [setShowOfflineManager, addActiveFeature, openFromMenu, clickPrecisionHere, setMeasurementOrigin]);

  // Use the right-click interaction hook (for globe surface interactions)
  useGlobeRightClickInteraction({
    globeRef,
    containerRef,
    enabled: true,
    onContextAction: handleCustomContextAction
  });

  // Completes a "Measure Distance" request: the next left-click anywhere on the
  // globe (while measurementOrigin is set) computes and reports the great-circle
  // distance from the origin point. Escape cancels without measuring.
  useEffect(() => {
    if (!measurementOrigin || !containerRef.current) return;

    const container = containerRef.current;

    const handleMeasureClick = (event: MouseEvent) => {
      if (!globeRef.current) return;
      const globeObj = globeRef.current;
      const camera = globeObj.camera();
      const scene = globeObj.scene();
      if (!camera || !scene) return;

      const rect = container.getBoundingClientRect();
      mouseRef.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const globeMesh = resolveGlobeMesh(scene);
      if (!globeMesh) return;

      const intersects = raycasterRef.current.intersectObject(globeMesh, true);
      if (intersects.length === 0) return;

      const { lat, lng } = worldPointToGeoOnGlobe(groundUnderShell(raycasterRef.current.ray, intersects[0].point), globeMesh);
      const distanceKm = haversineDistanceKm(measurementOrigin.lat, measurementOrigin.lng, lat, lng);
      hudSuccess(
        'Distance Measured',
        `${distanceKm.toFixed(1)} km between ${measurementOrigin.lat.toFixed(2)},${measurementOrigin.lng.toFixed(2)} and ${lat.toFixed(2)},${lng.toFixed(2)}`
      );
      setMeasurementOrigin(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMeasurementOrigin(null);
        hudInfo('Measurement Cancelled', '');
      }
    };

    container.addEventListener('click', handleMeasureClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      container.removeEventListener('click', handleMeasureClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [measurementOrigin, containerRef, globeRef, resolveGlobeMesh]);

  useEffect(() => {
    const hasHoveredModel = unifiedInteractionState.hoveredModel !== null;

    if (hasHoveredModel && hasInteractiveMarkers) {
      if (tooltipHideTimerRef.current) {
        clearTimeout(tooltipHideTimerRef.current);
        tooltipHideTimerRef.current = null;
      }
      setTooltipVisible(true);
      return;
    }

    if (tooltipHideTimerRef.current) {
      clearTimeout(tooltipHideTimerRef.current);
    }

    tooltipHideTimerRef.current = setTimeout(() => {
      setTooltipVisible(false);
      tooltipHideTimerRef.current = null;
    }, 80);
  }, [unifiedInteractionState.hoveredModel, hasInteractiveMarkers]);

  useEffect(() => {
    return () => {
      if (tooltipHideTimerRef.current) {
        clearTimeout(tooltipHideTimerRef.current);
        tooltipHideTimerRef.current = null;
      }
    };
  }, []);

  const consumeGlobeClick = useCallback(() => {
    setUnifiedInteractionState((prev) => ({ ...prev, clickedGlobeAt: null }));
  }, []);
  const hideTooltip = useCallback(() => setTooltipVisible(false), []);
  const hideTerritoryHover = useCallback(() => setTerritoryHover(null), []);

  // What a click opens: a report's popup, the menu at the click (K8, BA9) or an RLSH marker's popup (ADR-0002).
  const { groupMenu, setGroupMenu, pickFromMenu } = useIntelRlshPopupFlow({
    hasInteractiveMarkers,
    listensForClicks,
    clickedModel: unifiedInteractionState.clickedModel,
    clickedGlobeAt: unifiedInteractionState.clickedGlobeAt,
    clearClickedState,
    consumeGlobeClick,
    onHoverChange,
    intelReportsRef,
    territoryGroupsAtRef,
    clickPointRef,
    rlshSelectionMemory,
    modelCount: models.length,
    hideTooltip,
    hideTerritoryHover,
  });

  // Notify parent of hover changes
  useEffect(() => {
    const hovered = unifiedInteractionState.hoveredModel;
    const reportId = hovered?.report?.pubkey || null;
    onHoverChange?.(reportId);

    // Asked of the hovered model, which is already in hand on the line above.
    if (reportId && modelKind(hovered) === 'rlsh') {
      rlshTelemetryService.emit('rlsh_hover', {
        markerCount: models.length,
        result: 'success'
      });
    }
    /*
     * isRLSHMode is gone from these deps, and that fixes a live defect rather
     * than merely tidying one. This effect calls onHoverChange(reportId), and
     * Globe.tsx feeds that straight back into the glyph layer as the hovered id —
     * so a bare MODE CHANGE re-notified the parent with a stale hover id, growing
     * a mark the pointer had long since left.
     */
  }, [unifiedInteractionState.hoveredModel, onHoverChange, models.length]);

  // Calculate tooltip position
  const getTooltipPosition = () => {
    if (!unifiedInteractionState.hoveredModel) {
      return unifiedInteractionState.mousePosition;
    }

    // Try to get the model's screen position for more accurate tooltip placement
    const screenPos = getModelScreenPosition(unifiedInteractionState.hoveredModel.report.pubkey);
    if (screenPos) {
      return {
        x: screenPos.x + 15, // Offset to avoid overlapping the model
        y: screenPos.y - 10
      };
    }

    // Fallback to mouse position
    return {
      x: unifiedInteractionState.mousePosition.x + 15,
      y: unifiedInteractionState.mousePosition.y - 10
    };
  };
  // Initialize mouse position indicator



  // Note: Intel Report creation is now handled through the right-click context menu
  // to avoid interference with globe drag interactions

  // The pointer over the globe: drag detection, then the mark or territory under it (ADR-0002).
  const { handleMouseMove, resetFrameSkip } = useHoverRaycastMove({
    listensForClicks,
    containerRef,
    globeRef,
    cursorTrailIndicatorEnabled,
    noteCursorScreenMotion,
    setCursorSurfaceTarget,
    hideCursorIndicator,
    resetCursorTrail,
    updateCursor,
    resolveGlobeMesh,
    pickLayerRef,
    reportAtRef,
    territoryGroupsAtRef,
    pointerOverRef,
    isDraggingRef,
    raycasterRef,
    mouseRef,
    setUnifiedInteractionState,
    setTerritoryHover,
  });

  // A press told from a drag, and the pointer's listeners (ADR-0002).
  usePointerClickDrag({
    listensForClicks,
    containerRef,
    setUnifiedInteractionState,
    pointerOverRef,
    clickPointRef,
    isDraggingRef,
    onMove: handleMouseMove,
    onPress: resetFrameSkip,
  });


  /**
   * Initial cursor, and — new — putting it back.
   *
   * This had no cleanup, so the cursor kept whatever the last hover left it as.
   * Hover a marker (pointer), then leave the mode, and the globe was left
   * showing a pointer over nothing clickable. That was already true when the
   * gate was mode-derived; deriving it from marker PRESENCE makes it reachable
   * far more often, because markers empty and refill on ordinary data reloads.
   *
   * Resetting to 'grab' rather than '' because the globe is still draggable
   * when no marker is interactive — the affordance that remains true.
   */
  useEffect(() => {
    if (!containerRef.current) return;
    if (!listensForClicks) {
      updateCursor('grab');
      setTerritoryHover(null);
      return;
    }
    updateCursor('grab');
    return () => updateCursor('grab');
  }, [listensForClicks, containerRef, updateCursor]);

  /**
   * What the pointer is over, for anything that DESCRIBES it.
   *
   * The rule lives in markerPresentation.ts so it can be asserted directly:
   * this component's integration harness passes models: [] and drives no
   * raycast, so it can only reach the nothing-hovered branch.
   */
  const hoveredPresentation = describeHoveredMarker(
    unifiedInteractionState.hoveredModel,
    isRLSHMode ? 'rlsh' : 'intel',
  );

  return (
    <>
      {placePicking.pending && <PlacePickHint onBack={placePicking.cancel} />}
      {/* The menu at the click (K8): a place's reports, or an outlined territory's (BA9). */}
      {groupMenu && (
        <GlobeGroupMenu
          at={groupMenu.at}
          sections={groupMenu.groups.map((group) => sectionOf(group, { emblems: categoryEmblems }))}
          onPick={pickFromMenu}
          onClose={() => setGroupMenu(null)}
          country={groupMenu.country ? { name: groupMenu.country.name } : undefined}
          onCountry={() => {
            const { country } = groupMenu;
            setGroupMenu(null);
            country?.open();
          }}
        />
      )}
      {territoryHover && !groupMenu && <TerritoryHoverLabel at={territoryHover} lines={territoryHover.lines} />}
      {/* Tooltip for hover state */}
      {hasInteractiveMarkers && (
        <IntelReportTooltip
          report={unifiedInteractionState.hoveredModel?.report || null}
          position={getTooltipPosition()}
          visible={tooltipVisible}
          entityLabel={hoveredPresentation.entityLabel}
          showConfidenceTag={hoveredPresentation.showConfidenceTag}
          onClose={() => {
            setTooltipVisible(false);
          }}
        />
      )}
      {/* Offline Intel Reports Manager — mounted only once opened */}
      {showOfflineManager && (
        <React.Suspense fallback={null}>
          <OfflineIntelReportsManager
            // No wallet: adding an offline report to your reports needs none,
            // and the wallet is retired (plan item 4.4).
            isOpen={showOfflineManager}
            onClose={() => setShowOfflineManager(false)}
            onViewReport={(report) => {
              log.debug('Viewing offline report:', report);
            }}
            onEditReport={(report) => {
              log.debug('Editing offline report:', report);
            }}
          />
        </React.Suspense>
      )}

      {/* Screen reader announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          left: '-10000px',
          width: '1px',
          height: '1px',
          overflow: 'hidden'
        }}
      >
        {unifiedInteractionState.hoveredModel && hasInteractiveMarkers && (
          <div>
            {hoveredPresentation.entityLabel}: {unifiedInteractionState.hoveredModel.report.title}
          </div>
        )}
      </div>
    </>
  );
};

export default Enhanced3DGlobeInteractivity;
