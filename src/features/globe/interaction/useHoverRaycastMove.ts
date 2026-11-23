/**
 * The pointer moving over the globe (ADR-0002's hover raycast, moved out of Enhanced3DGlobeInteractivity whole):
 * drag detection while a press is held, then, at a gentler rate, which Intel Report mark or outlined territory is
 * under the pointer, where on the globe it is, the cursor, and the cursor trail.
 *
 * Throttled in levels so a fast pointer costs little: the position every event, drag detection at about 60 fps,
 * the hover raycast every 50 ms, and React state every 100 ms.
 */
import type React from 'react';
import { useCallback, useRef } from 'react';
import * as THREE from 'three';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import type { ReportGroup } from '../../../components/Globe/placeMenu';
import type { GlobeClickClaim } from '../../../components/Globe/globeClick';
import { intelReportAtHits, INTEL_SPRITE_PICK_THRESHOLD_UNITS } from '../../../components/Globe/intelReportSprites';
import { worldPointToGeoOnGlobe } from '../../../utils/globeSurfaceMapping';
import { groundUnderShell } from '../../../globe-engine/shellLift';
import { createLogger } from '@utils/logger';
import { DRAG_THRESHOLD_PX, type InteractiveIntelMark, type SetInteractionState } from './interactionState';

const log = createLogger({ prefix: 'Enhanced3DGlobeInteractivity' });

// Advanced throttling configuration
const MOUSE_STATE_UPDATE_THROTTLE = 100; // Only update React state every 100ms
const HOVER_DETECTION_THROTTLE = 50; // Hover detection can be more frequent
const DRAG_DETECTION_THROTTLE = 16; // Drag detection at ~60fps for responsiveness

type GlobeHandle = { camera: () => THREE.Camera; scene: () => THREE.Scene };

interface UseHoverRaycastMoveOptions {
  listensForClicks: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  globeRef: React.RefObject<GlobeHandle>;
  cursorTrailIndicatorEnabled: boolean;
  noteCursorScreenMotion: (clientX: number, clientY: number) => void;
  setCursorSurfaceTarget: (point: THREE.Vector3) => void;
  hideCursorIndicator: () => void;
  resetCursorTrail: () => void;
  updateCursor: (cursor: string) => void;
  resolveGlobeMesh: (scene: THREE.Scene) => THREE.Mesh | null;
  pickLayerRef: React.MutableRefObject<THREE.Object3D | null>;
  reportAtRef: React.MutableRefObject<((index: number) => IntelReportOverlayMarker | null) | undefined>;
  territoryGroupsAtRef: React.MutableRefObject<((lat: number, lng: number) => ReportGroup[]) | null>;
  /** What is under the pointer, for the layers beneath (globeClick.ts). */
  pointerOverRef: React.MutableRefObject<GlobeClickClaim>;
  /** Whether the planet is being dragged: set here, cleared when the press ends. */
  isDraggingRef: React.MutableRefObject<boolean>;
  raycasterRef: React.MutableRefObject<THREE.Raycaster>;
  mouseRef: React.MutableRefObject<THREE.Vector2>;
  setUnifiedInteractionState: SetInteractionState;
  setTerritoryHover: (hover: { lines: string[]; x: number; y: number } | null) => void;
}

export function useHoverRaycastMove({
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
}: UseHoverRaycastMoveOptions) {
  // Refs for high-frequency updates that don't need React re-renders
  const currentMousePosRef = useRef({ x: 0, y: 0 });
  const lastMouseStateUpdateRef = useRef(0);

  // Performance tracking refs
  const lastHoverDetectionRef = useRef(0);
  const lastDragDetectionRef = useRef(0);
  const frameSkipCounterRef = useRef(0);
  const lastHoverRaycastPositionRef = useRef<{ x: number; y: number } | null>(null);

  // Performance monitoring (development only)
  const performanceStatsRef = useRef({
    totalMouseMoves: 0,
    skippedFrames: 0,
    reactStateUpdates: 0,
    hoverDetections: 0,
    lastResetTime: Date.now()
  });

  /** A press starts: drag detection runs on the next move at once. */
  const resetFrameSkip = useCallback(() => {
    frameSkipCounterRef.current = 0;
  }, []);

  // UNIFIED COMPREHENSIVE THROTTLED MOUSE HANDLER
  // This is a complete rewrite that consolidates all mouse interactions with advanced throttling
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!listensForClicks || !containerRef.current || !globeRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const currentTime = Date.now();

    // PERFORMANCE MONITORING (development only)
    if (process.env.NODE_ENV === 'development') {
      performanceStatsRef.current.totalMouseMoves++;

      // Reset stats every 10 seconds
      if (currentTime - performanceStatsRef.current.lastResetTime > 10000) {
        log.debug('🔧 Mouse Handler Performance Stats (10s):', {
          totalMoves: performanceStatsRef.current.totalMouseMoves,
          skippedFrames: performanceStatsRef.current.skippedFrames,
          reactUpdates: performanceStatsRef.current.reactStateUpdates,
          hoverDetections: performanceStatsRef.current.hoverDetections,
          efficiency: `${(100 - (performanceStatsRef.current.skippedFrames / performanceStatsRef.current.totalMouseMoves * 100)).toFixed(1)}%`
        });

        performanceStatsRef.current = {
          totalMouseMoves: 0,
          skippedFrames: 0,
          reactStateUpdates: 0,
          hoverDetections: 0,
          lastResetTime: currentTime
        };
      }
    }

    // LEVEL 1: ALWAYS update mouse position ref (no React re-render, essential for tooltips)
    currentMousePosRef.current = {
      x: event.clientX, // Global coordinates for tooltips
      y: event.clientY
    };

    if (cursorTrailIndicatorEnabled) {
      noteCursorScreenMotion(event.clientX, event.clientY);
    } else {
      resetCursorTrail();
    }

    // LEVEL 2: DRAG DETECTION (high frequency ~60fps for responsive dragging)
    const isDraggingPlanet = isDraggingRef.current;
    let shouldUpdateDragState = false;

    if (currentTime - lastDragDetectionRef.current >= DRAG_DETECTION_THROTTLE) {
      shouldUpdateDragState = true;
      lastDragDetectionRef.current = currentTime;
    }

    // LEVEL 3: REACT STATE UPDATES (low frequency 100ms to prevent infinite loops)
    let shouldUpdateReactState = false;
    if (!isDraggingPlanet && currentTime - lastMouseStateUpdateRef.current >= MOUSE_STATE_UPDATE_THROTTLE) {
      shouldUpdateReactState = true;
      lastMouseStateUpdateRef.current = currentTime;
    }

    // LEVEL 4: HOVER DETECTION (medium frequency 50ms for good responsiveness)
    let shouldUpdateHoverState = false;
    if (!isDraggingPlanet && currentTime - lastHoverDetectionRef.current >= HOVER_DETECTION_THROTTLE) {
      shouldUpdateHoverState = true;
      lastHoverDetectionRef.current = currentTime;
    }

    // PERFORMANCE TRACKING: Skip frames if called too frequently
    frameSkipCounterRef.current++;
    if (frameSkipCounterRef.current % 3 === 0) { // Process every 3rd call for heavy operations
      frameSkipCounterRef.current = 0;
    } else if (!shouldUpdateDragState && !shouldUpdateReactState) {
      if (process.env.NODE_ENV === 'development') {
        performanceStatsRef.current.skippedFrames++;
      }
      return; // Skip this frame entirely if no updates are needed
    }

    // === DRAG STATE PROCESSING ===
    if (shouldUpdateDragState && shouldUpdateReactState) {
      if (process.env.NODE_ENV === 'development') {
        performanceStatsRef.current.reactStateUpdates++;
      }
      setUnifiedInteractionState(prev => {
        let newState = { ...prev };

        // Update drag detection if mouse is down
        if (prev.isMouseDown) {
          const dragDistance = Math.sqrt(
            Math.pow(x - prev.dragStartPos.x, 2) +
            Math.pow(y - prev.dragStartPos.y, 2)
          );

          const isDragging = dragDistance > DRAG_THRESHOLD_PX;
          const hasDraggedPastThreshold = prev.hasDraggedPastThreshold || isDragging;

          // Update the ref immediately for other systems
          isDraggingRef.current = hasDraggedPastThreshold;

          newState = {
            ...newState,
            currentPos: { x, y },
            dragDistance,
            isDragging,
            hasDraggedPastThreshold
          };

          // Debug logging (throttled)
          if (isDragging && !prev.isDragging) {
            if (process.env.NODE_ENV === 'development') {
              log.debug('🖱️ COMPREHENSIVE Handler - Drag detected:', { dragDistance, dragThreshold: DRAG_THRESHOLD_PX });
            }
          }
        }

        // Update mouse position
        newState.mousePosition = { ...currentMousePosRef.current };
        return newState;
      });
    }

    // === EARLY EXIT: Skip expensive 3D operations during dragging ===
    if (isDraggingPlanet) {
      return;
    }

    // === 3D INTERSECTION AND HOVER DETECTION ===
    if (shouldUpdateHoverState) {
      if (process.env.NODE_ENV === 'development') {
        performanceStatsRef.current.hoverDetections++;
      }
      const globeObj = globeRef.current;
      const scene = globeObj?.scene();
      const camera = globeObj?.camera();

      if (!scene || !camera) return;

      const previousRaycastPosition = lastHoverRaycastPositionRef.current;
      const deltaX = previousRaycastPosition ? x - previousRaycastPosition.x : 0;
      const deltaY = previousRaycastPosition ? y - previousRaycastPosition.y : 0;
      const movementSq = deltaX * deltaX + deltaY * deltaY;
      if (previousRaycastPosition && movementSq < 4) {
        return;
      }
      lastHoverRaycastPositionRef.current = { x, y };

      // Normalize mouse coordinates to [-1, 1] range
      mouseRef.current.x = (x / rect.width) * 2 - 1;
      mouseRef.current.y = -(y / rect.height) * 2 + 1;

      // Update reused raycaster
      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      // PRIORITY 1: Intel report marks, the glyph layer's points.
      let hoveredIntelModel: InteractiveIntelMark | null = null;
      const pickLayer = pickLayerRef.current;
      const reportAt = reportAtRef.current;
      if (pickLayer && reportAt) {
        // three.js picks a THREE.Points against a world-space sphere per point
        // and knows nothing about its drawn pixel size; this is the figure the
        // tooltip system already uses, so a mark that shows a tooltip is a mark
        // that can be clicked.
        raycasterRef.current.params.Points = { threshold: INTEL_SPRITE_PICK_THRESHOLD_UNITS };
        const report = intelReportAtHits(
          raycasterRef.current.intersectObject(pickLayer, true),
          reportAt,
        );
        if (report) hoveredIntelModel = { report };
      }
      if (hoveredIntelModel) {
        hideCursorIndicator();
      }

      // PRIORITY 2: Globe surface intersection (only if no intel model hovered)
      let newGlobeHoverPosition: { lat: number; lng: number } | null = null;
      if (!hoveredIntelModel) {
        const globeMesh = resolveGlobeMesh(scene);

        if (globeMesh) {
          const globeIntersects = raycasterRef.current.intersectObject(globeMesh);
          if (globeIntersects.length > 0) {
            const intersectionPoint = groundUnderShell(raycasterRef.current.ray, globeIntersects[0].point);
            const globeGeo = worldPointToGeoOnGlobe(intersectionPoint, globeMesh);

            newGlobeHoverPosition = globeGeo;

            if (cursorTrailIndicatorEnabled) {
              setCursorSurfaceTarget(intersectionPoint);
            } else {
              hideCursorIndicator();
            }
          } else {
            hideCursorIndicator();
          }
        }
      }

      // The outlined territories under the pointer, when no mark is (BA9): said beside it, and clickable.
      const territoriesHere = !hoveredIntelModel && newGlobeHoverPosition && territoryGroupsAtRef.current
        ? territoryGroupsAtRef.current(newGlobeHoverPosition.lat, newGlobeHoverPosition.lng)
        : [];
      pointerOverRef.current = { mark: hoveredIntelModel !== null, area: hoveredIntelModel !== null || territoriesHere.length > 0 };

      // BATCHED STATE UPDATE: Update hover states together
      if (shouldUpdateReactState) {
        setUnifiedInteractionState(prev => ({
          ...prev,
          hoveredModel: hoveredIntelModel,
          globeHoverPosition: newGlobeHoverPosition
        }));
        setTerritoryHover(territoriesHere.length
          ? { lines: territoriesHere.map((group) => group.title), x: event.clientX, y: event.clientY }
          : null);
      }

      // IMMEDIATE CURSOR UPDATE: Don't wait for React state
      if (hoveredIntelModel || territoriesHere.length > 0) {
        updateCursor('pointer');
      } else {
        updateCursor('grab');
      }
    }
  }, [
    listensForClicks,
    cursorTrailIndicatorEnabled,
    containerRef,
    globeRef,
    // The cursor-trail constants that used to sit here moved into
    // useCursorTrail3D and are module-scope there; the handler now depends on
    // the controller's callbacks instead.
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
  ]);

  return { handleMouseMove, resetFrameSkip };
}
