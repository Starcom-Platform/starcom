import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchLatestElectricFieldData, generateSpaceWeatherAlerts } from '../services/noaaSpaceWeather';

/**
 * When the electric-field data on display is FROM — the older of the two
 * datasets' file times (decision D-F, step 12). The layer is only as current as
 * its most out-of-date part.
 *
 * This hook stamped its age as the moment it fetched, and as "now" even when
 * NOAA listed no files, so an empty result read as fresh. Null when neither
 * dataset carries a readable time: a caller says "untimed", never "now".
 */
export function spaceWeatherObservedAt(...datasets: ReadonlyArray<{ observedAt?: number } | null | undefined>): number | null {
  const times = datasets.map((d) => d?.observedAt).filter((t): t is number => typeof t === 'number' && Number.isFinite(t));
  return times.length ? Math.min(...times) : null;
}

/*
 * The file's time as an ISO string for a processed dataset, else the file's own
 * time_tag (a date, less exact but the source's), and never "now": the fallback
 * here was `new Date().toISOString()`, which dated space-weather intel reports
 * to the moment of fetching when NOAA did not say.
 */
const processedTimestamp = (raw: { observedAt?: number; time_tag?: string }): string =>
  raw.observedAt !== undefined ? new Date(raw.observedAt).toISOString() : (raw.time_tag ?? '');
import { ProcessedElectricFieldData, SpaceWeatherAlert, NOAAElectricFieldData } from '../types';
import { SpaceWeatherCacheService } from '../services/SpaceWeatherCacheService';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'useSpaceWeatherData' });

// AI-NOTE: Updated to use proper caching service for better performance and data persistence
// COMPLETED: Integrate with existing globe overlays and intelligence context via export utilities

interface UseSpaceWeatherData {
  interMagData: ProcessedElectricFieldData | null;
  usCanadaData: ProcessedElectricFieldData | null;
  alerts: SpaceWeatherAlert[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
  clearCache: () => void;
}

interface UseSpaceWeatherOptions {
  autoRefresh?: boolean;
  /**
   * Whether this provider is the one in use. See the note on the same option
   * in useEnterpriseSpaceWeatherData: the context runs both and reads one.
   * Defaults true so existing callers are unaffected.
   */
  enabled?: boolean;
  refreshInterval?: number; // in milliseconds
  enableAlerts?: boolean;
}

// Singleton cache service instance
const cacheService = new SpaceWeatherCacheService();

export const useSpaceWeatherData = (options: UseSpaceWeatherOptions = {}): UseSpaceWeatherData => {
  const {
    autoRefresh = true,
    enabled = true,
    refreshInterval = 5 * 60 * 1000, // 5 minutes default
    enableAlerts = true
  } = options;

  const [interMagData, setInterMagData] = useState<ProcessedElectricFieldData | null>(null);
  const [usCanadaData, setUsCanadaData] = useState<ProcessedElectricFieldData | null>(null);
  const [alerts, setAlerts] = useState<SpaceWeatherAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      setIsLoading(true);
      setError(null);

      // Check cache first unless forcing refresh
      if (!forceRefresh && cacheService.isDataFresh()) {
        const cachedData = cacheService.get('spaceWeatherData');
        if (cachedData) {
          setInterMagData(cachedData.interMagData || null);
          setUsCanadaData(cachedData.usCanadaData || null);
          setAlerts(cachedData.alerts || []);
          setLastUpdated(cachedData.lastUpdated || null);
          setIsLoading(false);
          return;
        }
      }

      const emptyDataset = (dataset: 'InterMag' | 'US-Canada'): NOAAElectricFieldData => ({
        time_tag: new Date().toISOString(),
        cadence: 60,
        product_version: dataset === 'InterMag' ? 'InterMagEarthScope' : 'US-Canada-1D',
        type: 'FeatureCollection',
        features: []
      });

      // Fetch both datasets with graceful empty fallbacks when upstream has no files
      const fetchWithEmptyFallback = async (dataset: 'InterMag' | 'US-Canada'): Promise<NOAAElectricFieldData> => {
        try {
          return await fetchLatestElectricFieldData(dataset);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes('No electric field files found')) {
            log.warn(`Space weather: ${dataset} returned no files; using empty dataset`);
            return emptyDataset(dataset);
          }
          throw err;
        }
      };

      const [interMagRaw, usCanadaRaw] = await Promise.all([
        fetchWithEmptyFallback('InterMag'),
        fetchWithEmptyFallback('US-Canada')
      ]);

      // Convert raw data to ProcessedElectricFieldData format
      const interMagProcessed: ProcessedElectricFieldData = {
        timestamp: processedTimestamp(interMagRaw),
        source: "InterMagEarthScope",
        unit: 'mV/km',
        vectors: interMagRaw.features.map(f => {
          const exRaw = f.properties.Ex; // assumed mV/km Phase 0
          const eyRaw = f.properties.Ey;
          const magnitudeRaw = Math.sqrt(exRaw ** 2 + eyRaw ** 2);
          return {
            longitude: f.geometry.coordinates[0],
            latitude: f.geometry.coordinates[1],
            ex: exRaw,
            ey: eyRaw,
            magnitude: magnitudeRaw,
            direction: Math.atan2(f.properties.Ey, f.properties.Ex) * (180 / Math.PI),
            quality: Math.max(1, f.properties.quality_flag ?? 3),
            stationDistance: f.properties.distance_nearest_station || 0,
            unit: 'mV/km' as const,
            ex_mVkm: exRaw,
            ey_mVkm: eyRaw,
            magnitude_mVkm: magnitudeRaw
          };
        }),
        coverage: {
          minLat: Math.min(...interMagRaw.features.map(f => f.geometry.coordinates[1])),
          maxLat: Math.max(...interMagRaw.features.map(f => f.geometry.coordinates[1])),
          minLon: Math.min(...interMagRaw.features.map(f => f.geometry.coordinates[0])),
          maxLon: Math.max(...interMagRaw.features.map(f => f.geometry.coordinates[0]))
        },
        statistics: {
          totalPoints: interMagRaw.features.length,
          highQualityPoints: interMagRaw.features.filter(f => (f.properties.quality_flag || 1) >= 3).length,
          maxFieldStrength: Math.max(...interMagRaw.features.map(f => Math.sqrt(f.properties.Ex ** 2 + f.properties.Ey ** 2))),
          avgFieldStrength: interMagRaw.features.reduce((sum, f) => sum + Math.sqrt(f.properties.Ex ** 2 + f.properties.Ey ** 2), 0) / interMagRaw.features.length
        }
      };

      const usCanadaProcessed: ProcessedElectricFieldData = {
        timestamp: processedTimestamp(usCanadaRaw),
        source: "US-Canada-1D",
        unit: 'mV/km',
        vectors: usCanadaRaw.features.map(f => {
          const exRaw = f.properties.Ex;
          const eyRaw = f.properties.Ey;
          const magnitudeRaw = Math.sqrt(exRaw ** 2 + eyRaw ** 2);
          return {
            longitude: f.geometry.coordinates[0],
            latitude: f.geometry.coordinates[1],
            ex: exRaw,
            ey: eyRaw,
            magnitude: magnitudeRaw,
            direction: Math.atan2(f.properties.Ey, f.properties.Ex) * (180 / Math.PI),
            quality: Math.max(1, f.properties.quality_flag ?? 3),
            stationDistance: f.properties.distance_nearest_station || 0,
            unit: 'mV/km' as const,
            ex_mVkm: exRaw,
            ey_mVkm: eyRaw,
            magnitude_mVkm: magnitudeRaw
          };
        }),
        coverage: {
          minLat: Math.min(...usCanadaRaw.features.map(f => f.geometry.coordinates[1])),
          maxLat: Math.max(...usCanadaRaw.features.map(f => f.geometry.coordinates[1])),
          minLon: Math.min(...usCanadaRaw.features.map(f => f.geometry.coordinates[0])),
          maxLon: Math.max(...usCanadaRaw.features.map(f => f.geometry.coordinates[0]))
        },
        statistics: {
          totalPoints: usCanadaRaw.features.length,
          highQualityPoints: usCanadaRaw.features.filter(f => (f.properties.quality_flag || 1) >= 3).length,
          maxFieldStrength: Math.max(...usCanadaRaw.features.map(f => Math.sqrt(f.properties.Ex ** 2 + f.properties.Ey ** 2))),
          avgFieldStrength: usCanadaRaw.features.reduce((sum, f) => sum + Math.sqrt(f.properties.Ex ** 2 + f.properties.Ey ** 2), 0) / usCanadaRaw.features.length
        }
      };
      
      setInterMagData(interMagProcessed);
      setUsCanadaData(usCanadaProcessed);
      
      let generatedAlerts: SpaceWeatherAlert[] = [];
      if (enableAlerts) {
        const interMagAlerts = generateSpaceWeatherAlerts(interMagRaw);
        const usCanadaAlerts = generateSpaceWeatherAlerts(usCanadaRaw);
        generatedAlerts = [...interMagAlerts, ...usCanadaAlerts];
        setAlerts(generatedAlerts);
      }
      
      // The data's time, not the fetch's — see spaceWeatherObservedAt.
      const observedAt = spaceWeatherObservedAt(interMagRaw, usCanadaRaw);
      const observed = observedAt === null ? null : new Date(observedAt);
      setLastUpdated(observed);

      // Cache the processed data
      cacheService.set('spaceWeatherData', {
        interMagData: interMagProcessed,
        usCanadaData: usCanadaProcessed,
        alerts: generatedAlerts,
        lastUpdated: observed
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      // If both datasets were empty but not exceptional, do not surface as blocking error
      if (errorMessage.includes('No electric field files found')) {
        log.warn('Space weather data empty; continuing without raising fatal error');
        setInterMagData(null);
        setUsCanadaData(null);
        setAlerts([]);
        // Nothing arrived, so there is no data to date. This was new Date(),
        // which captioned an empty result as fresh.
        setLastUpdated(null);
        setError(null);
      } else {
        setError(`Failed to fetch space weather data: ${errorMessage}`);
        log.error('Space weather data fetch error:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [enableAlerts]);

  const refresh = useCallback(async () => {
    await fetchData(true); // Force refresh bypasses cache
  }, [fetchData]);

  const clearCache = useCallback(() => {
    cacheService.clear();
    setInterMagData(null);
    setUsCanadaData(null);
    setAlerts([]);
    setLastUpdated(null);
  }, []);

  // Initial data fetch
  useEffect(() => {
    // `enabled` is a dependency so switching to this provider later fetches
    // then; see the note on the option.
    if (!enabled) return;
    const initializeData = async () => {
      await fetchData(); // Will use cache if available
    };

    initializeData();
  }, [enabled, fetchData]);

  // Auto-refresh setup
  useEffect(() => {
    if (!enabled || !autoRefresh) return;

    const intervalId = setInterval(() => {
      fetchData();
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [enabled, autoRefresh, refreshInterval, fetchData]);

  // Page visibility handling - pause/resume data fetching
  useEffect(() => {
    if (!enabled || !autoRefresh) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Refresh data when tab becomes visible
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, autoRefresh, fetchData]);

  return {
    interMagData,
    usCanadaData,
    alerts,
    isLoading,
    error,
    lastUpdated,
    refresh,
    clearCache
  };
};

// Additional utility hook for electric field visualization data
export const useElectricFieldVisualization = () => {
  const spaceWeatherData = useSpaceWeatherData();

  const getVisualizationVectors = useCallback(() => {
    const vectors = [];
    
    if (spaceWeatherData.interMagData) {
      vectors.push(...spaceWeatherData.interMagData.vectors);
    }
    
    if (spaceWeatherData.usCanadaData) {
      vectors.push(...spaceWeatherData.usCanadaData.vectors);
    }

    // Filter for high-quality data points only
    return vectors.filter(vector => vector.quality >= 4);
  }, [spaceWeatherData.interMagData, spaceWeatherData.usCanadaData]);

  const getAlertRegions = useCallback(() => {
    return spaceWeatherData.alerts
      .filter(alert => alert.alertType === 'electric_field_anomaly')
      .flatMap(alert => 
        alert.electricFieldData?.map(vector => ({
          longitude: vector.longitude,
          latitude: vector.latitude,
          intensity: vector.magnitude,
          severity: alert.severity
        })) || []
      );
  }, [spaceWeatherData.alerts]);

  return {
    ...spaceWeatherData,
    visualizationVectors: getVisualizationVectors(),
    alertRegions: getAlertRegions()
  };
};

// Utility functions for intelligence context integration

/**
 * Generate intelligence reports from space weather anomalies
 * Integrates with the IntelReportService for blockchain submission
 */
export const generateSpaceWeatherIntelReports = (
  interMagData: ProcessedElectricFieldData | null,
  usCanadaData: ProcessedElectricFieldData | null,
  alerts: SpaceWeatherAlert[]
) => {
  const reports = [];

  // Generate reports from high-severity alerts
  const criticalAlerts = alerts.filter(alert => alert.severity === 'extreme' || alert.severity === 'high');
  
  for (const alert of criticalAlerts) {
    if (alert.electricFieldData && alert.electricFieldData.length > 0) {
      const avgLat = alert.electricFieldData.reduce((sum, v) => sum + v.latitude, 0) / alert.electricFieldData.length;
      const avgLon = alert.electricFieldData.reduce((sum, v) => sum + v.longitude, 0) / alert.electricFieldData.length;
      const maxMagnitude = Math.max(...alert.electricFieldData.map(v => v.magnitude));
      
      reports.push({
        title: `Space Weather Alert: ${alert.alertType.replace(/_/g, ' ').toUpperCase()}`,
        content: `${alert.severity.toUpperCase()} space weather event detected. Electric field anomaly with peak magnitude ${maxMagnitude.toFixed(2)} mV/km. ${alert.message}`,
        tags: ['SPACE_WEATHER', 'ELECTROMAGNETIC', 'GEOMAGNETIC', 'PATTERN_ANALYSIS'],
        latitude: avgLat,
        longitude: avgLon,
        timestamp: new Date(alert.timestamp).getTime(),
        author: 'STARCOM Space Weather Monitor'
      });
    }
  }

  // Generate reports from statistical anomalies
  if (interMagData && interMagData.statistics.maxFieldStrength > 100) { // Threshold for anomaly
    const highestVector = interMagData.vectors.reduce((max, v) => v.magnitude > max.magnitude ? v : max);
    
    reports.push({
      title: 'High-Intensity Electric Field Detection',
      content: `Exceptional electric field strength detected: ${highestVector.magnitude.toFixed(2)} mV/km. Location shows potential geomagnetic disturbance or artificial electromagnetic signature.`,
      tags: ['SIGINT', 'ELECTROMAGNETIC', 'GEOINT'],
      latitude: highestVector.latitude,
      longitude: highestVector.longitude,
      timestamp: new Date(interMagData.timestamp).getTime(),
      author: 'STARCOM AutoIntel System'
    });
  }

  return reports;
};

/**
 * Hook specifically for intelligence context integration
 * Provides space weather data formatted for intel report overlays
 */
export const useSpaceWeatherIntelligence = () => {
  const spaceWeatherData = useSpaceWeatherData({ enableAlerts: true });
  
  const intelReports = useMemo(() => {
    return generateSpaceWeatherIntelReports(
      spaceWeatherData.interMagData,
      spaceWeatherData.usCanadaData,
      spaceWeatherData.alerts
    );
  }, [spaceWeatherData.interMagData, spaceWeatherData.usCanadaData, spaceWeatherData.alerts]);
  
  const overlayMarkers = useMemo(() => {
    return intelReports.map((report, index) => ({
      pubkey: `space-weather-${index}-${report.timestamp}`,
      title: report.title,
      content: report.content,
      tags: report.tags,
      latitude: report.latitude,
      longitude: report.longitude,
      timestamp: report.timestamp,
      author: report.author
    }));
  }, [intelReports]);

  return {
    ...spaceWeatherData,
    intelReports,
    overlayMarkers,
    hasAnomalies: intelReports.length > 0
  };
};
