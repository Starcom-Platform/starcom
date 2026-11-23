/* eslint-disable react-refresh/only-export-components */
// src/context/SpaceWeatherContext.tsx
// AI-NOTE: Context for sharing space weather data and settings across components
// Bridges the gap between settings, data fetching, and Globe visualization
// Enhanced with enterprise capabilities and advanced data processing

import React, { createContext, ReactNode, useState, useCallback, useEffect, useRef } from 'react';
import { useEcoNaturalSettings } from '../hooks/useEcoNaturalSettings';
import { useSpaceWeatherData } from '../hooks/useSpaceWeatherData';
import { useEnterpriseSpaceWeatherData } from '../hooks/useEnterpriseSpaceWeatherData';
import { useVisualizationMode } from './VisualizationModeContext';
import { DataTransformService } from '../services/data-management/DataTransformService';
import { DataQualityService, DataQualityMetrics } from '../services/data-management/DataQualityService';
import type { SpaceWeatherAlert } from '../types';
import { createAdapterOrchestrator } from '../services/space-weather/AdapterOrchestrator';
import { createNoaaInterMagAdapter } from '../services/space-weather/adapters/NoaaInterMagAdapter';
import { createNoaaUSCanadaAdapter } from '../services/space-weather/adapters/NoaaUSCanadaAdapter';
import { spaceWeatherDiagnostics, SpaceWeatherDiagnosticsState } from '../services/space-weather/SpaceWeatherDiagnostics';
import { visualizationResourceMonitor } from '../services/visualization/VisualizationResourceMonitor';
import { pollerRegistry, type PollerHandle } from '../services/pollerRegistry';
import { combineScopes, makeModeScope, makeRouteScope } from '../services/pollerScopes';
// Tertiary mode data hooks (Phase 1 stubs)
import { useGeomagneticData } from '../hooks/useGeomagneticData';
import { useAuroralOvalData } from '../hooks/useAuroralOvalData';
import { useSolarWindData } from '../hooks/useSolarWindData';
import { useMagnetopauseData } from '../hooks/useMagnetopauseData';
import { useMagneticFieldData } from '../hooks/useMagneticFieldData';
import {
  SPACE_WEATHER_MODE_KEY,
  type DataProvider,
  type SpaceWeatherContextType,
  type VisualizationVector
} from './spaceWeather/spaceWeatherContext.types';
import { useSpaceWeatherVisualization } from './spaceWeather/useSpaceWeatherVisualization';

// Global flag typing for enhanced sampling (Phase 0)
declare global {
  interface Window {
    STARCOM_SPACEWEATHER_ENHANCED_SAMPLING?: boolean;
  }
}

export const SpaceWeatherContext = createContext<SpaceWeatherContextType | undefined>(undefined);

export const SpaceWeatherProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { visualizationMode } = useVisualizationMode();
  const [currentProvider, setCurrentProvider] = useState<DataProvider>('legacy');
  // Not checked until each answers (plan item 8.3b). All three began
  // "available, tested now", and the details read "Ready" for providers nothing
  // had asked.
  const [providerStatus, setProviderStatus] = useState<Record<DataProvider, { available: boolean | null; lastTested?: Date; error?: string }>>({
    legacy: { available: null },
    enterprise: { available: null },
    enhanced: { available: null }
  });
  
  // Enhanced feature flags
  const [enableDataCorrelation, setEnableDataCorrelation] = useState(false);
  const [enableQualityAssessment, setEnableQualityAssessment] = useState(false);
  
  // Enhanced data state
  const [qualityMetrics, setQualityMetrics] = useState<DataQualityMetrics | undefined>();
  const [enhancedAlerts, setEnhancedAlerts] = useState<SpaceWeatherAlert[]>([]);
  // Pipeline state (Phase 1 wiring)
  const [pipelineVectors, setPipelineVectors] = useState<VisualizationVector[] | null>(null);
  const [pipelineMeta, setPipelineMeta] = useState<null | { adapterCount: number; fetchMs: number; failures: number; totalVectors: number; lastFetch: number }>(null);
  const [lastPipelineError, setLastPipelineError] = useState<string | null>(null);
  const pipelinePollerHandleRef = useRef<PollerHandle | null>(null);
  const orchestratorRef = useRef<ReturnType<typeof createAdapterOrchestrator> | null>(null);
  const [diagnosticsState, setDiagnosticsState] = useState<SpaceWeatherDiagnosticsState>(() => spaceWeatherDiagnostics.getState());

  // Subscribe to diagnostics store so context stays in sync with backend instrumentation
  useEffect(() => {
    const unsubscribe = spaceWeatherDiagnostics.subscribe(setDiagnosticsState);
    return () => unsubscribe();
  }, []);

  const { 
    config, 
    updateSpaceWeather, 
    isElectricFieldsEnabled,
    vectorSettings,
    dataSettings 
  } = useEcoNaturalSettings();

  // Tertiary mode activation flags
  const geomagneticActive = config.spaceWeather.showGeomagneticIndex === true;
  const auroralOvalActive = config.spaceWeather.showAuroralOval === true;
  const solarWindActive = config.spaceWeather.showSolarWind === true;
  const magnetopauseActive = config.spaceWeather.showMagnetopause === true;
  const magneticFieldActive = config.spaceWeather.showMagneticField === true;

  // Mode data hooks (mock/stub data)
  const geomagnetic = useGeomagneticData(geomagneticActive);
  const auroralOval = useAuroralOvalData(auroralOvalActive);
  const solarWind = useSolarWindData(solarWindActive);
  const magnetopause = useMagnetopauseData(magnetopauseActive);
  const magneticField = useMagneticFieldData(magneticFieldActive);
  
  // Data providers
  /*
   * Only the provider that `baseData` reads is allowed to fetch.
   *
   * autoRefresh was already gated this way, but that only governed the
   * INTERVAL — both hooks still fetched once on mount, so every page load
   * pulled the same two NOAA electric-field datasets twice and discarded one
   * copy. Measured at 2.9 MB of third-party traffic before the globe was
   * drawable.
   */
  /*
   * …and only while Space Weather is the mode — the grids are what its electric-field
   * layer draws. They were fetched on every page load: 1.98 MB from NOAA, measured on
   * 2026-09-11 in the default mode with no Space Weather on screen, to keep the Threat
   * Assessment panel supplied with alerts Starcom computed from them. That panel now
   * reads NOAA's own scales and alerts, fetched only while it is open.
   */
  const spaceWeatherModeOn = visualizationMode.mode === 'EcoNatural' && visualizationMode.subMode === 'SpaceWeather';
  const legacyActive = currentProvider === 'legacy' && spaceWeatherModeOn;
  const enterpriseActive = ['enterprise', 'enhanced'].includes(currentProvider) && spaceWeatherModeOn;

  const legacyData = useSpaceWeatherData({
    enabled: legacyActive,
    autoRefresh: legacyActive ? dataSettings.autoRefresh : false,
    refreshInterval: dataSettings.refreshIntervalMs,
    enableAlerts: config.spaceWeather.showAlerts
  });

  const enterpriseData = useEnterpriseSpaceWeatherData({
    enabled: enterpriseActive,
    autoRefresh: enterpriseActive ? dataSettings.autoRefresh : false,
    refreshInterval: dataSettings.refreshIntervalMs,
    enableAlerts: config.spaceWeather.showAlerts
  });

  // Get active data based on current provider
  const baseData = ['enhanced', 'enterprise'].includes(currentProvider) ? enterpriseData : legacyData;

  // Service instances for enhanced mode
  const [_transformService] = useState(() => DataTransformService.getInstance());
  const [qualityService] = useState(() => DataQualityService.getInstance());

  // Provider switching logic
  const switchProvider = useCallback((provider: DataProvider) => {
    console.log(`🔄 SpaceWeather: Switching from ${currentProvider} to ${provider} provider`);
    // Switching tests nothing, so it records no test: it stamped "tested now".
    setCurrentProvider(provider);
  }, [currentProvider]);

  // Enhanced data processing for enhanced mode
  const processEnhancedData = useCallback(async () => {
    if (currentProvider !== 'enhanced' || (!enableDataCorrelation && !enableQualityAssessment)) {
      return;
    }

    if (!baseData.interMagData && !baseData.usCanadaData) {
      return;
    }

    try {
      // Quality assessment
      if (enableQualityAssessment) {
        const qualityPromises: Promise<DataQualityMetrics>[] = [];
        
        if (baseData.interMagData) {
          qualityPromises.push(qualityService.assessDataQuality(baseData.interMagData));
        }
        if (baseData.usCanadaData) {
          qualityPromises.push(qualityService.assessDataQuality(baseData.usCanadaData));
        }

        if (qualityPromises.length > 0) {
          const qualityResults = await Promise.all(qualityPromises);
          
          // Combine quality metrics (average scores)
          const combinedMetrics: DataQualityMetrics = {
            overall: qualityResults.reduce((sum, q) => sum + q.overall, 0) / qualityResults.length,
            completeness: qualityResults.reduce((sum, q) => sum + q.completeness, 0) / qualityResults.length,
            accuracy: qualityResults.reduce((sum, q) => sum + q.accuracy, 0) / qualityResults.length,
            timeliness: qualityResults.reduce((sum, q) => sum + q.timeliness, 0) / qualityResults.length,
            consistency: qualityResults.reduce((sum, q) => sum + q.consistency, 0) / qualityResults.length,
            coverage: qualityResults.reduce((sum, q) => sum + q.coverage, 0) / qualityResults.length,
            issues: qualityResults.flatMap(q => q.issues),
            recommendations: [...new Set(qualityResults.flatMap(q => q.recommendations))]
          };

          setQualityMetrics(combinedMetrics);

          // Generate quality-based alerts
          const qualityAlerts: SpaceWeatherAlert[] = [];
          for (const dataset of [baseData.interMagData, baseData.usCanadaData]) {
            if (dataset) {
              const alerts = await qualityService.validateForAlerts(dataset);
              qualityAlerts.push(...alerts);
            }
          }
          setEnhancedAlerts(qualityAlerts);

          console.log(`📊 SpaceWeather: Quality assessment complete (overall: ${(combinedMetrics.overall * 100).toFixed(1)}%)`);
        }
      }

    } catch (error) {
      console.error('❌ SpaceWeather: Enhanced processing failed:', error);
    }
  }, [baseData.interMagData, baseData.usCanadaData, currentProvider, enableDataCorrelation, enableQualityAssessment, qualityService]);

  /**
   * Mirror of providerStatus for reads that must not create a dependency.
   *
   * The health effect below both READS provider availability (to decide
   * failover) and WRITES provider status. Depending on the state it writes is
   * what made this an infinite loop — see the effect's own note.
   */
  const providerStatusRef = useRef(providerStatus);
  useEffect(() => { providerStatusRef.current = providerStatus; }, [providerStatus]);

  /**
   * Monitor provider health and run enhanced processing.
   *
   * THE LOOP THIS USED TO BE, because it is subtle and worth not reintroducing:
   * `providerStatus` was in the dependency array, and the effect called
   * `setProviderStatus` with `lastTested: new Date()`. That produces a new
   * object identity on every single run, unconditionally — so the effect
   * changed its own dependency, re-ran, changed it again, and never stopped.
   * Measured at roughly 46,000 renders per second; 2,085,228 renders in 45
   * seconds while every other provider in the app rendered 2 to 6 times.
   *
   * It is the defect tracked as D2, and it was not merely noisy: it is
   * implicated in the renderer crash seen when four ingest sources fed a large
   * state update into this tree (see docs/phase-1-gate.md).
   *
   * Two changes keep it dead:
   *   1. providerStatus is read through a ref, so writing it cannot retrigger
   *      this effect.
   *   2. the updater returns `prev` UNCHANGED when nothing meaningful differs,
   *      so React bails out instead of re-rendering. `lastTested` alone is not
   *      meaningful — a timestamp that updates 46,000 times a second is not
   *      recording when anything was tested.
   */
  useEffect(() => {
    if (baseData.error) {
      const errorMessage = `${currentProvider} provider error: ${baseData.error}`;
      console.warn('🚨 SpaceWeather:', errorMessage);
      
      setProviderStatus(prev => {
        const entry = prev[currentProvider];
        if (entry.available === false && entry.error === errorMessage) return prev;
        return {
          ...prev,
          [currentProvider]: { ...entry, available: false, error: errorMessage, lastTested: new Date() }
        };
      });

      // Auto-failover logic (enhanced -> enterprise -> legacy)
      const status = providerStatusRef.current;
      // Fail over to any provider not known to be down.
      if (currentProvider === 'enhanced' && status.enterprise.available !== false) {
        console.log('🔄 SpaceWeather: Auto-switching to enterprise provider');
        switchProvider('enterprise');
      } else if (currentProvider === 'enterprise' && status.legacy.available !== false) {
        console.log('🔄 SpaceWeather: Auto-switching to legacy provider');
        switchProvider('legacy');
      }
      
    } else if (baseData.lastUpdated) {
      // Provider is working
      setProviderStatus(prev => {
        const entry = prev[currentProvider];
        if (entry.available === true && entry.error === undefined) return prev;
        return {
          ...prev,
          [currentProvider]: { ...entry, available: true, error: undefined, lastTested: new Date() }
        };
      });

      // Run enhanced processing when data updates
      if (currentProvider === 'enhanced') {
        processEnhancedData();
      }
    }
    // providerStatus is deliberately NOT a dependency — this effect writes it,
    // and depending on what you write is the loop.
  }, [baseData.error, baseData.lastUpdated, currentProvider, switchProvider, processEnhancedData]);

  // Check if we should show space weather visualization based on mode
  const activeLayer = config.spaceWeather.activeLayer;
  const shouldShowSpaceWeatherVisualization = (
    visualizationMode.mode === 'EcoNatural' &&
    visualizationMode.subMode === 'SpaceWeather' &&
    isElectricFieldsEnabled
  );
  const { visualizationVectors, telemetry, telemetryHistory, resetVisualizationCache } = useSpaceWeatherVisualization({
    settings: config.spaceWeather,
    vectorSettings,
    interMagData: baseData.interMagData,
    usCanadaData: baseData.usCanadaData,
    pipelineVectors,
    pipelineMeta,
    lastPipelineError,
    currentProvider,
    isElectricFieldsEnabled,
    shouldShowSpaceWeatherVisualization,
    diagnosticsState,
    geomagneticActive,
    auroralOvalActive,
    solarWindActive,
    magnetopauseActive,
    magneticFieldActive,
    geomagnetic,
    auroralOval,
    solarWind,
    magnetopause,
    magneticField
  });

  // Pipeline async fetch effect
  useEffect(() => {
    const stopPipelinePoller = () => {
      if (pipelinePollerHandleRef.current) {
        pipelinePollerHandleRef.current.stop();
        pipelinePollerHandleRef.current = null;
      }
    };

    const disposeOrchestrator = () => {
      if (orchestratorRef.current) {
        orchestratorRef.current.clear();
        orchestratorRef.current = null;
      }
    };

    const resetPipelineState = () => {
      setPipelineVectors(null);
      setPipelineMeta(null);
      setLastPipelineError(null);
      resetVisualizationCache();
      visualizationResourceMonitor.clearMode(SPACE_WEATHER_MODE_KEY);
    };

    const tearDownPipeline = () => {
      stopPipelinePoller();
      disposeOrchestrator();
      resetPipelineState();
    };

    if (!(config.spaceWeather.pipelineEnabled && config.spaceWeather.enabledDatasets.pipeline && shouldShowSpaceWeatherVisualization)) {
      tearDownPipeline();
      return () => tearDownPipeline();
    }
    // Lazy init orchestrator
    if (!orchestratorRef.current) {
      try {
        orchestratorRef.current = createAdapterOrchestrator()
          .register(createNoaaInterMagAdapter())
          .register(createNoaaUSCanadaAdapter());
      } catch (e) {
        console.warn('Pipeline orchestrator creation failed', e);
        return;
      }
    }
    const fetchPipeline = async (signal: AbortSignal) => {
      if (!orchestratorRef.current || signal.aborted) return;
      try {
        const start = performance.now();
        const result = await orchestratorRef.current.fetchAll();
        if (signal.aborted) return;
        const fetchMs = performance.now() - start;
        setPipelineMeta({
          adapterCount: result.metrics.adapterCount,
          fetchMs,
          failures: result.metrics.failures,
          totalVectors: result.metrics.totalVectors,
          lastFetch: Date.now()
        });
        setLastPipelineError(null);
        // Adapt vectors minimally (VisualizationVector partial); further normalization occurs in memo
        setPipelineVectors(result.vectors.map(v => ({
          latitude: v.latitude,
          longitude: v.longitude,
          magnitude: v.magnitude,
          direction: v.direction,
          quality: v.quality,
          intensity: 1,
          opacity: 1,
          color: '#fff',
          size: 1
        })));
      } catch (e) {
        if (signal.aborted) return;
        const message = e instanceof Error ? e.message : 'Unknown pipeline error';
        console.warn('Pipeline fetch failed', message);
        setLastPipelineError(message);
        setPipelineMeta(prev => ({
          adapterCount: prev?.adapterCount ?? 0,
          fetchMs: prev?.fetchMs ?? 0,
          failures: (prev?.failures ?? 0) + 1,
          totalVectors: prev?.totalVectors ?? 0,
          lastFetch: Date.now()
        }));
      }
    };
    const intervalMs = Math.max(15_000, dataSettings.refreshIntervalMs || 60_000); // floor 15s
    const scopeTags = combineScopes(
      makeModeScope(visualizationMode.mode),
      makeRouteScope('cybercommand'),
      'spaceWeather'
    );

    pipelinePollerHandleRef.current = pollerRegistry.register('space-weather-pipeline', fetchPipeline, {
      intervalMs,
      minIntervalMs: 15_000,
      jitterMs: 1_000,
      immediate: true,
      scope: scopeTags
    });
    return () => {
      tearDownPipeline();
    };
  }, [config.spaceWeather.pipelineEnabled, config.spaceWeather.enabledDatasets, shouldShowSpaceWeatherVisualization, dataSettings.refreshIntervalMs, visualizationMode.mode]);

  const contextValue: SpaceWeatherContextType = {
    // Settings
    settings: config.spaceWeather,
    updateSettings: updateSpaceWeather,
    isElectricFieldsEnabled,
    
    // Data
    interMagData: baseData.interMagData,
    usCanadaData: baseData.usCanadaData,
    alerts: baseData.alerts,
    isLoading: baseData.isLoading,
    error: baseData.error,
    lastUpdated: baseData.lastUpdated,
    refresh: baseData.refresh,
    
    // Provider management (enhanced capabilities)
    currentProvider,
    switchProvider,
    providerStatus,
    
    // Enhanced data insights
    qualityMetrics,
    enhancedAlerts,
    
    // Enhanced feature controls
    enableDataCorrelation,
    setEnableDataCorrelation,
    enableQualityAssessment,
    setEnableQualityAssessment,
    
    // Computed
  // shouldShowSpaceWeatherVisualization alone is mode+enabled only, not
  // layer-scoped (kept that way since it also gates the pipeline's
  // fetch/teardown lifecycle above — switching SpaceWeather layers
  // shouldn't force a full pipeline refetch). The exposed overlay-visible
  // signal additionally requires electricFields to be the selected layer,
  // matching visualizationVectors' own gating in useSpaceWeatherVisualization.ts.
  shouldShowOverlay: shouldShowSpaceWeatherVisualization && activeLayer === 'electricFields',
  visualizationVectors,
    telemetry,
    telemetryHistory,
    diagnostics: diagnosticsState
  };

  return (
    <SpaceWeatherContext.Provider value={contextValue}>
      {children}
    </SpaceWeatherContext.Provider>
  );
};

export default SpaceWeatherProvider;
export type { SpaceWeatherContextType } from './spaceWeather/spaceWeatherContext.types';

export const useSpaceWeatherContext = () => {
  const ctx = React.useContext(SpaceWeatherContext);
  if (!ctx) throw new Error('useSpaceWeatherContext must be used within a SpaceWeatherProvider');
  return ctx;
};
