/**
 * useGlobeRightClickInteraction - Hook for right-click context menu on globe
 * 
 * Handles right-click events on the globe surface, detects geographic coordinates,
 * and manages context menu state using the global context menu provider.
 */

import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { GlobeContextAction, GlobeContextActionData } from '../components/ui/GlobeContextMenu/GlobeContextMenu';
import { useGlobalGlobeContextMenu } from '../context/GlobalGlobeContextMenuProvider';
import { findPrimaryGlobeMesh, worldPointToGeoOnGlobe } from '../utils/globeSurfaceMapping';
import { createLogger } from '@utils/logger';
import { groundUnderShell } from '../globe-engine/shellLift';
const log = createLogger({ prefix: 'useGlobeRightClickInteraction' });

interface UseGlobeRightClickProps {
  globeRef: React.RefObject<{ 
    camera: () => THREE.Camera; 
    scene: () => THREE.Scene;
    getCoords?: (lat: number, lng: number) => THREE.Vector3;
    toGeoCoords?: (point: { x: number; y: number; z: number }) => { lat: number; lng: number };
  }>;
  containerRef: React.RefObject<HTMLDivElement>;
  enabled?: boolean;
  onContextAction?: (action: GlobeContextAction, data?: GlobeContextActionData) => void;
}

interface GlobeIntersection {
  point: THREE.Vector3;
  geoCoordinates: { lat: number; lng: number };
}

export function useGlobeRightClickInteraction({
  globeRef,
  containerRef,
  enabled = true,
  onContextAction
}: UseGlobeRightClickProps) {
  const globalContextMenu = useGlobalGlobeContextMenu();
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const globeMeshRef = useRef<THREE.Mesh | null>(null);

  const resolveGlobeMesh = useCallback((scene: THREE.Scene): THREE.Mesh | null => {
    const cached = globeMeshRef.current;
    if (cached && cached.parent) {
      return cached;
    }

    const found = findPrimaryGlobeMesh(scene);
    globeMeshRef.current = found;
    return found;
  }, []);

  // Raycast against globe surface to find intersection point
  const getGlobeIntersection = useCallback((
    mouseX: number, 
    mouseY: number, 
    containerRect: DOMRect
  ): GlobeIntersection | null => {
    if (!globeRef.current) return null;

    const globeObj = globeRef.current;
    const camera = globeObj.camera();
    const scene = globeObj.scene();
    
    if (!camera || !scene) return null;

    // Convert mouse coordinates to normalized device coordinates (-1 to +1)
    const x = ((mouseX - containerRect.left) / containerRect.width) * 2 - 1;
    const y = -((mouseY - containerRect.top) / containerRect.height) * 2 + 1;

    mouseRef.current.set(x, y);
    raycasterRef.current.setFromCamera(mouseRef.current, camera);

    const globeMesh = resolveGlobeMesh(scene);
    if (!globeMesh) {
      return null;
    }

    // Find intersections with the primary globe mesh only
    const intersects = raycasterRef.current.intersectObject(globeMesh, true);
    
    log.debug(`🔍 Raycasting found ${intersects.length} intersections`);
    
    if (intersects.length > 0) {
      // The place drawn under the pointer, on a raised territories shell too (globe-engine/shellLift.ts).
      const worldPoint = groundUnderShell(raycasterRef.current.ray, intersects[0].point);
      const geoCoordinates = typeof globeObj.toGeoCoords === 'function'
        ? globeObj.toGeoCoords(worldPoint)
        : worldPointToGeoOnGlobe(worldPoint, globeMesh);

      return {
        point: worldPoint,
        geoCoordinates
      };
    }

    return null;
  }, [globeRef, resolveGlobeMesh]);

  // Fallback used only if a caller doesn't supply onContextAction. In production,
  // Enhanced3DGlobeInteractivity always does — this previously showed native
  // alert() popups ("Marker functionality coming soon.", etc.) that no user ever
  // actually saw, since the real handler always won. Kept as a loud dev-time
  // warning instead of silent no-op or fake dialogs, so a future caller that
  // forgets to wire onContextAction notices immediately rather than shipping
  // dead menu actions again.
  const handleContextAction = useCallback((
    action: GlobeContextAction,
    data?: GlobeContextActionData
  ) => {
    log.warn(
      `Context action "${action.id}" fired with no onContextAction handler supplied — this action will do nothing.`,
      data
    );
  }, []);

  // Handle right-click events
  const handleContextMenu = useCallback((event: MouseEvent) => {
    if (!enabled || !containerRef.current) return;

    event.preventDefault(); // Prevent browser context menu

    const rect = containerRef.current.getBoundingClientRect();
    const intersection = getGlobeIntersection(event.clientX, event.clientY, rect);

    if (intersection) {
      log.debug('🌍 Right-click on globe:', {
        coordinates: intersection.geoCoordinates,
        worldPoint: intersection.point
      });

      globalContextMenu.showContextMenu(
        { x: event.clientX, y: event.clientY },
        intersection.geoCoordinates,
        onContextAction || handleContextAction
      );
    } else {
      log.debug('❌ Right-click missed globe surface');
    }
  }, [enabled, containerRef, getGlobeIntersection, globalContextMenu, handleContextAction, onContextAction]);

  // Set up event listeners
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    
    // Disable default context menu and add our handler
    container.addEventListener('contextmenu', handleContextMenu);

    return () => {
      container.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [enabled, containerRef, handleContextMenu]);

  // Close context menu on escape key
  useEffect(() => {
    if (!globalContextMenu.isVisible) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        globalContextMenu.hideContextMenu();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [globalContextMenu]);

  return {
    // Functions
    handleContextAction,
    
    // Utilities
    getGlobeIntersection: (mouseX: number, mouseY: number) => {
      if (!containerRef.current) return null;
      const rect = containerRef.current.getBoundingClientRect();
      return getGlobeIntersection(mouseX, mouseY, rect);
    }
  };
}

export default useGlobeRightClickInteraction;
