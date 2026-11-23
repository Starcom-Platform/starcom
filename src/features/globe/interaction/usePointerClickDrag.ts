/**
 * A press on the globe, told apart from a drag (ADR-0002's click and drag, moved out of
 * Enhanced3DGlobeInteractivity whole): a press that comes up within DRAG_THRESHOLD_PX and CLICK_TIME_THRESHOLD_MS
 * is a click, on the mark hovered or else on the globe where it was. And the pointer's listeners, with the move
 * handler given.
 */
import type React from 'react';
import { useCallback, useEffect } from 'react';
import { isPrimaryButton, type GlobeClickClaim } from '../../../components/Globe/globeClick';
import { placePick } from '../../../services/intel/place/placePick';
import { createLogger } from '@utils/logger';
import { CLICK_TIME_THRESHOLD_MS, DRAG_THRESHOLD_PX, type SetInteractionState } from './interactionState';

const log = createLogger({ prefix: 'Enhanced3DGlobeInteractivity' });

interface UsePointerClickDragOptions {
  listensForClicks: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  setUnifiedInteractionState: SetInteractionState;
  /** What is under the pointer, for the layers beneath (globeClick.ts): nothing once it leaves the globe. */
  pointerOverRef: React.MutableRefObject<GlobeClickClaim>;
  /** Where the last primary click landed, in the viewport: the menu at the click opens there (K8). */
  clickPointRef: React.MutableRefObject<{ x: number; y: number }>;
  isDraggingRef: React.MutableRefObject<boolean>;
  onMove: (event: MouseEvent) => void;
  /** A press starts: the move handler detects drags at once. */
  onPress: () => void;
}

export function usePointerClickDrag({
  listensForClicks,
  containerRef,
  setUnifiedInteractionState,
  pointerOverRef,
  clickPointRef,
  isDraggingRef,
  onMove,
  onPress,
}: UsePointerClickDragOptions): void {
  // COMPREHENSIVE MOUSE DOWN HANDLER
  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (!listensForClicks || !containerRef.current) return;
    // Only the primary button presses a marker; a right-click is for the globe menu.
    // See globeClick.ts for what picking on it did.
    if (!isPrimaryButton(event)) return;
    // That click gives a report its place (useGlobePlacePick); a report's popup
    // opened by it too stayed over the form.
    if (placePick.isPending()) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (process.env.NODE_ENV === 'development') {
      log.debug('🖱️ COMPREHENSIVE Handler - Mouse Down:', { x, y, timestamp: Date.now() });
    }

    // Reset frame skip counter for immediate drag detection
    onPress();

    // Batch all mouse down state updates
    setUnifiedInteractionState(prev => ({
      ...prev,
      isMouseDown: true,
      dragStartPos: { x, y },
      currentPos: { x, y },
      dragDistance: 0,
      mouseDownTime: Date.now(),
      isDragging: false,
      hasDraggedPastThreshold: false
    }));
  }, [listensForClicks, containerRef, onPress, setUnifiedInteractionState]);

  // COMPREHENSIVE MOUSE UP HANDLER
  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (!listensForClicks) return;
    // Off the globe, nothing of this layer is under the pointer.
    if (event.type === 'mouseleave') pointerOverRef.current = { mark: false, area: false };
    // Releasing another button mid-press is not the end of a primary click.
    if (!isPrimaryButton(event)) return;
    // Where a menu at the click opens (K8).
    clickPointRef.current = { x: event.clientX, y: event.clientY };

    log.debug('🖱️ COMPREHENSIVE Handler - Mouse up event at:', event.clientX, event.clientY);

    // Reset dragging ref immediately
    isDraggingRef.current = false;

    setUnifiedInteractionState(prev => {
      if (!prev.isMouseDown) return prev;

      const currentTime = Date.now();
      const timeSinceMouseDown = currentTime - prev.mouseDownTime;

      // Determine if this was a click or drag based on distance and time
      const wasClick = !prev.hasDraggedPastThreshold && timeSinceMouseDown < CLICK_TIME_THRESHOLD_MS;

      if (process.env.NODE_ENV === 'development') {
        log.debug('🖱️ COMPREHENSIVE Handler - Mouse Up Analysis:', {
          dragDistance: prev.dragDistance,
          dragThreshold: DRAG_THRESHOLD_PX,
          timeSinceMouseDown,
          timeThreshold: CLICK_TIME_THRESHOLD_MS,
          hasDraggedPastThreshold: prev.hasDraggedPastThreshold,
          wasClick,
          hoveredModel: prev.hoveredModel?.report?.title || 'none',
          globePosition: prev.globeHoverPosition
        });
      }

      // Handle click actions
      if (wasClick && prev.hoveredModel) {
        if (process.env.NODE_ENV === 'development') {
          log.debug('✅ COMPREHENSIVE Handler - Processing intel model click:', prev.hoveredModel.report.title);
        }
        return {
          ...prev,
          clickedModel: prev.hoveredModel,
          isMouseDown: false,
          isDragging: false,
          hasDraggedPastThreshold: false
        };
      } else if (wasClick && prev.globeHoverPosition) {
        if (process.env.NODE_ENV === 'development') {
          log.debug('✅ COMPREHENSIVE Handler - Globe click at:', prev.globeHoverPosition);
        }
        // No mark there: the outlined territories there, if any (BA9). The right
        // button's context menu is its own handler.
        return {
          ...prev,
          clickedGlobeAt: prev.globeHoverPosition,
          isMouseDown: false,
          isDragging: false,
          hasDraggedPastThreshold: false,
          dragDistance: 0
        };
      }

      // Reset interaction state
      return {
        ...prev,
        isMouseDown: false,
        isDragging: false,
        hasDraggedPastThreshold: false,
        dragDistance: 0
      };
    });
  }, [listensForClicks, pointerOverRef, clickPointRef, isDraggingRef, setUnifiedInteractionState]);

  // Set up unified mouse event listeners
  useEffect(() => {
    if (!listensForClicks || !containerRef.current) return;

    const container = containerRef.current;

    container.addEventListener('mousemove', onMove);
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseUp); // Reset on mouse leave

    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [listensForClicks, containerRef, onMove, handleMouseDown, handleMouseUp]);
}
