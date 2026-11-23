import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useVisualizationMode } from '../../../context/VisualizationModeContext';
import { useGlobeContext } from '../../../context/GlobeContext';
import { FloatingPanelContext, FloatingPanel } from './FloatingPanelContext';
import styles from './FloatingPanelManager.module.css';
import { latLngToGlobeLocal } from '../../../utils/globeCoordinates';
import FloatingPanelFrame from './FloatingPanelFrame';
import { resolveAnchor } from './panelAnchor';

interface FloatingPanelManagerProps {
  children?: React.ReactNode;
}

/**
 * The active features that are keeping a panel open.
 *
 * Closing a panel has to withdraw these. It used to only hide the panel and
 * leave its feature active, so the next panel opened anywhere re-evaluated every
 * trigger and brought the closed one back: close the timeline, open the node
 * graph, and the timeline returned on top of it.
 */
const featuresShowing = (triggers: string[], activeFeatures: string[]): string[] =>
  triggers.flatMap((trigger) =>
    // 'solar-flare' is also shown by a feature with a different name.
    (trigger === 'solar-flare' ? ['solar-activity', 'solar-flare'] : [trigger])
      .filter((feature) => activeFeatures.includes(feature)));

const FloatingPanelManager: React.FC<FloatingPanelManagerProps> = ({ children }) => {
  /*
   * Panels are suppressed only when something explicitly asks for it.
   *
   * This used to sniff the user agent for "HeadlessChrome" and hide every panel
   * when it matched. That made the subsystem invisible to exactly the tool that
   * would verify it: three separate attempts to check whether panels rendered
   * came back empty, and the reason was that the app could tell it was being
   * watched. A feature no automated check can ever see is a feature that can
   * break without anything reporting it — which is what happened.
   *
   * The opt-out stays, because a test driving globe interactions genuinely does
   * not want panels intercepting its clicks. It is now something a test states
   * rather than something the app infers.
   */
  const isTestMode = typeof document !== 'undefined' && !!document.querySelector('[data-test-mode]');

  const [activePanels, setActivePanels] = useState<Map<string, FloatingPanel>>(new Map());
  const [globeInteraction, setGlobeInteraction] = useState<{
    hoveredRegion: string | null;
    clickedPosition: { lat: number; lng: number } | null;
    activeFeatures: string[];
  }>({
    hoveredRegion: null,
    clickedPosition: null,
    activeFeatures: []
  });

  // Drag state
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    draggedPanelId: string | null;
    dragOffset: { x: number; y: number };
    originalPosition: { x: number; y: number };
    lastUpdate: number;
  }>({
    isDragging: false,
    draggedPanelId: null,
    dragOffset: { x: 0, y: 0 },
    originalPosition: { x: 0, y: 0 },
    lastUpdate: 0
  });

  const { visualizationMode } = useVisualizationMode();
  const { focusLocation } = useGlobeContext();
  const panelContainerRef = useRef<HTMLDivElement>(null);

  // Sync globe focus location with floating panel clicked position
  useEffect(() => {
    if (focusLocation) {
      setGlobeInteraction(prev => ({
        ...prev,
        clickedPosition: focusLocation
      }));
    }
  }, [focusLocation]);

  // Convert geographic coordinates to screen position
  const geoToScreen = useCallback((lat: number, lng: number) => {
    // This will integrate with the actual globe component
    // For now, using a simple projection
    const globeCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const globeRadius = Math.min(window.innerWidth, window.innerHeight) * 0.3;

    const point = latLngToGlobeLocal(lat, lng, globeRadius);

    const x = globeCenter.x + point.x;
    const y = globeCenter.y + point.y;
    
    return { x, y };
  }, []);

  // Register a new floating panel
  const registerPanel = useCallback((panel: Omit<FloatingPanel, 'isVisible' | 'zIndex' | 'isMinimized'>) => {
    setActivePanels(prev => {
      const newPanels = new Map(prev);
      newPanels.set(panel.id, {
        ...panel,
        isVisible: false,
        isMinimized: false,
        zIndex: 1000 + newPanels.size
      });
      return newPanels;
    });
  }, []);

  // Show/hide panels based on triggers
  const evaluatePanelVisibility = useCallback(() => {
    setActivePanels(prev => {
      const newPanels = new Map(prev);
      
      newPanels.forEach((panel, id) => {
        // A feature shows a panel until the feature is withdrawn; hover and click
        // conditions show it for as long as they hold.
        let shouldShow = featuresShowing(panel.triggers, globeInteraction.activeFeatures).length > 0
          || panel.triggers.some((trigger) =>
            (trigger === 'hover-polar' && globeInteraction.hoveredRegion === 'polar')
            || (trigger === 'click-anywhere' && !!globeInteraction.clickedPosition));
        
        // Check priority level
        const currentPriority = visualizationMode.subMode === 'SpaceWeather' ? 'primary' : 
                              visualizationMode.subMode === 'EcologicalDisasters' ? 'secondary' : 'tertiary';
        
        if (panel.priority === 'secondary' && currentPriority === 'primary') shouldShow = false;
        if (panel.priority === 'tertiary' && currentPriority !== 'tertiary') shouldShow = false;
        
        newPanels.set(id, { ...panel, isVisible: shouldShow });
      });
      
      return newPanels;
    });
  }, [globeInteraction, visualizationMode]);

  // Update panel visibility when globe interaction changes
  useEffect(() => {
    evaluatePanelVisibility();
  }, [evaluatePanelVisibility]);

  // Simulate globe interaction (will be replaced with real globe integration)
  const simulateGlobeHover = useCallback((region: string | null) => {
    setGlobeInteraction(prev => ({ ...prev, hoveredRegion: region }));
  }, []);

  const simulateGlobeClick = useCallback((lat: number, lng: number) => {
    setGlobeInteraction(prev => ({ ...prev, clickedPosition: { lat, lng } }));
  }, []);

  const addActiveFeature = useCallback((feature: string) => {
    setGlobeInteraction(prev => ({
      ...prev,
      activeFeatures: [...prev.activeFeatures.filter(f => f !== feature), feature]
    }));
  }, []);

  const removeActiveFeature = useCallback((feature: string) => {
    setGlobeInteraction(prev => ({
      ...prev,
      activeFeatures: prev.activeFeatures.filter(f => f !== feature)
    }));
  }, []);

  // Drag handlers for moveable panels
  const handleDragStart = useCallback((e: React.MouseEvent, panelId: string) => {
    e.preventDefault();
    const panel = activePanels.get(panelId);
    if (!panel) return;

    // Start from where the panel is, not where it was asked to be. The frame can
    // clamp a panel well away from its anchor: one anchored to the bottom of the
    // work area sits half its own height above it, so a drag measured from the
    // anchor would not move the panel until it had travelled that far.
    const rendered = document.querySelector(`[data-panel-id="${panelId}"]`)?.getBoundingClientRect();
    const screenPosition = rendered && rendered.width > 0
      ? { x: rendered.left + rendered.width / 2, y: rendered.top + rendered.height / 2 }
      : resolveAnchor(panel.position, geoToScreen);

    setDragState({
      isDragging: true,
      draggedPanelId: panelId,
      dragOffset: {
        x: e.clientX - screenPosition.x,
        y: e.clientY - screenPosition.y
      },
      originalPosition: screenPosition,
      lastUpdate: 0
    });

    // Bring it to the front, and pin its anchor to where it is drawn. The frame
    // follows the pointer from the anchor, so a panel still anchored to, say, the
    // bottom of the work area would otherwise jump there the moment it was pressed.
    setActivePanels(prev => {
      const newPanels = new Map(prev);
      const maxZ = Math.max(...Array.from(newPanels.values()).map(p => p.zIndex));
      newPanels.set(panelId, {
        ...panel,
        zIndex: maxZ + 1,
        position: { ...panel.position, anchorTo: 'screen', x: screenPosition.x, y: screenPosition.y, offset: { x: 0, y: 0 } },
      });
      return newPanels;
    });
  }, [activePanels, geoToScreen]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging || !dragState.draggedPanelId) return;

    // Throttle updates to improve performance
    const now = Date.now();
    if (now - dragState.lastUpdate < 16) return; // ~60fps

    const newX = e.clientX - dragState.dragOffset.x;
    const newY = e.clientY - dragState.dragOffset.y;

    // Constrain to viewport boundaries
    const constrainedX = Math.max(100, Math.min(window.innerWidth - 100, newX));
    const constrainedY = Math.max(60, Math.min(window.innerHeight - 100, newY));

    // Update drag state with new timestamp
    setDragState(prev => ({ ...prev, lastUpdate: now }));

    // Update panel position
    setActivePanels(prev => {
      const newPanels = new Map(prev);
      const panel = newPanels.get(dragState.draggedPanelId!);
      if (panel) {
        newPanels.set(dragState.draggedPanelId!, {
          ...panel,
          position: {
            ...panel.position,
            anchorTo: 'screen',
            x: constrainedX,
            y: constrainedY,
            offset: { x: 0, y: 0 }
          }
        });
      }
      return newPanels;
    });
  }, [dragState]);

  const handleDragEnd = useCallback(() => {
    setDragState({
      isDragging: false,
      draggedPanelId: null,
      dragOffset: { x: 0, y: 0 },
      originalPosition: { x: 0, y: 0 },
      lastUpdate: 0
    });
  }, []);

  // Add global mouse event listeners for dragging
  useEffect(() => {
    if (dragState.isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [dragState.isDragging, handleDragMove, handleDragEnd]);

  // Render floating panels
  const renderPanels = () => {
    return Array.from(activePanels.values())
      .filter(panel => panel.isVisible)
      .map(panel => {
        // Resolve the anchor to a point. Clamping that point into the work area
        // needs the panel's own size, so the frame does it — see
        // FloatingPanelFrame, and the Intelligence Dashboard that used to render
        // its title bar 70px above the top of the screen.
        const anchor = resolveAnchor(panel.position, geoToScreen);

        const update = (change: Partial<FloatingPanel>) =>
          setActivePanels(prev => {
            const next = new Map(prev);
            const current = next.get(panel.id);
            if (current) next.set(panel.id, { ...current, ...change });
            return next;
          });

        return (
          <FloatingPanelFrame
            key={panel.id}
            panel={panel}
            anchor={anchor}
            isDragging={dragState.draggedPanelId === panel.id}
            onDragStart={(e) => handleDragStart(e, panel.id)}
            onToggleMinimize={() => update({ isMinimized: !panel.isMinimized })}
            onClose={() => {
              // Withdraw what was keeping it open, or the next panel opened anywhere
              // re-evaluates the triggers and brings this one straight back.
              featuresShowing(panel.triggers, globeInteraction.activeFeatures).forEach((f) => removeActiveFeature(f));
              update({ isVisible: false });
            }}
          />
        );
      });
  };

  // Provide context for child components
  const contextValue = {
    registerPanel,
    activePanels: Array.from(activePanels.values()),
    globeInteraction,
    simulateGlobeHover,
    simulateGlobeClick,
    addActiveFeature,
    removeActiveFeature
  };

  return (
    <FloatingPanelContext.Provider value={contextValue}>
      <div ref={panelContainerRef} className={styles.floatingPanelManager}>
        {children}
        {/* Conditionally render panels - disable in test mode to prevent interaction interference */}
        {/*
          * Portalled to document.body so a panel is never clipped by the HUD's
          * overflow, and never inherits a stacking context from it.
          *
          * The condition used to include `panelContainerRef.current`, read here
          * during render. React does not re-render when a ref changes, so the
          * portal's presence depended on whether some unrelated state happened to
          * update after the ref was attached — and the panels flickered in and
          * straight back out. The ref is not needed for this at all.
          */}
        {!isTestMode && createPortal(
          <div className={styles.panelOverlay}>
            {renderPanels()}
          </div>,
          document.body
        )}
      </div>
    </FloatingPanelContext.Provider>
  );
};

export default FloatingPanelManager;
