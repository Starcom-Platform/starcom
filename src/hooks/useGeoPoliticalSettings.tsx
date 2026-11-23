import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { settingsStorage } from '../utils/settingsStorage';
import { verifyGeopoliticalAssets } from '../geopolitical/integrity/verifyGeopoliticalAssets';
import { nationalTerritoriesService } from '../geopolitical/services/NationalTerritoriesService';
import { useVisualizationOverlay } from './useVisualizationOverlay';
import {
  DEFAULT_TERRITORY_STYLE,
  TERRITORY_STYLES,
  isTerritoryStyle,
  quietChangesFromLegacy,
  territoryLookOf,
  withLookChange,
  TERRITORY_CROSS_FADE_MS,
  type TerritoryLook,
  type TerritoryLookChange,
  type TerritoryStyle,
  type TerritoryStyleSettings,
} from '../geopolitical/theme/territoryStyles';
import type { DiplomaticEventCategory } from '../geopolitical/theme/diplomaticEventTheme';

// AI-NOTE: Hook to manage GeoPolitical visualization settings with localStorage persistence
// Used by GeoPoliticalSettings component and can be consumed by geopolitical visualizations
//
// Context-backed (not a bare useState hook): Globe.tsx (the 3D layers) and any settings
// UI (e.g. GeopoliticalLayersPopup) must observe the *same* config instance, or toggling a
// setting in a popup would update only that popup's own local state while the globe kept
// rendering the old value. CountryInfoPopup/GlobalHeader/SettingsInitializer also read this
// hook — they get the same fix for free.

export interface GeoPoliticalConfig {
  // National Territories settings
  nationalTerritories: {
    /**
     * Which look the fills and borders take on screen (decision K5,
     * territoryStyles.ts). Unset means DEFAULT_TERRITORY_STYLE, derived on every
     * read; read through the API it is always set.
     */
    style?: TerritoryStyle;
    /** What a person changed in each style, and nothing else (TS6). */
    styleSettings?: TerritoryStyleSettings;
    /*
     * The four look fields below, as the API hands them out, are the screen style's
     * look (territoryLookOf), and a change to them is stored as a change to that
     * style. Stored, they are what a browser held before K5: read once, by the v3
     * migration, and never written again.
     */
    borderVisibility: number; // 0-100
    borderThickness: number; // 0.5-5.0
    territoryColors: {
      useCustomColors: boolean;
      /*
       * There was a `colorScheme` here: 'default' | 'political' | 'economic' |
       * 'population'. It picked which four-colour palette a country's id was
       * hashed into, so the names promised an encoding the colours never had,
       * and two palettes drew settled borders in provisional colours. Removed
       * with the hash on 2026-09-19 (decision D-F; see materialTheme.ts). A value
       * already stored under it is ignored.
       */
      opacity: number; // 0-100
    };
  // Motion/accessibility
  reducedMotion?: boolean; // prefer minimal/no easing
  /**
   * How long a change of detail cross-fades, and the layer fades in, in ms, 0–2000
   * (decision K5, step 5). Motion, not a style's look: one for the layer. Reduced
   * motion still makes it instant. Absent in settings stored before it: 500.
   */
  crossFadeMs?: number;
  // Picking/interaction flags
  bvhPicking?: boolean; // enable three-mesh-bvh accelerated picking
  // Rendering controls (Stage 1 flags)
  fillElevationEpsilon?: number; // default ≈0.5 (0.5% of radius when unspecified)
  usePolygonOffset?: boolean; // default true
  polygonOffsetFactor?: number; // default -1.5
  polygonOffsetUnits?: number; // default -1.5
  frontSideOnly?: boolean; // default true
    showDisputedTerritories: boolean;
    showMaritimeBorders: boolean;
    labelVisibility: number; // 0-100
    highlightOnHover: boolean;
    lod?: {
      mode: 'auto' | 'locked';
      lockedLevel: 0 | 1 | 2;
      hysteresis: number; // distance margin (units)
    };
  };
  
  // Diplomatic Events settings
  // 'conflicts' and 'sanctions' were dropped: real data only comes from GDELT's
  // cooperative/diplomatic CAMEO codes (03-08), which don't cover either — conflict
  // data belongs to a future dedicated ConflictZones sub-mode (ACLED/UCDP), and
  // sanctions needs real entity-to-country aggregation design not yet done (OFAC's
  // list is entity-level, not country-level). See GDELTEventService.ts.
  diplomaticEvents: {
    /** Each cooperative CAMEO category, shown or not (decision D-DP, DP4). */
    eventTypes: Record<DiplomaticEventCategory, boolean>;
    // There was a timeRange here, hours back from the snapshot: a second cursor. The shared time decides (D-DP, DP15).
    markerSize: number; // 0.5-3.0
    showConnections: boolean;
    connectionOpacity: number; // 0-100
    animateEvents: boolean;
    /**
     * What is shown of the day's events (decision D-DP, DP10), each choice saying in the layers
     * popup how many events it keeps. A Goldstein floor and a regions list were here; see v5 below.
     */
    filters: {
      /** Stories told by at least this many distinct outlets (diplomaticStories.ts). */
      minOutlets: 1 | 2 | 5;
      /** GDELT's QuadClass: verbal cooperation, material cooperation, or both. */
      saidOrDone: 'both' | 'said' | 'done';
      /** The coder's confidence, from GDELT's Mentions table, at least this percent; 0 for any. */
      minConfidence: 0 | 50 | 80;
      /** Only events GDELT found in a lead paragraph (IsRootEvent). */
      leadOnly: boolean;
    };
    /**
     * Where the marks stand (D-DP, DP2): where each event happened, the place GDELT read in the
     * report; or at each country involved, at its centre, which is how the layer drew before.
     */
    placeBy: 'event' | 'actors';
  };
  
  // Resource Zones settings
  resourceZones: {
    resourceTypes: {
      oil: boolean;
      gas: boolean;
      minerals: boolean;
      water: boolean;
      renewable: boolean;
    };
    showProductionRates: boolean;
    showReserveData: boolean;
    zoneOpacity: number; // 0-100
    showTradeRoutes: boolean;
    tradeRouteIntensity: number; // 0-100
    conflictZones: {
      show: boolean;
      highlightDisputed: boolean;
      alertLevel: 'low' | 'medium' | 'high';
    };
  };
  
  // Conflict Zones settings — two real-data layers: GDELT conflict/violence events
  // (root codes 14-20, see GDELTEventService.getRealConflictEvents) and UNHCR
  // per-country displacement magnitudes (see UNHCRDisplacementService).
  conflictZones: {
    layerTypes: {
      warEvents: boolean;
      humanitarianCrisis: boolean;
    };
    // The shared time decides what is shown, as for Diplomacy (D-DP, DP15): the timeRange went.
    markerSize: number; // 0.5-3.0
  };

  // Global GeoPolitical settings
  globalSettings: {
    mapProjection: 'mercator' | 'equirectangular' | 'orthographic';
    showCoordinateGrid: boolean;
    gridOpacity: number; // 0-100
    enableTooltips: boolean;
    dataUpdateInterval: number; // minutes
    autoRefresh: boolean;
    interfaceTheme: 'light' | 'dark' | 'auto';
  };
}

const defaultConfig: GeoPoliticalConfig = {
  nationalTerritories: {
    borderVisibility: 70,
    borderThickness: 1.0,
    territoryColors: {
      useCustomColors: false,
      opacity: 50
    },
  reducedMotion: false,
  bvhPicking: true,
  /*
   * How far the country fills stand off the surface, in scene units (100 = 1 Earth
   * radius). 0.2 puts the base map at the bottom of the stack (globeAltitudes.ts).
   * Until 2026-09-11 this number reached only the legacy GeoJSON builder; the baked
   * builder every deploy uses ignored it and stood the fills at 3.5 — 223 km up,
   * in front of every mark the other layers drew. See territoryFillScale().
   */
  fillElevationEpsilon: 0.2,
  crossFadeMs: TERRITORY_CROSS_FADE_MS.default,
  usePolygonOffset: true,
  polygonOffsetFactor: -1.5,
  polygonOffsetUnits: -1.5,
  frontSideOnly: false,
    showDisputedTerritories: true,
    showMaritimeBorders: false,
    labelVisibility: 60,
    highlightOnHover: true,
    lod: { mode: 'auto', lockedLevel: 2, hysteresis: 25 }
  },
  
  diplomaticEvents: {
    eventTypes: { intent: true, consult: true, diplomatic: true, agreement: true, material: true, aid: true, yield: true },
    markerSize: 1.0,
    showConnections: true,
    connectionOpacity: 40,
    animateEvents: true,
    filters: { minOutlets: 1, saidOrDone: 'both', minConfidence: 0, leadOnly: false },
    placeBy: 'event',
  },
  
  resourceZones: {
    resourceTypes: {
      oil: true,
      gas: true,
      minerals: true,
      water: false,
      renewable: false
    },
    showProductionRates: true,
    showReserveData: false,
    zoneOpacity: 60,
    showTradeRoutes: true,
    tradeRouteIntensity: 50,
    conflictZones: {
      show: true,
      highlightDisputed: true,
      alertLevel: 'medium'
    }
  },
  
  conflictZones: {
    layerTypes: {
      warEvents: true,
      humanitarianCrisis: true
    },
    markerSize: 1.0
  },

  globalSettings: {
    mapProjection: 'mercator',
    showCoordinateGrid: false,
    gridOpacity: 20,
    enableTooltips: true,
    dataUpdateInterval: 15,
    autoRefresh: true,
    interfaceTheme: 'dark'
  }
};

const STORAGE_KEY = 'geo-political-settings';

export interface GeoIntegrityStatus {
  status: 'idle' | 'verifying' | 'verified' | 'mismatch' | 'error';
  mismatchCount?: number;
  artifacts?: { path: string; status: string; bytes: number }[];
}

export interface GeoPoliticalLayerErrors {
  nationalTerritories: string | null;
  resourceZones: string | null;
  diplomaticEvents: string | null;
  conflictZones: string | null;
  zones: string | null;
  spheres: string | null;
  organisations: string | null;
}

type GeoPoliticalSettingsApi = ReturnType<typeof useGeoPoliticalSettingsState>;

const GeoPoliticalSettingsContext = createContext<GeoPoliticalSettingsApi | undefined>(undefined);

/** The style the screen draws: the stored one, or the default where none is stored. */
function styleOf(territories: GeoPoliticalConfig['nationalTerritories']): TerritoryStyle {
  return isTerritoryStyle(territories.style) ? territories.style : DEFAULT_TERRITORY_STYLE;
}

/** The territories' settings with the style set and the four look fields the screen style's look. */
function resolvedTerritories(territories: GeoPoliticalConfig['nationalTerritories']): GeoPoliticalConfig['nationalTerritories'] {
  const style = styleOf(territories);
  const look = territoryLookOf(style, territories.styleSettings);
  return {
    ...territories,
    style,
    territoryColors: { ...territories.territoryColors, opacity: look.fillOpacity },
    borderVisibility: look.borderVisibility,
    borderThickness: look.borderThickness,
    fillElevationEpsilon: look.height,
  };
}

function useGeoPoliticalSettingsState() {
  const [config, setConfig] = useState<GeoPoliticalConfig>(defaultConfig);

  // Asset-integrity verification and per-layer render errors used to live as local state
  // inside Globe.tsx, gated on `visualizationMode.mode === 'GeoPolitical'` — which only made
  // sense back when these three layers rendered exclusively in GeoPolitical mode. Now that
  // they're global overlays (toggleable from any mode), this lives here instead, gated on
  // whether any of the three overlays is actually on, so both Globe.tsx and
  // GeopoliticalLayersPopup observe the same status regardless of which is mounted.
  const {
    nationalTerritoriesOverlayEnabled,
    resourceZonesOverlayEnabled,
    diplomaticEventsOverlayEnabled,
    conflictZonesOverlayEnabled
  } = useVisualizationOverlay();
  const anyGeoOverlayEnabled = nationalTerritoriesOverlayEnabled || resourceZonesOverlayEnabled || diplomaticEventsOverlayEnabled || conflictZonesOverlayEnabled;

  const [geoIntegrity, setGeoIntegrity] = useState<GeoIntegrityStatus>({ status: 'idle' });
  useEffect(() => {
    if (!anyGeoOverlayEnabled) return;
    if (geoIntegrity.status !== 'idle') return;
    let cancelled = false;
    setGeoIntegrity({ status: 'verifying' });
    verifyGeopoliticalAssets({ includeClasses: ['topology', 'normalized'], maxBytes: 900000 })
      .then(r => { if (!cancelled) setGeoIntegrity({ status: r.ok ? 'verified' : 'mismatch', mismatchCount: r.mismatches.length, artifacts: r.artifacts.map(a => ({ path: a.path, status: a.status, bytes: a.bytes })) }); })
      .catch(() => { if (!cancelled) setGeoIntegrity({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [anyGeoOverlayEnabled, geoIntegrity.status]);

  // nationalTerritoriesService is a module-level singleton shared by all four overlays
  // (National Territories' own baked geometry, plus ResourceZones'/DiplomaticEvents'/
  // ConflictZones' use of its country centroids/directory) — its cache (up to ~3.2MB of
  // parsed LOD2 territory data, plus whichever other LOD tiers got touched) had no release
  // path at all: clearCache() existed on the service but nothing ever called it. Releasing
  // it the instant the last overlay disables would thrash on quick toggle-testing, so this
  // waits a minute after every overlay is off before actually freeing it — long enough that
  // a real "done with GeoPolitical for now" case gets its memory back, short enough that a
  // re-enable minutes later just re-fetches (real data, no fabrication either way).
  const cacheReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (anyGeoOverlayEnabled) {
      if (cacheReleaseTimerRef.current) {
        clearTimeout(cacheReleaseTimerRef.current);
        cacheReleaseTimerRef.current = null;
      }
      return;
    }
    cacheReleaseTimerRef.current = setTimeout(() => {
      nationalTerritoriesService.clearCache();
      cacheReleaseTimerRef.current = null;
    }, 60_000);
    return () => {
      if (cacheReleaseTimerRef.current) {
        clearTimeout(cacheReleaseTimerRef.current);
        cacheReleaseTimerRef.current = null;
      }
    };
  }, [anyGeoOverlayEnabled]);

  const [layerErrors, setLayerErrorsState] = useState<GeoPoliticalLayerErrors>({
    nationalTerritories: null,
    resourceZones: null,
    diplomaticEvents: null,
    conflictZones: null,
    zones: null,
    spheres: null,
    organisations: null
  });
  const setLayerError = useCallback((layer: keyof GeoPoliticalLayerErrors, error: string | null) => {
    setLayerErrorsState(prev => (prev[layer] === error ? prev : { ...prev, [layer]: error }));
  }, []);

  // Load settings from localStorage on mount
  useEffect(() => {
    const loadedConfig = settingsStorage.loadSettings(STORAGE_KEY, defaultConfig, {
      version: 7,
      migrations: {
        /*
         * A stored fillElevationEpsilon from v1 was never applied on the shipped
         * (baked) path, so no one chose the value it holds: anyone who dragged that
         * slider saw nothing happen. Take the new default instead of carrying a
         * number that would now stand the fills back up over everything.
         */
        2: (data) => ({
          ...data,
          nationalTerritories: {
            ...data.nationalTerritories,
            fillElevationEpsilon: defaultConfig.nationalTerritories.fillElevationEpsilon,
          },
        }),
        /*
         * Before K5 there was one look, now called Quiet, held in four fields. What a
         * browser had changed in them becomes a change to Quiet; values at the old
         * defaults were never anyone's choice, since the whole config was stored. The
         * style is left unset, so the browser takes the default, as a first visit does.
         */
        3: (data) => {
          const territories = data.nationalTerritories ?? defaultConfig.nationalTerritories;
          if (territories.styleSettings) return data;
          return {
            ...data,
            nationalTerritories: {
              ...territories,
              styleSettings: quietChangesFromLegacy({
                opacity: territories.territoryColors?.opacity,
                borderVisibility: territories.borderVisibility,
                borderThickness: territories.borderThickness,
                fillElevationEpsilon: territories.fillElevationEpsilon,
              }),
            },
          };
        },
        /*
         * D-DP, DP4: three categories were stored, under the names they were drawn with, and
         * four more join them, shown. What a browser turned off it keeps. Material cooperation
         * was off by default, and the whole config was stored, so its false was nobody's choice
         * (the stance of v3): it is on, as on a first visit.
         */
        4: (data) => {
          const events = data.diplomaticEvents ?? defaultConfig.diplomaticEvents;
          const stored = (events.eventTypes ?? {}) as Partial<Record<'treaties' | 'summits', boolean>>;
          if ('agreement' in stored) return data;
          return {
            ...data,
            diplomaticEvents: {
              ...events,
              eventTypes: {
                ...defaultConfig.diplomaticEvents.eventTypes,
                agreement: stored.treaties !== false,
                consult: stored.summits !== false,
              },
            },
          };
        },
        /*
         * D-DP, DP9–DP10: the Goldstein floor and the regions list go. Nothing set either: importance
         * was 'medium' for every browser, the regions filtered nothing. The filters filter nothing
         * until a person chooses one.
         */
        5: (data) => {
          const events = { ...(data.diplomaticEvents ?? defaultConfig.diplomaticEvents) } as Record<string, unknown>;
          delete events.eventFiltering;
          return {
            ...data,
            diplomaticEvents: {
              ...(events as unknown as GeoPoliticalConfig['diplomaticEvents']),
              filters: { ...defaultConfig.diplomaticEvents.filters, ...((events.filters as object | undefined) ?? {}) },
            },
          };
        },
        /*
         * D-DP, DP2: the marks stand where it happened. The layer drew at the countries involved
         * because it could do nothing else, not because anyone chose it: every browser moves.
         */
        6: (data) => {
          const events = data.diplomaticEvents ?? defaultConfig.diplomaticEvents;
          return { ...data, diplomaticEvents: { ...events, placeBy: events.placeBy ?? defaultConfig.diplomaticEvents.placeBy } };
        },
        /*
         * D-DP, DP15: one shared time. Diplomacy's and Conflict Zones' own time ranges, hours back
         * from the snapshot, were a second cursor; what is shown is the shared time's to say.
         */
        7: (data) => {
          const strip = <T extends object>(section: T | undefined): T | undefined => {
            if (!section) return section;
            const kept = { ...section } as Record<string, unknown>;
            delete kept.timeRange;
            return kept as T;
          };
          return { ...data, diplomaticEvents: strip(data.diplomaticEvents)!, conflictZones: strip(data.conflictZones)! };
        },
      }
    });
    setConfig(loadedConfig);
  }, []);

  // Save settings to localStorage when config changes with debouncing
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const debouncedSave = useCallback((configToSave: GeoPoliticalConfig) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      settingsStorage.saveSettings(STORAGE_KEY, configToSave, { version: 7 });
    }, 500); // Debounce for 500ms
  }, []);

  useEffect(() => {
    // Skip saving the default config on first load
    if (JSON.stringify(config) === JSON.stringify(defaultConfig)) {
      return;
    }
    
    debouncedSave(config);
    
    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [config, debouncedSave]);

  const updateConfig = (updates: Partial<GeoPoliticalConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  /*
   * A change to one of the four look fields is a change to the screen style's look
   * (TS6), stored as such; everything else is stored as given.
   */
  const updateNationalTerritories = (updates: Partial<GeoPoliticalConfig['nationalTerritories']>) => {
    setConfig(prev => {
      const territories = prev.nationalTerritories;
      const style = styleOf(territories);
      const { territoryColors, borderVisibility, borderThickness, fillElevationEpsilon, ...rest } = updates;
      const change: Partial<TerritoryLook> = {
        fillOpacity: territoryColors?.opacity,
        borderVisibility,
        borderThickness,
        height: fillElevationEpsilon,
      };
      const kept = territoryColors ? { ...territoryColors, opacity: territories.territoryColors.opacity } : territories.territoryColors;
      return {
        ...prev,
        nationalTerritories: {
          ...territories,
          ...rest,
          territoryColors: kept,
          styleSettings: withLookChange(rest.styleSettings ?? territories.styleSettings, rest.style ?? style, change),
        }
      };
    });
  };

  /** A change to the screen style's look, any of its settings (K5, TS6): only what differs from its defaults is kept. */
  const updateTerritoryLook = useCallback((change: TerritoryLookChange) => {
    setConfig(prev => {
      const territories = prev.nationalTerritories;
      return {
        ...prev,
        nationalTerritories: { ...territories, styleSettings: withLookChange(territories.styleSettings, styleOf(territories), change) },
      };
    });
  }, []);

  /** Which style the screen draws (K5). */
  const setTerritoryStyle = useCallback((style: TerritoryStyle) => {
    setConfig(prev => ({ ...prev, nationalTerritories: { ...prev.nationalTerritories, style } }));
  }, []);

  /** A style back to its defaults: everything a person changed in it, forgotten. */
  const resetTerritoryLook = useCallback((style: TerritoryStyle) => {
    setConfig(prev => {
      const { [style]: _dropped, ...others } = prev.nationalTerritories.styleSettings ?? {};
      void _dropped;
      return { ...prev, nationalTerritories: { ...prev.nationalTerritories, styleSettings: others } };
    });
  }, []);

  // What every reader is handed: the stored config, with the look fields the screen style's.
  // The territories resolved on their own, so a change elsewhere in the config leaves
  // their object as it was: useNationalTerritories3D rebuilds when it changes.
  const territories = useMemo(() => resolvedTerritories(config.nationalTerritories), [config.nationalTerritories]);
  const resolved = useMemo(() => ({ ...config, nationalTerritories: territories }), [config, territories]);
  const territoryLooks = useMemo(
    () => Object.fromEntries(TERRITORY_STYLES.map((s) => [s, territoryLookOf(s, config.nationalTerritories.styleSettings)])) as Record<TerritoryStyle, TerritoryLook>,
    [config.nationalTerritories.styleSettings],
  );

  const updateDiplomaticEvents = (updates: Partial<GeoPoliticalConfig['diplomaticEvents']>) => {
    setConfig(prev => ({
      ...prev,
      diplomaticEvents: { ...prev.diplomaticEvents, ...updates }
    }));
  };

  const updateResourceZones = (updates: Partial<GeoPoliticalConfig['resourceZones']>) => {
    setConfig(prev => ({
      ...prev,
      resourceZones: { ...prev.resourceZones, ...updates }
    }));
  };

  const updateConflictZones = (updates: Partial<GeoPoliticalConfig['conflictZones']>) => {
    setConfig(prev => ({
      ...prev,
      conflictZones: { ...prev.conflictZones, ...updates }
    }));
  };

  const updateGlobalSettings = (updates: Partial<GeoPoliticalConfig['globalSettings']>) => {
    setConfig(prev => ({
      ...prev,
      globalSettings: { ...prev.globalSettings, ...updates }
    }));
  };

  const resetConfig = () => {
    setConfig(defaultConfig);
  };

  const resetSubMode = (subMode: 'nationalTerritories' | 'diplomaticEvents' | 'resourceZones' | 'conflictZones' | 'globalSettings') => {
    setConfig(prev => ({
      ...prev,
      [subMode]: defaultConfig[subMode]
    }));
  };

  return {
    config: resolved,
    updateConfig,
    updateNationalTerritories,
    territoryStyle: styleOf(config.nationalTerritories),
    territoryLooks,
    updateTerritoryLook,
    setTerritoryStyle,
    resetTerritoryLook,
    updateDiplomaticEvents,
    updateResourceZones,
    updateConflictZones,
    updateGlobalSettings,
    resetConfig,
    resetSubMode,
    
    // Convenience getters for common operations
    // NationalTerritories is no longer a GeoPolitical subMode (see VisualizationModeContext) —
    // it's rendered as a global overlay now, so it's dropped from this param type too.
    currentSubModeConfig: (subMode: 'DiplomaticEvents' | 'ResourceZones' | 'ConflictZones') => {
      switch (subMode) {
        case 'DiplomaticEvents':
          return config.diplomaticEvents;
        case 'ResourceZones':
          return config.resourceZones;
        case 'ConflictZones':
          return config.conflictZones;
        default:
          return config.diplomaticEvents;
      }
    },
    
    isAutoRefreshEnabled: config.globalSettings.autoRefresh,
    effectiveBorderOpacity: resolved.nationalTerritories.borderVisibility / 100,
    eventSettings: {
      showAnimations: config.diplomaticEvents.animateEvents,
      connectionOpacity: config.diplomaticEvents.connectionOpacity / 100
    },

    geoIntegrity,
    layerErrors,
    setLayerError
  };
}

export const GeoPoliticalSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const api = useGeoPoliticalSettingsState();
  return (
    <GeoPoliticalSettingsContext.Provider value={api}>
      {children}
    </GeoPoliticalSettingsContext.Provider>
  );
};

export const useGeoPoliticalSettings = () => {
  const context = useContext(GeoPoliticalSettingsContext);
  if (!context) {
    throw new Error('useGeoPoliticalSettings must be used within a GeoPoliticalSettingsProvider');
  }
  return context;
};

export default useGeoPoliticalSettings;
