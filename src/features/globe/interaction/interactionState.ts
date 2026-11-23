/**
 * What the globe's pointer handling keeps between events (ADR-0002): the mark under the pointer, the one clicked,
 * a press in progress, and where on the globe the pointer is. Enhanced3DGlobeInteractivity holds it; the hooks
 * beside this file read and update it.
 */
import type { Dispatch, SetStateAction } from 'react';
import type * as THREE from 'three';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';

/**
 * What this component needs of an Intel Report mark: the report, read for a title or
 * a pubkey, and a transform node to project a screen position for the tooltip. The
 * glyph layer gives each report one (useGlobeIntelSprites).
 *
 * Marks were 3D models once, picked by their meshes and joined to the ground by a
 * line, since a model hovered 10 units up. The glyphs are picked as points, and the
 * models were retired on 2026-10-08, with the meshes' picking and the lines.
 */
export interface InteractiveIntelMark {
  mesh?: THREE.Object3D;
  report: IntelReportOverlayMarker;
}

export interface UnifiedInteractionState {
  // Mouse interaction state
  hoveredModel: InteractiveIntelMark | null;
  clickedModel: InteractiveIntelMark | null;
  mousePosition: { x: number; y: number };

  // Drag/click detection state (game development pattern)
  isMouseDown: boolean;
  dragStartPos: { x: number; y: number };
  currentPos: { x: number; y: number };
  dragDistance: number;
  mouseDownTime: number;
  isDragging: boolean;
  hasDraggedPastThreshold: boolean;

  // Globe hover state
  globeHoverPosition: { lat: number; lng: number } | null;
  /** A click on the globe that hit no mark, for the territories there (BA9). */
  clickedGlobeAt: { lat: number; lng: number } | null;
}

export const INITIAL_INTERACTION_STATE: UnifiedInteractionState = {
  hoveredModel: null,
  clickedModel: null,
  mousePosition: { x: 0, y: 0 },
  isMouseDown: false,
  dragStartPos: { x: 0, y: 0 },
  currentPos: { x: 0, y: 0 },
  dragDistance: 0,
  mouseDownTime: 0,
  isDragging: false,
  hasDraggedPastThreshold: false,
  globeHoverPosition: null,
  clickedGlobeAt: null,
};

/** How far a press may move and still be a click, in px, and how long it may last, in ms. */
export const DRAG_THRESHOLD_PX = 5;
export const CLICK_TIME_THRESHOLD_MS = 300;

export type SetInteractionState = Dispatch<SetStateAction<UnifiedInteractionState>>;
