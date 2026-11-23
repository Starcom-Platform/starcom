import { createContext } from 'react';

export interface VisualizationOverlayContextType {
  nationalTerritoriesOverlayEnabled: boolean;
  setNationalTerritoriesOverlayEnabled: (enabled: boolean) => void;
  toggleNationalTerritoriesOverlay: () => void;
  cursorTrailIndicatorEnabled: boolean;
  setCursorTrailIndicatorEnabled: (enabled: boolean) => void;
  toggleCursorTrailIndicator: () => void;
  resourceZonesOverlayEnabled: boolean;
  setResourceZonesOverlayEnabled: (enabled: boolean) => void;
  toggleResourceZonesOverlay: () => void;
  diplomaticEventsOverlayEnabled: boolean;
  setDiplomaticEventsOverlayEnabled: (enabled: boolean) => void;
  toggleDiplomaticEventsOverlay: () => void;
  conflictZonesOverlayEnabled: boolean;
  setConflictZonesOverlayEnabled: (enabled: boolean) => void;
  toggleConflictZonesOverlay: () => void;
}

export const VisualizationOverlayContext = createContext<VisualizationOverlayContextType | undefined>(undefined);
