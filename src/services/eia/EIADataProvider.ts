// Enhanced EIADataProvider: Implements batch fetching and optimized API usage
// Artifacts: eia-provider-enhancement-spec, data-service-interfaces, eia-data-expansion-specification
import { DataProvider, DataServiceObserver } from '../data-service-interfaces';
import { fetchEIAData } from '../../api/eia';
import { 
  EIADataPoint, 
  BatchRequest, 
  BatchResponse, 
  EIAError, 
  EIAErrorType, 
  EIASeriesConfig,
  RetryConfig,
  ProviderHealth,
  QuotaStatus
} from './interfaces';
import { EIA_SERIES_CONFIG, formatValue } from './seriesConfig';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'EIADataProvider' });

// TODO: Implement comprehensive intel report metadata extraction and indexing - PRIORITY: MEDIUM
// TODO: Add support for intel report collaborative verification workflows - PRIORITY: HIGH
/** How a series is published, from its id: `.D` daily, `.W` weekly, `.M` monthly. */
type Cadence = 'daily' | 'weekly' | 'monthly';
const cadenceOf = (seriesId: string): Cadence =>
  (seriesId.endsWith('.D') ? 'daily' : seriesId.endsWith('.M') ? 'monthly' : 'weekly');

/**
 * How old a reading may be and still be shown as current. EIA publishes
 * weekly figures a few days late and monthly ones two or three months late, so
 * these are generous; a series past them has stopped, as NG.RNGC1.D had.
 */
const STALE_AFTER_DAYS: Record<Cadence, number> = { daily: 14, weekly: 35, monthly: 183 };

/** The start of an EIA period: `2026-09-25`, `2026-07` or `2026`. Null when it is none of these. */
function periodStart(period: unknown): Date | null {
  if (typeof period !== 'string') return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(period.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, m[3] ? Number(m[3]) : 1));
}

export class EnhancedEIAProvider implements DataProvider<number> {
  private observer?: DataServiceObserver;
  private requestQueue: Map<string, Promise<EIADataPoint>> = new Map();
  private rateLimitWindow: number = 1000; // 1 second window for rate limiting
  private maxRequestsPerWindow: number = 5; // EIA API limit
  private requestTimes: number[] = [];
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  };

  // Create a reverse mapping from EIA series ID to config key
  private seriesIdToConfigKey: Map<string, string> = new Map();

  constructor() {
    // Build reverse mapping from EIA series ID to config key
    Object.entries(EIA_SERIES_CONFIG).forEach(([configKey, config]) => {
      this.seriesIdToConfigKey.set(config.series, configKey);
    });
  }

  setObserver(observer: DataServiceObserver) {
    this.observer = observer;
  }

  // Legacy compatibility method
  async fetchData(key: string): Promise<number> {
    const dataPoint = await this.fetchSeries(key);
    return dataPoint.value;
  }

  // Enhanced single series fetching with full context
  async fetchSeries(seriesId: string): Promise<EIADataPoint> {
    this.observer?.onFetchStart?.(seriesId);
    const start = Date.now();
    
    try {
      // Check if request is already in progress
      if (this.requestQueue.has(seriesId)) {
        const result = await this.requestQueue.get(seriesId);
        return result;
      }

      // Check rate limiting
      await this.enforceRateLimit();

      // Get series configuration using reverse lookup
      const configKey = this.seriesIdToConfigKey.get(seriesId);
      const seriesConfig = configKey ? EIA_SERIES_CONFIG[configKey] : null;
      
      if (!seriesConfig) {
        // Graceful fallback for unknown series - log warning but return null data
        log.warn(`Unknown EIA series: ${seriesId} - using fallback data`);
        this.observer?.onError?.(seriesId, new Error(`Unknown series: ${seriesId}`));
        
        // Return null data point to trigger fallback values in hooks
        return {
          seriesId,
          value: null,
          timestamp: new Date(),
          units: '',
          label: 'Unavailable',
          category: 'unknown',
          priority: 'standard' as const,
          formattedValue: 'N/A'
        };
      }

      // Create request promise and add to queue
      const requestPromise = this.executeSingleRequest(seriesId, seriesConfig);
      this.requestQueue.set(seriesId, requestPromise);

      try {
        const result = await requestPromise;
        this.observer?.onFetchEnd?.(seriesId, Date.now() - start);
        return result;
      } finally {
        this.requestQueue.delete(seriesId);
      }
    } catch (error) {
      this.observer?.onError?.(seriesId, error as Error);
      throw error;
    }
  }

  // Batch fetching with intelligent grouping
  async fetchBatch(request: BatchRequest): Promise<BatchResponse> {
    const { batchId, seriesIds, priority = 'medium' } = request;
    const start = Date.now();
    const data: Record<string, EIADataPoint> = {};
    const errors: Record<string, Error> = {};

    this.observer?.onFetchStart?.(batchId);

    try {
      // Group series by batch configuration for optimal API usage
      const batches = this.groupSeriesForBatching(seriesIds);
      
      // Process batches with appropriate delays
      for (const batch of batches) {
        await this.enforceRateLimit();
        
        try {
          const batchResults = await this.executeBatchRequest(batch);
          Object.assign(data, batchResults);
        } catch (error) {
          // Store errors for individual series in failed batch
          batch.forEach(seriesId => {
            errors[seriesId] = error as Error;
          });
        }
      }

      const response: BatchResponse = {
        batchId,
        data,
        errors,
        metadata: {
          totalRequested: seriesIds.length,
          successful: Object.keys(data).length,
          failed: Object.keys(errors).length,
          duration: Date.now() - start,
          priority
        }
      };

      this.observer?.onFetchEnd?.(batchId, Date.now() - start);
      return response;
    } catch (error) {
      this.observer?.onError?.(batchId, error as Error);
      throw error;
    }
  }

  // Multiple batch processing with priority handling
  async fetchBatchWithPriority(batches: BatchRequest[]): Promise<BatchResponse[]> {
    // Sort batches by priority (high -> medium -> low)
    const sortedBatches = [...batches].sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority || 'medium'] - priorityOrder[a.priority || 'medium'];
    });

    const results: BatchResponse[] = [];
    
    for (const batch of sortedBatches) {
      try {
        const result = await this.fetchBatch(batch);
        results.push(result);
      } catch (error) {
        // Continue processing other batches even if one fails
        results.push({
          batchId: batch.batchId,
          data: {},
          errors: { [batch.batchId]: error as Error },
          metadata: {
            totalRequested: batch.seriesIds.length,
            successful: 0,
            failed: batch.seriesIds.length,
            duration: 0,
            priority: batch.priority || 'medium'
          }
        });
      }
    }

    return results;
  }

  // Health monitoring
  async getHealthStatus(): Promise<ProviderHealth> {
    const now = Date.now();
    const recentRequests = this.requestTimes.filter(time => now - time < 60000); // Last minute
    
    return {
      isHealthy: recentRequests.length < this.maxRequestsPerWindow * 60, // Not hitting rate limits
      requestsPerMinute: recentRequests.length,
      queueSize: this.requestQueue.size,
      lastRequestTime: this.requestTimes[this.requestTimes.length - 1] || 0,
      uptime: now - (this.startTime || now)
    };
  }

  // Quota monitoring
  async getQuotaStatus(): Promise<QuotaStatus> {
    const now = Date.now();
    const hourRequests = this.requestTimes.filter(time => now - time < 3600000); // Last hour
    const dailyRequests = this.requestTimes.filter(time => now - time < 86400000); // Last day
    
    return {
      hourlyUsage: hourRequests.length,
      dailyUsage: dailyRequests.length,
      hourlyLimit: this.maxRequestsPerWindow * 3600, // Theoretical max per hour
      dailyLimit: 5000, // EIA API daily limit
      remainingHourly: Math.max(0, (this.maxRequestsPerWindow * 3600) - hourRequests.length),
      remainingDaily: Math.max(0, 5000 - dailyRequests.length)
    };
  }

  // Private implementation methods
  private async executeSingleRequest(seriesId: string, seriesConfig: EIASeriesConfig): Promise<EIADataPoint> {
    const endpoint = `seriesid/${seriesId}`;
    // The newest row only. Without `length` EIA sends up to 5,000 rows of
    // history, 1.4 MB for the daily oil price, to read one value.
    const params: Record<string, string> = { length: '1', 'sort[0][column]': 'period', 'sort[0][direction]': 'desc' };
    
    const dataArr = await fetchEIAData(endpoint, params);
    if (!dataArr || !Array.isArray(dataArr) || dataArr.length === 0) {
      throw new EIAError(
        `No EIA data returned for ${seriesId}`,
        EIAErrorType.API_UNAVAILABLE,
        seriesId
      );
    }

    const latest = dataArr[0];
    // EIA v2 names the value by what it is: `value` for most series,
    // `generation` for generation, `price` for the electricity price.
    const raw = latest.value ?? latest.generation ?? latest.price;
    let value: number;
    if (raw !== undefined && raw !== null) {
      value = typeof raw === 'number' ? raw : parseFloat(raw);
    } else {
      throw new EIAError(
        `No value field found in EIA response for ${seriesId}`,
        EIAErrorType.DATA_STALE,
        seriesId
      );
    }
    
    if (isNaN(value)) {
      throw new EIAError(
        `Invalid EIA value for ${seriesId}`,
        EIAErrorType.DATA_STALE,
        seriesId
      );
    }

    // Never shown as current when it is not: the gas price this read once had
    // not changed since April 2024, and the marquee showed it as today's.
    const asOf = periodStart(latest.period);
    if (asOf === null) {
      throw new EIAError(`EIA sent no period it can date for ${seriesId}`, EIAErrorType.DATA_STALE, seriesId);
    }
    const ageDays = (Date.now() - asOf.getTime()) / 86_400_000;
    const limit = STALE_AFTER_DAYS[cadenceOf(seriesId)];
    if (ageDays > limit) {
      throw new EIAError(
        `EIA's newest ${seriesId} reading is from ${latest.period}, too old to show as current`,
        EIAErrorType.DATA_STALE,
        seriesId,
      );
    }

    return {
      seriesId,
      value,
      timestamp: asOf,
      period: latest.period,
      units: seriesConfig.units || '',
      label: seriesConfig.label,
      category: seriesConfig.category,
      priority: seriesConfig.priority,
      securityContext: seriesConfig.securityContext,
      formattedValue: formatValue(value, seriesConfig)
    };
  }

  private async executeBatchRequest(seriesIds: string[]): Promise<Record<string, EIADataPoint>> {
    const results: Record<string, EIADataPoint> = {};
    
    // EIA API doesn't support true batch requests, so we need to make individual requests
    // but we can optimize by making them concurrently within rate limits
    const promises = seriesIds.map(async (seriesId) => {
      const dataPoint = await this.fetchSeries(seriesId);
      results[seriesId] = dataPoint;
    });

    await Promise.allSettled(promises);
    return results;
  }

  private groupSeriesForBatching(seriesIds: string[]): string[][] {
    // Group series based on configuration batch groups for optimal API usage
    const batches: string[][] = [];
    const batchGroups: Record<string, string[]> = {};
    
    // Group by batch configuration
    seriesIds.forEach(seriesId => {
      const configKey = this.seriesIdToConfigKey.get(seriesId);
      const config = configKey ? EIA_SERIES_CONFIG[configKey] : null;
      const batchGroup = config?.batchGroup || 'default';
      
      if (!batchGroups[batchGroup]) {
        batchGroups[batchGroup] = [];
      }
      batchGroups[batchGroup].push(seriesId);
    });

    // Convert groups to batches with size limits
    Object.values(batchGroups).forEach(group => {
      const batchSize = 5; // Conservative batch size for rate limiting
      for (let i = 0; i < group.length; i += batchSize) {
        batches.push(group.slice(i, i + batchSize));
      }
    });

    return batches;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Clean old request times
    this.requestTimes = this.requestTimes.filter(time => now - time < this.rateLimitWindow);
    
    // Check if we're at the rate limit
    if (this.requestTimes.length >= this.maxRequestsPerWindow) {
      const oldestRequest = Math.min(...this.requestTimes);
      const waitTime = this.rateLimitWindow - (now - oldestRequest);
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Record this request
    this.requestTimes.push(now);
  }

  private startTime = Date.now();
}

// Export the class for use in other modules
export { EnhancedEIAProvider as EIADataProvider };
export default EnhancedEIAProvider;
