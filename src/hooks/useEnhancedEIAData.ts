// Enhanced EIA Data Hook - React integration for comprehensive energy intelligence
// Artifacts: eia-data-expansion-specification, eia-implementation-roadmap
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { EIA_BACKED_CATEGORY_IDS } from '../components/HUD/Bars/CyberCommandTopBar/topbarCategories';
import { EnhancedEIAService } from '../services/eia/EIAService';
import { EnhancedEIAData } from '../services/eia/interfaces';
import { isEIAConfigured } from '../api/eia';
import { CREDENTIALS_CHANGED_EVENT } from '../shared/config/userCredentialStore';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'useEnhancedEIAData' });

interface UseEnhancedEIADataOptions {
  refreshInterval?: number;
  enableAutoRefresh?: boolean;
  priority?: 'critical' | 'important' | 'standard' | 'background';
  categories?: string[];
  onError?: (error: Error) => void;
  onSuccess?: (data: EnhancedEIAData) => void;
}

interface UseEnhancedEIADataReturn {
  data: EnhancedEIAData;
  loading: boolean;
  error: string | null;
  lastUpdated: number;
  refresh: () => Promise<void>;
  refreshCategory: (category: string) => Promise<void>;
  getCriticalData: () => Promise<void>;
  getServiceHealth: () => Promise<unknown>;
  clearError: () => void;
  // Enhanced state tracking
  loadingStates: Record<string, boolean>;
  dataAvailability: Record<string, boolean>;
  partialData: boolean;
  criticalDataLoaded: boolean;
  /**
   * Whether there is an EIA key to ask with. False means nothing was asked —
   * not that EIA had nothing — and a caller should say so in those words.
   */
  configured: boolean;
}

export const useEnhancedEIAData = (
  options: UseEnhancedEIADataOptions = {}
): UseEnhancedEIADataReturn => {
  const serviceRef = useRef<EnhancedEIAService>(EnhancedEIAService.getInstance());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingRef = useRef(false);
  
  // Merge options with defaults only once
  const { 
    refreshInterval = 300000, 
    enableAutoRefresh = true, 
    onError, 
    onSuccess 
  } = options;
  
  // State management
  const [data, setData] = useState<EnhancedEIAData>({
    // Energy Markets (Legacy compatibility)
    oilPrice: null,
    gasolinePrice: null,
    oilInventory: null,
    naturalGasStorage: null,
    
    // Energy Security (Critical Infrastructure)
    naturalGasPrice: null,
    electricityGeneration: null,
    electricityPrice: null,
    
    // Renewables (Clean Energy Transition)
    solarGeneration: null,
    windGeneration: null,
    hydroGeneration: null,
    
    // Market Intelligence (Economic Warfare Detection)
    brentCrude: null,
    jetFuelSupply: null,
    refineryUtilization: null,
    
    // Strategic Monitoring (National Security)
    crudeImports: null,
    lngExports: null,
    nuclearGeneration: null,
    coalGeneration: null,
    naturalGasGeneration: null,
    
    // Additional Energy Data
    distillateSupply: null,
    propaneSupply: null,
    crudeInputs: null,
    gasolineProduction: null,
    
    // Metadata
    loading: true,
    error: null,
    lastUpdated: 0,
    dataQuality: 'fair'
  });

  const [loading, setLoading] = useState(false); // Changed to false - we don't show global loading
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(0);
  const lastUpdatedRef = useRef(0);
  
  // Enhanced state tracking
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [dataAvailability, setDataAvailability] = useState<Record<string, boolean>>({});
  const [configured, setConfigured] = useState<boolean>(() => isEIAConfigured());
  
  // Derived state
  const partialData = useMemo(() => {
    const availableCount = Object.values(dataAvailability).filter(Boolean).length;
    return availableCount > 0 && availableCount < Object.keys(dataAvailability).length;
  }, [dataAvailability]);
  
  const criticalDataLoaded = useMemo(() => {
    const criticalFields = ['oilPrice', 'naturalGasPrice', 'electricityGeneration'];
    return criticalFields.some(field => data[field as keyof EnhancedEIAData] !== null);
  }, [data]);

  useEffect(() => {
    lastUpdatedRef.current = lastUpdated;
  }, [lastUpdated]);

  // Core data fetching function with progressive loading
  const fetchData = useCallback(async () => {
    if (isFetchingRef.current) {
      return;
    }

    /*
     * No key: ask nothing, and say that is why. Without this the service sent
     * every series with an empty api_key and turned twenty 403s into "no data"
     * — which told the reader EIA had nothing, when it was never asked.
     */
    const hasKey = isEIAConfigured();
    setConfigured(hasKey);
    if (!hasKey) {
      setLoadingStates({});
      setData(prev => ({ ...prev, loading: false }));
      return;
    }

    isFetchingRef.current = true;
    setError(null);
    
    try {
      const service = serviceRef.current;
      
      // Validate service instance
      if (!service) {
        throw new Error('EIA service not available');
      }
      
      /**
       * EIA FIELD names only. 'energySecurity' and 'powerGrid' used to be in
       * here too, but those are marquee categories, not fields — nothing in the
       * response is ever called that, so they were raised and never lowered.
       * The categories are handled below, by their real ids.
       */
      const criticalFields = ['oilPrice', 'naturalGasPrice', 'electricityGeneration'];
      setLoadingStates(prev => ({
        ...prev,
        ...Object.fromEntries(criticalFields.map(field => [field, true]))
      }));
      
      // Start with critical data first for immediate display
      try {
        const criticalData = await service.getCriticalData();
        if (criticalData && Object.keys(criticalData).length > 0) {
          setData(prev => ({ ...prev, ...criticalData }));

          const criticalAvailabilityUpdates: Record<string, boolean> = {};
          const criticalLoadingUpdates: Record<string, boolean> = {};
          Object.keys(criticalData).forEach(key => {
            if (criticalData[key as keyof typeof criticalData] !== null) {
              criticalAvailabilityUpdates[key] = true;
            }
            criticalLoadingUpdates[key] = false;
          });

          if (Object.keys(criticalAvailabilityUpdates).length > 0) {
            setDataAvailability(prev => ({ ...prev, ...criticalAvailabilityUpdates }));
          }
          if (Object.keys(criticalLoadingUpdates).length > 0) {
            setLoadingStates(prev => ({ ...prev, ...criticalLoadingUpdates }));
          }
          
          setLastUpdated(Date.now());
        }
      } catch (criticalError) {
        log.warn('Critical data fetch failed, continuing with full fetch:', criticalError);
        // Clear loading states for failed critical data
        setLoadingStates(prev => ({
          ...prev,
          ...Object.fromEntries(criticalFields.map(field => [field, false]))
        }));
      }
      
      /**
       * Flag the marquee categories as loading, by the ids the marquee itself
       * uses. This list was camelCase while the categories are kebab-case, so
       * the flags addressed nothing — apart from 'renewables', identical in
       * both, which is why that one category alone sat under a spinner
       * forever while its siblings correctly showed "no data".
       */
      setLoadingStates(prev => ({
        ...prev,
        ...Object.fromEntries(EIA_BACKED_CATEGORY_IDS.map(id => [id, true]))
      }));
      
      // Then fetch all enhanced data
      const enhancedData = await service.getAllEnhancedData();
      
      // Validate data structure
      if (!enhancedData || typeof enhancedData !== 'object') {
        throw new Error('Invalid data structure received from EIA service');
      }
      
      setData(enhancedData);
      setLastUpdated(Date.now());
      
      // Update data availability and loading states for all data
      const availabilityUpdates: Record<string, boolean> = {};
      const loadingUpdates: Record<string, boolean> = {};
      /**
       * Clear the category flags set above. The loop below clears by EIA FIELD
       * name (oilPrice, solarGeneration...), and no field is ever named after a
       * category — so without this line the flags raised before the fetch were
       * only ever lowered by the error path, and a successful fetch left them
       * raised for the life of the page.
       */
      for (const id of EIA_BACKED_CATEGORY_IDS) loadingUpdates[id] = false;

      Object.keys(enhancedData).forEach(key => {
        loadingUpdates[key] = false;
        if (
          enhancedData[key as keyof EnhancedEIAData] !== null &&
          key !== 'loading' &&
          key !== 'error' &&
          key !== 'lastUpdated' &&
          key !== 'dataQuality'
        ) {
          availabilityUpdates[key] = true;
        }
      });

      if (Object.keys(availabilityUpdates).length > 0) {
        setDataAvailability(prev => ({ ...prev, ...availabilityUpdates }));
      }
      if (Object.keys(loadingUpdates).length > 0) {
        setLoadingStates(prev => ({ ...prev, ...loadingUpdates }));
      }
      
      // Call success callback if provided
      onSuccess?.(enhancedData);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      
      log.error('EIA data fetch error:', err);
      
      // Clear all loading states on error
      setLoadingStates({});
      
      // Call error callback if provided
      onError?.(err instanceof Error ? err : new Error(errorMessage));
      
      // Don't clear existing data on error - graceful degradation
      setData(prev => ({
        ...prev,
        error: errorMessage,
        loading: false,
        dataQuality: 'poor',
        lastUpdated: Date.now()
      }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [onSuccess, onError]); // Include callback dependencies

  // Category-specific data fetching with validation
  const refreshCategory = useCallback(async (category: string) => {
    setLoading(true);
    setError(null);
    
    // Validate category
    const validCategories = ['energy-security', 'renewables', 'market-intelligence', 'supply-chain', 'infrastructure'];
    if (!validCategories.includes(category)) {
      setError(`Invalid category: ${category}`);
      setLoading(false);
      return;
    }
    
    try {
      const service = serviceRef.current;
      
      if (!service) {
        throw new Error('EIA service not available');
      }
      
      let categoryData: Partial<EnhancedEIAData> = {};
      
      switch (category) {
        case 'energy-security':
          categoryData = await service.getEnergySecurityMetrics();
          break;
        case 'renewables':
          categoryData = await service.getRenewableEnergyStatus();
          break;
        case 'market-intelligence':
          categoryData = await service.getMarketIntelligence();
          break;
        case 'supply-chain':
          categoryData = await service.getSupplyChainMetrics();
          break;
        case 'infrastructure':
          categoryData = await service.getInfrastructureStatus();
          break;
        default:
          throw new Error(`Unknown category: ${category}`);
      }
      
      // Validate category data
      if (!categoryData || typeof categoryData !== 'object') {
        throw new Error(`Invalid data received for category: ${category}`);
      }
      
      // Merge category data with existing data
      setData(prev => ({
        ...prev,
        ...categoryData,
        lastUpdated: Date.now(),
        error: null,
        loading: false,
        dataQuality: 'good'
      }));
      
      setLastUpdated(Date.now());
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : `Unknown error occurred for category: ${category}`;
      setError(errorMessage);
      log.error(`Category refresh error for ${category}:`, err);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  // Critical data refresh (high priority)
  const getCriticalData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const service = serviceRef.current;
      const criticalData = await service.getCriticalData();
      
      // Merge critical data with existing data
      setData(prev => ({
        ...prev,
        ...criticalData,
        lastUpdated: Date.now(),
        error: null,
        loading: false,
        dataQuality: 'excellent'
      }));
      
      setLastUpdated(Date.now());
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  // Service health monitoring
  const getServiceHealth = useCallback(async () => {
    try {
      const service = serviceRef.current;
      return await service.getServiceHealth();
    } catch (err) {
      log.error('Failed to get service health:', err);
      return null;
    }
  }, []);

  // Error management
  const clearError = useCallback(() => {
    setError(null);
    setData(prev => ({
      ...prev,
      error: null
    }));
  }, []);

  // Auto-refresh setup
  useEffect(() => {
    if (typeof document === 'undefined' || !document.hidden) {
      fetchData();
    }
  }, [fetchData]);

  // Separate effect for auto-refresh interval management
  useEffect(() => {
    // Clear existing interval when options change
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Setup auto-refresh if enabled
    if (enableAutoRefresh && refreshInterval) {
      intervalRef.current = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) {
          return;
        }
        void fetchData();
      }, refreshInterval);
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        return;
      }

      if (
        enableAutoRefresh &&
        refreshInterval &&
        Date.now() - lastUpdatedRef.current >= refreshInterval
      ) {
        void fetchData();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    
    // Cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [fetchData, enableAutoRefresh, refreshInterval]);

  // A key saved or cleared in the provider panel takes effect now, not at the
  // next five-minute tick — which would look like the key did nothing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onCredentialsChanged = (event: Event) => {
      if ((event as CustomEvent<{ providerId?: string }>).detail?.providerId === 'eia') void fetchData();
    };
    window.addEventListener(CREDENTIALS_CHANGED_EVENT, onCredentialsChanged);
    return () => window.removeEventListener(CREDENTIALS_CHANGED_EVENT, onCredentialsChanged);
  }, [fetchData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh: fetchData,
    refreshCategory,
    getCriticalData,
    getServiceHealth,
    clearError,
    // Enhanced state tracking
    loadingStates,
    dataAvailability,
    partialData,
    criticalDataLoaded,
    configured
  };
};

// Specialized hooks for specific use cases
export const useEIAEnergySecurityData = () => {
  return useEnhancedEIAData({
    categories: ['energy-security'],
    priority: 'critical',
    refreshInterval: 180000 // 3 minutes for critical data
  });
};

export const useEIARenewableEnergyData = () => {
  return useEnhancedEIAData({
    categories: ['renewables'],
    priority: 'important',
    refreshInterval: 300000 // 5 minutes
  });
};

export const useEIAMarketIntelligenceData = () => {
  return useEnhancedEIAData({
    categories: ['market-intelligence'],
    priority: 'important',
    refreshInterval: 240000 // 4 minutes
  });
};

// Hook for TopBar Marquee - optimized for real-time display
export const useEIATopBarData = () => {
  return useEnhancedEIAData({
    categories: ['energy-security', 'market-intelligence', 'renewables', 'supply-chain'],
    priority: 'critical',
    refreshInterval: 300000, // 5 minutes
    enableAutoRefresh: true
  });
};

export default useEnhancedEIAData;
