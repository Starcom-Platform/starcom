import React from 'react';

// Core floating panel types
export interface FloatingPanelPosition {
  /**
   * `work-area`: x and y are proportions (0–1) of the work area, the box the
   * chrome leaves clear, naming where the panel's centre should be. 0.5, 1 is
   * bottom-centre; the frame clamps the panel inside, so 1 means "as low as it fits".
   */
  anchorTo: 'geographic' | 'orbital' | 'magnetic' | 'screen' | 'work-area';
  lat?: number;
  lng?: number;
  x?: number; // Screen coordinates, or a proportion of the work area
  y?: number;
  offset: { x: number; y: number };
}

export interface FloatingPanelData {
  [key: string]: unknown;
}

export interface FloatingPanel {
  id: string;
  type: 'bubble' | 'stream' | 'control' | 'alert' | 'wide';
  title: string;
  component: React.ComponentType<{ data?: FloatingPanelData }>;
  position: FloatingPanelPosition;
  priority: 'primary' | 'secondary' | 'tertiary';
  triggers: string[];
  isVisible: boolean;
  isMinimized?: boolean;
  zIndex: number;
  data?: FloatingPanelData;
}

export interface GlobeInteraction {
  hoveredRegion: string | null;
  clickedPosition: { lat: number; lng: number } | null;
  activeFeatures: string[];
}

export interface FloatingPanelContextType {
  registerPanel: (panel: Omit<FloatingPanel, 'isVisible' | 'zIndex'>) => void;
  activePanels: FloatingPanel[];
  globeInteraction: GlobeInteraction;
  simulateGlobeHover: (region: string | null) => void;
  simulateGlobeClick: (lat: number, lng: number) => void;
  addActiveFeature: (feature: string) => void;
  removeActiveFeature: (feature: string) => void;
}

// Context for floating panels
export const FloatingPanelContext = React.createContext<FloatingPanelContextType | null>(null);

export const useFloatingPanels = () => {
  const context = React.useContext(FloatingPanelContext);
  if (!context) {
    throw new Error('useFloatingPanels must be used within FloatingPanelManager');
  }
  return context;
};

/** The floating panels where their manager is mounted, else null: the command palette's source reads them (D-CP). */
export const useFloatingPanelsOptional = () => React.useContext(FloatingPanelContext);
