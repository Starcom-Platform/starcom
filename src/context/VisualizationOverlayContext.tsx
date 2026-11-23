import React, { useMemo, useState, useCallback } from 'react';
import { VisualizationOverlayContext } from './VisualizationOverlayContextStore';

const STORAGE_KEY = 'visualization-overlay-settings';

const loadInitialNationalTerritoriesOverlayEnabled = (): boolean => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return true;
    }
    const parsed = JSON.parse(raw) as { nationalTerritoriesOverlayEnabled?: boolean };
    return parsed.nationalTerritoriesOverlayEnabled !== false;
  } catch {
    return true;
  }
};

const loadInitialCursorTrailIndicatorEnabled = (): boolean => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return true;
    }
    const parsed = JSON.parse(raw) as { cursorTrailIndicatorEnabled?: boolean };
    return parsed.cursorTrailIndicatorEnabled !== false;
  } catch {
    return true;
  }
};

// ResourceZones now renders real per-country data (EIA international production,
// World Bank water resources, USGS minerals, UN Comtrade trade flows — see
// resourceZoneTheme.ts and useResourceZonePercentiles.ts) — still defaults OFF so
// existing users don't suddenly see a new pinned overlay appear; explicit opt-in via
// the settings panel.
const loadInitialResourceZonesOverlayEnabled = (): boolean => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw) as { resourceZonesOverlayEnabled?: boolean };
    return parsed.resourceZonesOverlayEnabled === true;
  } catch {
    return false;
  }
};

// DiplomaticEvents now renders real data too (GDELT's Event Database — see
// GDELTEventService.ts) — still defaults OFF for the same reason ResourceZones does,
// so existing users don't suddenly see a new pinned overlay appear uninvited.
const loadInitialDiplomaticEventsOverlayEnabled = (): boolean => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw) as { diplomaticEventsOverlayEnabled?: boolean };
    return parsed.diplomaticEventsOverlayEnabled === true;
  } catch {
    return false;
  }
};

// ConflictZones' overlay lost its rail button to War & Conflict's (owner, 1 Nov), and nothing else turns it on or off,
// so it is never restored: one saved on would draw in every mode with no way to stop it. War & Conflict's overlay starts
// on in its place (services/globe/warConflictOverlay.ts).
const loadInitialConflictZonesOverlayEnabled = (): boolean => false;

export const VisualizationOverlayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [nationalTerritoriesOverlayEnabled, setNationalTerritoriesOverlayEnabledState] = useState<boolean>(() => loadInitialNationalTerritoriesOverlayEnabled());
  const [cursorTrailIndicatorEnabled, setCursorTrailIndicatorEnabledState] = useState<boolean>(() => loadInitialCursorTrailIndicatorEnabled());
  const [resourceZonesOverlayEnabled, setResourceZonesOverlayEnabledState] = useState<boolean>(() => loadInitialResourceZonesOverlayEnabled());
  const [diplomaticEventsOverlayEnabled, setDiplomaticEventsOverlayEnabledState] = useState<boolean>(() => loadInitialDiplomaticEventsOverlayEnabled());
  const [conflictZonesOverlayEnabled, setConflictZonesOverlayEnabledState] = useState<boolean>(() => loadInitialConflictZonesOverlayEnabled());

  const persist = useCallback((territoriesEnabled: boolean, cursorTrailEnabled: boolean, resourceZonesEnabled: boolean, diplomaticEventsEnabled: boolean, conflictZonesEnabled: boolean) => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          nationalTerritoriesOverlayEnabled: territoriesEnabled,
          cursorTrailIndicatorEnabled: cursorTrailEnabled,
          resourceZonesOverlayEnabled: resourceZonesEnabled,
          diplomaticEventsOverlayEnabled: diplomaticEventsEnabled,
          conflictZonesOverlayEnabled: conflictZonesEnabled
        })
      );
    } catch {
      // ignore storage failures
    }
  }, []);

  const setNationalTerritoriesOverlayEnabled = useCallback((enabled: boolean) => {
    setNationalTerritoriesOverlayEnabledState(enabled);
    persist(enabled, cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled);
  }, [cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled, persist]);

  const toggleNationalTerritoriesOverlay = useCallback(() => {
    setNationalTerritoriesOverlayEnabledState((previous) => {
      const next = !previous;
      persist(next, cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled);
      return next;
    });
  }, [cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled, persist]);

  const setCursorTrailIndicatorEnabled = useCallback((enabled: boolean) => {
    setCursorTrailIndicatorEnabledState(enabled);
    persist(nationalTerritoriesOverlayEnabled, enabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled);
  }, [nationalTerritoriesOverlayEnabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled, persist]);

  const toggleCursorTrailIndicator = useCallback(() => {
    setCursorTrailIndicatorEnabledState((previous) => {
      const next = !previous;
      persist(nationalTerritoriesOverlayEnabled, next, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled);
      return next;
    });
  }, [nationalTerritoriesOverlayEnabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled, persist]);

  const setResourceZonesOverlayEnabled = useCallback((enabled: boolean) => {
    setResourceZonesOverlayEnabledState(enabled);
    persist(nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, enabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled);
  }, [nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled, persist]);

  const toggleResourceZonesOverlay = useCallback(() => {
    setResourceZonesOverlayEnabledState((previous) => {
      const next = !previous;
      persist(nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, next, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled);
      return next;
    });
  }, [nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, diplomaticEventsOverlayEnabled, conflictZonesOverlayEnabled, persist]);

  const setDiplomaticEventsOverlayEnabled = useCallback((enabled: boolean) => {
    setDiplomaticEventsOverlayEnabledState(enabled);
    persist(nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, enabled, conflictZonesOverlayEnabled);
  }, [nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, conflictZonesOverlayEnabled, persist]);

  const toggleDiplomaticEventsOverlay = useCallback(() => {
    setDiplomaticEventsOverlayEnabledState((previous) => {
      const next = !previous;
      persist(nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, next, conflictZonesOverlayEnabled);
      return next;
    });
  }, [nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, conflictZonesOverlayEnabled, persist]);

  const setConflictZonesOverlayEnabled = useCallback((enabled: boolean) => {
    setConflictZonesOverlayEnabledState(enabled);
    persist(nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, enabled);
  }, [nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, persist]);

  const toggleConflictZonesOverlay = useCallback(() => {
    setConflictZonesOverlayEnabledState((previous) => {
      const next = !previous;
      persist(nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, next);
      return next;
    });
  }, [nationalTerritoriesOverlayEnabled, cursorTrailIndicatorEnabled, resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, persist]);

  const contextValue = useMemo(
    () => ({
      nationalTerritoriesOverlayEnabled,
      setNationalTerritoriesOverlayEnabled,
      toggleNationalTerritoriesOverlay,
      cursorTrailIndicatorEnabled,
      setCursorTrailIndicatorEnabled,
      toggleCursorTrailIndicator,
      resourceZonesOverlayEnabled,
      setResourceZonesOverlayEnabled,
      toggleResourceZonesOverlay,
      diplomaticEventsOverlayEnabled,
      setDiplomaticEventsOverlayEnabled,
      toggleDiplomaticEventsOverlay,
      conflictZonesOverlayEnabled,
      setConflictZonesOverlayEnabled,
      toggleConflictZonesOverlay
    }),
    [
      nationalTerritoriesOverlayEnabled,
      setNationalTerritoriesOverlayEnabled,
      toggleNationalTerritoriesOverlay,
      cursorTrailIndicatorEnabled,
      setCursorTrailIndicatorEnabled,
      toggleCursorTrailIndicator,
      resourceZonesOverlayEnabled,
      setResourceZonesOverlayEnabled,
      toggleResourceZonesOverlay,
      diplomaticEventsOverlayEnabled,
      setDiplomaticEventsOverlayEnabled,
      toggleDiplomaticEventsOverlay,
      conflictZonesOverlayEnabled,
      setConflictZonesOverlayEnabled,
      toggleConflictZonesOverlay
    ]
  );

  return (
    <VisualizationOverlayContext.Provider value={contextValue}>
      {children}
    </VisualizationOverlayContext.Provider>
  );
};
