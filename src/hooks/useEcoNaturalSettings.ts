import { useSyncExternalStore } from 'react';
import { settingsStorage } from '../utils/settingsStorage';

// AI-NOTE: Hook to manage EcoNatural visualization settings with localStorage persistence
// Used by SpaceWeatherSettings and other EcoNatural components

/** How the e-field shows its direction (space-weather-visualization.md, SW1). */
export type EFieldLook = 'streaks' | 'arrows' | 'ripples' | 'relief';

export interface EcoNaturalConfig {
  // Space Weather settings (updated for new compact design)
  spaceWeather: {
  // Tertiary visualization active layer (single-select for now)
  activeLayer: string; // e.g. 'electricFields'
    // New preset-based configuration
    preset?: 'quiet' | 'moderate' | 'storm' | 'extreme';
    
    // New simplified category toggles
    showSolarActivity?: boolean;
    showRadiation?: boolean;
    
    // Existing fields (preserved for compatibility)
  showElectricFields: boolean;
  // Renamed (Aug 2025): showGemagneticIndex -> showGeomagneticIndex (migration retained below)
  showGeomagneticIndex: boolean;
    showAlerts: boolean;
    vectorIntensity: number; // 0-100
    vectorOpacity: number; // 0-100
    vectorScale: number; // 0.5-5.0
    heatMapIntensity: number; // 0-100
    showMagneticField: boolean;
    showAuroralOval: boolean;
    showKpIndex: boolean;
    showSolarWind: boolean;
    showMagnetopause: boolean;
    timeWindow: number; // hours
    alertThresholds: {
      moderate: number;
      high: number;
      extreme: number;
    };
    autoRefresh: boolean;
    refreshInterval: number; // minutes
    showStatistics: boolean;
    // Advanced normalization settings
    normalization: {
      method: 'linear' | 'logarithmic' | 'percentile' | 'statistical' | 'adaptive';
      outlierFactor: number; // 1.0-3.0
      smoothingFactor: number; // 0-1
      percentileRange: [number, number]; // e.g., [5, 95]
      clampMax: number | null; // Optional maximum clamp value
    };
  // Phase 0 feature flag persistence
  enhancedSampling?: boolean;
  // Phase 1 pipeline feature flag
  pipelineEnabled?: boolean;
    enabledDatasets: {
      intermag: boolean;
      usCanada: boolean;
      pipeline: boolean;
    };
    samplingMode: 'legacy-topN' | 'grid-binning';
    gridBinSize: number;
    legacyCap: number;
    magnitudeFloor: number;
    /**
     * How the e-field shows its direction over its colour field (space-weather-visualization.md,
     * SW1): streaks drifting along it, an arrow grid, ripples, or a raised relief.
     */
    eFieldLook: EFieldLook;
    /** Its colours: the same strengths every day, or stretched over the field drawn now (SW2). */
    eFieldScale: 'absolute' | 'relative';
    /** How fast its streaks move, and how many there are, as a share of their default (SW2). */
    eFieldFlowSpeed: number;
    eFieldFlowDensity: number;
    /** The aurora's night curtain over its band, or the band alone (SW2, SW3). */
    auroraCurtain: boolean;
    /** The magnetosphere's field lines, T96 (SW4), and how many. */
    showFieldLines: boolean;
    fieldLineDensity: 'many' | 'few';
    /** The Van Allen belts (SW5). */
    showVanAllen: boolean;
    /** The polar cusps, and the day side's bursts of reconnection (SW5). */
    showCusps: boolean;
    /** The magnetotail's current sheet (SW5). */
    showTailSheet: boolean;
    /** The solar wind from the Sun to the Earth, a hindcast (SW6, SW16). */
    showHeliosphere: boolean;
    /** The solar wind streaming past the magnetosphere, now (SW6, SW17). */
    showNearEarthFlow: boolean;
    /** NOAA's ENLIL model of the solar wind, and which of its quantities (SW6, SW9, SW18). */
    showEnlil: boolean;
    enlilQuantity: 'density' | 'velocity';
    /** Coronal mass ejections from NASA DONKI (SW8, SW20–SW23). */
    showCmes: boolean;
  };
  
  // Ecological Disasters settings
  ecologicalDisasters: {
    disasterTypes: {
      wildfires: boolean;
      floods: boolean;
      droughts: boolean;
      hurricanes: boolean;
      earthquakes: boolean;
      volcanoes: boolean;
    };
    severity: {
      showMinor: boolean;
      showMajor: boolean;
      showCatastrophic: boolean;
    };
    timeRange: number; // days
    // 'severity': color encodes minor/major/catastrophic (existing default behavior).
    // 'hazardType': color encodes which of the 6 hazard types the marker is — more
    // useful now that there are 6 real types to tell apart at a glance, not just 3.
    colorMode: 'severity' | 'hazardType';
    showImpactRadius: boolean;
    radiusOpacity: number; // 0-100
    showEvacuationZones: boolean;
    alertSettings: {
      enableAlerts: boolean;
      soundAlerts: boolean;
      alertThreshold: 'minor' | 'major' | 'catastrophic';
    };
    dataLayers: {
      showPopulationDensity: boolean;
      showInfrastructure: boolean;
      showEnvironmentalData: boolean;
    };
  };
  
  // Earth Weather settings
  earthWeather: {
    weatherLayers: {
      temperature: boolean;
      precipitation: boolean;
      windPatterns: boolean;
      pressure: boolean;
      humidity: boolean;
      clouds: boolean;
      // Real Open-Meteo Air Quality data (US AQI + PM2.5/PM10) merged onto the same
      // weather grid — not OpenAQ, which now requires a registered API key
      // (confirmed directly: v1/v2 keyless endpoints are retired, v3 needs one).
      airQuality: boolean;
      // Real, individually-tracked icebergs (NASA EONET, NATICE-sourced) — rendered
      // as discrete point markers, not part of the sampled weather grid.
      seaIce: boolean;
      // Real NOAA CO-OPS tide gauges + USGS Water Data API streamflow gauges — a
      // bounded, curated subset (see NOAAWaterLevelService.ts/USGSStreamflowService.ts
      // for why: neither real API supports a single nationwide/global batch request).
      waterGauges: boolean;
    };
    // Which real value drives the weather grid's point color.
    /** What colours the ground: temperature, rain (decision D-W, WX8), or air quality at the stations. */
    colorMode: 'temperature' | 'rain' | 'airQuality';
    displayMode: 'realtime' | 'forecast' | 'historical';
    forecastRange: number; // hours
    temperatureUnit: 'celsius' | 'fahrenheit' | 'kelvin';
    windUnit: 'kmh' | 'mph' | 'ms' | 'knots';
    pressureUnit: 'hPa' | 'inHg' | 'mmHg';
    overlayOpacity: number; // 0-100
    animationSpeed: number; // 0.1-3.0
    showStormTracking: boolean;
    stormTypes: {
      tropical: boolean;
      extratropical: boolean;
      severe: boolean;
    };
  };
  
  // Global EcoNatural settings
  globalSettings: {
    dataQuality: 'low' | 'medium' | 'high';
    updateFrequency: number; // minutes
    cacheDuration: number; // hours
    enableInterpolation: boolean;
    showDataSources: boolean;
    coordinateSystem: 'geographic' | 'projected';
    timeZone: 'utc' | 'local';
  };
}

const defaultConfig: EcoNaturalConfig = {
  spaceWeather: {
  activeLayer: 'electricFields',
    // New preset-based defaults
    preset: 'moderate',
    showSolarActivity: true,
    showRadiation: false,
    
    // Existing defaults (preserved)
  showElectricFields: true,
  showGeomagneticIndex: false,
    showAlerts: true,
    vectorIntensity: 80,
    vectorOpacity: 60,
    vectorScale: 1.0,
    heatMapIntensity: 50,
    showMagneticField: false,
    showAuroralOval: true,
    showKpIndex: false,
    showSolarWind: false,
    showMagnetopause: false,
    timeWindow: 24,
    alertThresholds: {
      moderate: 1000,
      high: 3000,
      extreme: 5000
    },
    autoRefresh: true,
    refreshInterval: 5,
    showStatistics: true,
    normalization: {
      method: 'adaptive',
      outlierFactor: 1.5,
      smoothingFactor: 0.1,
      percentileRange: [10, 90],
      clampMax: null
  },
  // Phase 0 feature flags
  enhancedSampling: false,
  // Phase 1 pipeline flag (disabled by default until orchestrator validated)
  pipelineEnabled: false,
    enabledDatasets: {
      intermag: true,
      usCanada: true,
      pipeline: false
    },
    samplingMode: 'legacy-topN',
    gridBinSize: 5,
    legacyCap: 500,
    magnitudeFloor: 0,
    eFieldLook: 'streaks',
    eFieldScale: 'absolute',
    eFieldFlowSpeed: 1,
    eFieldFlowDensity: 1,
    auroraCurtain: true,
    showFieldLines: true,
    fieldLineDensity: 'many',
    showVanAllen: true,
    showCusps: true,
    showTailSheet: true,
    showHeliosphere: true,
    showNearEarthFlow: true,
    showEnlil: true,
    enlilQuantity: 'density',
    showCmes: true
  },
  
  ecologicalDisasters: {
    disasterTypes: {
      wildfires: true,
      floods: true,
      droughts: true,
      hurricanes: true,
      earthquakes: true,
      volcanoes: true
    },
    severity: {
      showMinor: true,
      showMajor: true,
      showCatastrophic: true
    },
    timeRange: 7,
    colorMode: 'severity',
    showImpactRadius: true,
    radiusOpacity: 40,
    showEvacuationZones: true,
    alertSettings: {
      enableAlerts: true,
      soundAlerts: false,
      alertThreshold: 'major'
    },
    dataLayers: {
      showPopulationDensity: true,
      showInfrastructure: false,
      showEnvironmentalData: false
    }
  },
  
  earthWeather: {
    weatherLayers: {
      temperature: true,
      precipitation: true,
      // On since the wind became NOAA GFS streaks (decision D-W, WX3): the cones it
      // replaced were off for clutter. A browser that saved a choice keeps it.
      windPatterns: true,
      pressure: false,
      humidity: false,
      clouds: true,
      airQuality: true,
      seaIce: true,
      waterGauges: false
    },
    colorMode: 'temperature',
    displayMode: 'realtime',
    forecastRange: 48,
    temperatureUnit: 'celsius',
    windUnit: 'kmh',
    pressureUnit: 'hPa',
    overlayOpacity: 70,
    animationSpeed: 1.0,
    showStormTracking: true,
    stormTypes: {
      tropical: true,
      extratropical: false,
      severe: true
    }
  },
  
  globalSettings: {
    dataQuality: 'medium',
    updateFrequency: 10,
    cacheDuration: 2,
    enableInterpolation: true,
    showDataSources: false,
    coordinateSystem: 'geographic',
    timeZone: 'utc'
  }
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number) => {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, num));
};

const coerceBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined) return fallback;
  return Boolean(value);
};

const sanitizeEcologicalDisasters = (
  incoming: EcoNaturalConfig['ecologicalDisasters']
): EcoNaturalConfig['ecologicalDisasters'] => {
  const defaults = defaultConfig.ecologicalDisasters;

  const disasterTypes = {
    ...defaults.disasterTypes,
    ...(incoming?.disasterTypes || {})
  };

  const severity = {
    ...defaults.severity,
    ...(incoming?.severity || {})
  };

  const alertSettings = {
    ...defaults.alertSettings,
    ...(incoming?.alertSettings || {})
  };

  const dataLayers = {
    ...defaults.dataLayers,
    ...(incoming?.dataLayers || {})
  };

  const alertThreshold = ['minor', 'major', 'catastrophic'].includes(alertSettings.alertThreshold)
    ? alertSettings.alertThreshold
    : defaults.alertSettings.alertThreshold;

  const colorMode = incoming?.colorMode === 'hazardType' || incoming?.colorMode === 'severity'
    ? incoming.colorMode
    : defaults.colorMode;

  return {
    ...defaults,
    ...incoming,
    colorMode,
    disasterTypes: Object.fromEntries(
      Object.entries(disasterTypes).map(([key, value]) => [key, coerceBoolean(value, defaults.disasterTypes[key as keyof typeof defaults.disasterTypes])])
    ) as EcoNaturalConfig['ecologicalDisasters']['disasterTypes'],
    severity: {
      showMinor: coerceBoolean(severity.showMinor, defaults.severity.showMinor),
      showMajor: coerceBoolean(severity.showMajor, defaults.severity.showMajor),
      showCatastrophic: coerceBoolean(severity.showCatastrophic, defaults.severity.showCatastrophic)
    },
    timeRange: clampNumber(incoming?.timeRange, 1, 30, defaults.timeRange),
    radiusOpacity: clampNumber(incoming?.radiusOpacity, 0, 100, defaults.radiusOpacity),
    showImpactRadius: coerceBoolean(incoming?.showImpactRadius, defaults.showImpactRadius),
    showEvacuationZones: coerceBoolean(incoming?.showEvacuationZones, defaults.showEvacuationZones),
    alertSettings: {
      enableAlerts: coerceBoolean(alertSettings.enableAlerts, defaults.alertSettings.enableAlerts),
      soundAlerts: coerceBoolean(alertSettings.soundAlerts, defaults.alertSettings.soundAlerts),
      alertThreshold
    },
    dataLayers: {
      showPopulationDensity: coerceBoolean(dataLayers.showPopulationDensity, defaults.dataLayers.showPopulationDensity),
      showInfrastructure: coerceBoolean(dataLayers.showInfrastructure, defaults.dataLayers.showInfrastructure),
      showEnvironmentalData: coerceBoolean(dataLayers.showEnvironmentalData, defaults.dataLayers.showEnvironmentalData)
    }
  };
};

// Mirrors sanitizeEcologicalDisasters above — earthWeather previously had no
// equivalent, so a persisted localStorage value from before weatherLayers.airQuality/
// seaIce or colorMode existed would wholesale-replace the whole nested object
// (loadSettings only shallow-merges at the top level) and silently lose them for a
// returning user, rather than filling them in from defaults like this does.
const sanitizeEarthWeather = (
  incoming: EcoNaturalConfig['earthWeather']
): EcoNaturalConfig['earthWeather'] => {
  const defaults = defaultConfig.earthWeather;

  const weatherLayers = {
    ...defaults.weatherLayers,
    ...(incoming?.weatherLayers || {})
  };

  const colorMode = incoming?.colorMode === 'airQuality' || incoming?.colorMode === 'temperature' || incoming?.colorMode === 'rain'
    ? incoming.colorMode
    : defaults.colorMode;

  const displayMode = ['realtime', 'forecast', 'historical'].includes(incoming?.displayMode as string)
    ? (incoming!.displayMode)
    : defaults.displayMode;

  const temperatureUnit = ['celsius', 'fahrenheit', 'kelvin'].includes(incoming?.temperatureUnit as string)
    ? (incoming!.temperatureUnit)
    : defaults.temperatureUnit;

  const windUnit = ['kmh', 'mph', 'ms', 'knots'].includes(incoming?.windUnit as string)
    ? (incoming!.windUnit)
    : defaults.windUnit;

  const pressureUnit = ['hPa', 'inHg', 'mmHg'].includes(incoming?.pressureUnit as string)
    ? (incoming!.pressureUnit)
    : defaults.pressureUnit;

  const stormTypes = {
    ...defaults.stormTypes,
    ...(incoming?.stormTypes || {})
  };

  return {
    ...defaults,
    ...incoming,
    weatherLayers: Object.fromEntries(
      Object.entries(weatherLayers).map(([key, value]) => [key, coerceBoolean(value, defaults.weatherLayers[key as keyof typeof defaults.weatherLayers])])
    ) as EcoNaturalConfig['earthWeather']['weatherLayers'],
    colorMode,
    displayMode,
    temperatureUnit,
    windUnit,
    pressureUnit,
    forecastRange: clampNumber(incoming?.forecastRange, 1, 240, defaults.forecastRange),
    overlayOpacity: clampNumber(incoming?.overlayOpacity, 0, 100, defaults.overlayOpacity),
    animationSpeed: clampNumber(incoming?.animationSpeed, 0.1, 3.0, defaults.animationSpeed),
    showStormTracking: coerceBoolean(incoming?.showStormTracking, defaults.showStormTracking),
    stormTypes: {
      tropical: coerceBoolean(stormTypes.tropical, defaults.stormTypes.tropical),
      extratropical: coerceBoolean(stormTypes.extratropical, defaults.stormTypes.extratropical),
      severe: coerceBoolean(stormTypes.severe, defaults.stormTypes.severe)
    }
  };
};

const STORAGE_KEY = 'eco-natural-settings';
const STORAGE_VERSION = 3;

const migrations: Record<number, (data: EcoNaturalConfig) => EcoNaturalConfig> = {
  2: (data) => {
    const ecologicalDisasters = {
      ...defaultConfig.ecologicalDisasters,
      ...(data.ecologicalDisasters || {})
    };

    const disasterTypes = {
      ...defaultConfig.ecologicalDisasters.disasterTypes,
      ...(data.ecologicalDisasters?.disasterTypes || {})
    };

    // Flip defaults to ON for earthquakes/volcanoes during migration
    disasterTypes.earthquakes = true;
    disasterTypes.volcanoes = true;

    return {
      ...data,
      ecologicalDisasters: {
        ...ecologicalDisasters,
        disasterTypes
      }
    } as EcoNaturalConfig;
  },
  // The aurora on, once, for everyone (space-weather-visualization.md, SW15): saved settings had it
  // off from when it was a ring modelled from Kp; it is OVATION's forecast now.
  3: (data) => ({
    ...data,
    spaceWeather: { ...defaultConfig.spaceWeather, ...(data.spaceWeather || {}), showAuroralOval: true }
  }) as EcoNaturalConfig
};

/** Settings as saved, migrated and checked: what the page starts from. */
function loadEcoNaturalConfig(): EcoNaturalConfig {
  const loadedConfig = settingsStorage.loadSettings(STORAGE_KEY, defaultConfig, { version: STORAGE_VERSION, migrations });
  // Simplified migration for Aug 2025 rename (showGemagneticIndex -> showGeomagneticIndex)
  type PartialSpaceWeather = Partial<EcoNaturalConfig['spaceWeather']> & { [k: string]: unknown };
  const sw = { ...defaultConfig.spaceWeather, ...(loadedConfig.spaceWeather || {}) } as PartialSpaceWeather as EcoNaturalConfig['spaceWeather'];
  if (!sw.activeLayer) sw.activeLayer = 'electricFields';
  // Migration: showGemagneticIndex (typo) -> showGeomagneticIndex
  const legacyValue = (sw as unknown as Record<string, unknown>).showGemagneticIndex;
  if (typeof sw.showGeomagneticIndex !== 'boolean') {
    if (typeof legacyValue === 'boolean') {
      sw.showGeomagneticIndex = legacyValue;
    } else {
      sw.showGeomagneticIndex = defaultConfig.spaceWeather.showGeomagneticIndex;
    }
  }
  // Drop legacy typo key if present
  if ('showGemagneticIndex' in (sw as unknown as Record<string, unknown>)) delete (sw as unknown as Record<string, unknown>).showGemagneticIndex;
  const eco = sanitizeEcologicalDisasters(loadedConfig.ecologicalDisasters ?? defaultConfig.ecologicalDisasters);
  const ew = sanitizeEarthWeather(loadedConfig.earthWeather ?? defaultConfig.earthWeather);
  return { ...loadedConfig, spaceWeather: sw, ecologicalDisasters: eco, earthWeather: ew };
}

/*
 * One set of settings for every part of the page that reads them (space-weather-visualization.md,
 * SW2). Each caller held its own copy: a settings panel saved its change and the globe, holding
 * another copy, never heard of it until a reload. Now the first reader loads them, every change
 * reaches every reader at once, and when the last reader leaves the pending save is written and
 * the copy let go, so the next reader loads afresh, as a reload would.
 */
const shared = {
  config: null as EcoNaturalConfig | null,
  listeners: new Set<() => void>(),
  saveTimer: null as ReturnType<typeof setTimeout> | null,
};
const currentConfig = (): EcoNaturalConfig => (shared.config ??= loadEcoNaturalConfig());
const saveNow = () => {
  if (shared.saveTimer) clearTimeout(shared.saveTimer);
  shared.saveTimer = null;
  // The defaults are not saved: a page that changed nothing writes nothing.
  if (shared.config && JSON.stringify(shared.config) !== JSON.stringify(defaultConfig)) {
    settingsStorage.saveSettings(STORAGE_KEY, shared.config, { version: STORAGE_VERSION });
  }
};
const subscribeShared = (listener: () => void) => {
  shared.listeners.add(listener);
  return () => {
    shared.listeners.delete(listener);
    if (shared.listeners.size) return;
    if (shared.saveTimer) saveNow();
    shared.config = null;
  };
};
/** A change for every reader at once, saved half a second after the last of a run of changes. */
const commit = (change: (prev: EcoNaturalConfig) => EcoNaturalConfig) => {
  shared.config = change(currentConfig());
  if (shared.saveTimer) clearTimeout(shared.saveTimer);
  shared.saveTimer = setTimeout(saveNow, 500);
  for (const listener of [...shared.listeners]) listener();
};

export const useEcoNaturalSettings = () => {
  const config = useSyncExternalStore(subscribeShared, currentConfig, currentConfig);
  const setConfig = commit;

  const updateConfig = (updates: Partial<EcoNaturalConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const updateSpaceWeather = (updates: Partial<EcoNaturalConfig['spaceWeather']>) => {
    setConfig(prev => ({
      ...prev,
      spaceWeather: { ...prev.spaceWeather, ...updates }
    }));
  };

  const updateEcologicalDisasters = (updates: Partial<EcoNaturalConfig['ecologicalDisasters']>) => {
    setConfig(prev => ({
      ...prev,
      ecologicalDisasters: sanitizeEcologicalDisasters({ ...prev.ecologicalDisasters, ...updates })
    }));
  };

  const updateEarthWeather = (updates: Partial<EcoNaturalConfig['earthWeather']>) => {
    setConfig(prev => ({
      ...prev,
      earthWeather: sanitizeEarthWeather({ ...prev.earthWeather, ...updates })
    }));
  };

  const updateGlobalSettings = (updates: Partial<EcoNaturalConfig['globalSettings']>) => {
    setConfig(prev => ({
      ...prev,
      globalSettings: { ...prev.globalSettings, ...updates }
    }));
  };

  const resetConfig = () => {
    setConfig(() => defaultConfig);
  };

  const resetSubMode = (subMode: 'spaceWeather' | 'ecologicalDisasters' | 'earthWeather' | 'globalSettings') => {
    setConfig(prev => ({
      ...prev,
      [subMode]: subMode === 'ecologicalDisasters'
        ? sanitizeEcologicalDisasters(defaultConfig.ecologicalDisasters)
        : subMode === 'earthWeather'
        ? sanitizeEarthWeather(defaultConfig.earthWeather)
        : defaultConfig[subMode]
    }));
  };

  return {
    config,
    updateConfig,
    updateSpaceWeather,
    updateEcologicalDisasters,
    updateEarthWeather,
    updateGlobalSettings,
    resetConfig,
    resetSubMode,
    
    // Convenience getters for common operations
    currentSubModeConfig: (subMode: 'SpaceWeather' | 'EcologicalDisasters' | 'EarthWeather') => {
      switch (subMode) {
        case 'SpaceWeather':
          return config.spaceWeather;
        case 'EcologicalDisasters':
          return config.ecologicalDisasters;
        case 'EarthWeather':
          return config.earthWeather;
        default:
          return config.spaceWeather;
      }
    },
    
    // Legacy compatibility for existing SpaceWeather components
    spaceWeatherConfig: config.spaceWeather,
    
    // Convenience getters for common operations
    isElectricFieldsEnabled: config.spaceWeather.showElectricFields,
    isAlertsEnabled: config.spaceWeather.showAlerts,
    vectorSettings: {
      intensity: config.spaceWeather.vectorIntensity / 100,
      opacity: config.spaceWeather.vectorOpacity / 100
    },
    alertThresholds: config.spaceWeather.alertThresholds,
    dataSettings: {
      autoRefresh: config.spaceWeather.autoRefresh,
      refreshIntervalMs: config.spaceWeather.refreshInterval * 60 * 1000
    }
  };
};

export default useEcoNaturalSettings;
