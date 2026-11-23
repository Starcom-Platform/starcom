/**
 * Unified data service for all CyberCommand visualizations
 * Provides consistent data access patterns, caching, and error handling
 */

import {
  VisualizationType,
  VisualizationData,
  VisualizationDataService,
  DataQueryOptions,
  ServiceHealthStatus,
  VisualizationError,
  sanitizeVisualizationData
} from '../types/CyberCommandVisualization';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'CyberCommandDataService' });

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

interface CacheEntry {
  data: VisualizationData[];
  timestamp: Date;
  ttl: number; // Time to live in milliseconds
}

class DataCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxEntries = 50;

  set(key: string, data: VisualizationData[], ttl: number): void {
    // Cleanup old entries if cache is full
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.getOldestKey();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data: [...data], // Create copy to prevent mutations
      timestamp: new Date(),
      ttl
    });
  }

  get(key: string): VisualizationData[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if entry has expired
    const now = new Date();
    if (now.getTime() - entry.timestamp.getTime() > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return [...entry.data]; // Return copy to prevent mutations
  }

  clear(): void {
    this.cache.clear();
  }

  private getOldestKey(): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp.getTime() < oldestTime) {
        oldestTime = entry.timestamp.getTime();
        oldestKey = key;
      }
    }

    return oldestKey;
  }
}

// =============================================================================
// RATE LIMITING
// =============================================================================

class RateLimiter {
  private requests = new Map<string, number[]>();
  private readonly windowMs = 60000; // 1 minute window
  private readonly maxRequests = 100; // Max requests per window

  canMakeRequest(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }

  reset(): void {
    this.requests.clear();
  }
}

// =============================================================================
// MAIN DATA SERVICE
// =============================================================================

export class CyberCommandDataService implements VisualizationDataService {
  public readonly type: VisualizationType;
  private cache = new DataCache();
  private rateLimiter = new RateLimiter();
  private healthStatus: ServiceHealthStatus;
  private realTimeCallback?: (data: VisualizationData[]) => void;
  private realTimeInterval?: NodeJS.Timeout;

  constructor(type: VisualizationType) {
    this.type = type;
    // Not online until a read has worked: it began online, before anything was asked.
    this.healthStatus = {
      isOnline: false,
      latency: 0,
      errorRate: 0,
      lastUpdate: new Date(),
      dataQuality: 'good'
    };
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  async getData(options?: DataQueryOptions): Promise<VisualizationData[]> {
    const startTime = Date.now();
    
    try {
      // Check rate limiting
      if (!this.rateLimiter.canMakeRequest(this.type)) {
        throw new VisualizationError(
          'Rate limit exceeded',
          this.type,
          'RATE_LIMIT_EXCEEDED',
          true
        );
      }

      // Try cache first
      const cacheKey = this.generateCacheKey(options);
      const cachedData = this.cache.get(cacheKey);
      
      if (cachedData) {
        this.updateHealthStatus(Date.now() - startTime, false);
        return this.applyFilters(cachedData, options);
      }

      // Fetch fresh data
      const rawData = await this.fetchRawData(options);
      const sanitizedData = this.sanitizeDataArray(rawData);
      const filteredData = this.applyFilters(sanitizedData, options);

      // Cache the results
      const ttl = this.getTTLForType(this.type);
      this.cache.set(cacheKey, sanitizedData, ttl);

      this.updateHealthStatus(Date.now() - startTime, false);
      return filteredData;

    } catch (error) {
      // A failed read fails. It fell back to generated records (plan item 8.3,
      // block B2).
      this.updateHealthStatus(Date.now() - startTime, true);
      throw error;
    }
  }

  getHealthStatus(): ServiceHealthStatus {
    return { ...this.healthStatus };
  }

  startRealTimeUpdates(callback: (data: VisualizationData[]) => void): void {
    this.realTimeCallback = callback;
    const interval = this.getUpdateIntervalForType(this.type);
    
    this.realTimeInterval = setInterval(async () => {
      try {
        const data = await this.getData();
        this.realTimeCallback?.(data);
      } catch (error) {
        log.error(`Real-time update failed for ${this.type}:`, error);
      }
    }, interval);
  }

  stopRealTimeUpdates(): void {
    if (this.realTimeInterval) {
      clearInterval(this.realTimeInterval);
      this.realTimeInterval = undefined;
    }
    this.realTimeCallback = undefined;
  }

  getCachedData(): VisualizationData[] | null {
    // Try to get any cached data for this type
    const cacheKey = this.generateCacheKey();
    return this.cache.get(cacheKey);
  }

  clearCache(): void {
    this.cache.clear();
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * The records behind a read. This service has no source of its own: it
   * answered every read with generated records, and failed one in twenty at
   * random "for testing" (plan item 8.3, block B2). A service with a source
   * overrides this, or getData, as RealTimeAttackService does.
   */
  protected async fetchRawData(_options?: DataQueryOptions): Promise<unknown[]> {
    throw new VisualizationError(`No source is connected for ${this.type}`, this.type, 'NO_SOURCE', false);
  }

  private sanitizeDataArray(rawData: unknown[]): VisualizationData[] {
    return rawData
      .map(sanitizeVisualizationData)
      .filter((item): item is VisualizationData => item !== null);
  }

  private applyFilters(data: VisualizationData[], options?: DataQueryOptions): VisualizationData[] {
    let filtered = [...data];

    // Time range filter
    if (options?.timeRange) {
      filtered = filtered.filter(item => {
        const itemTime = item.timestamp.getTime();
        const startTime = options.timeRange!.start.getTime();
        const endTime = options.timeRange!.end.getTime();
        return itemTime >= startTime && itemTime <= endTime;
      });
    }

    // Geographic filter
    if (options?.geoFilter) {
      filtered = filtered.filter(item => {
        const { latitude, longitude } = item.location;
        const bounds = options.geoFilter!.bounds;
        return (
          latitude >= bounds.south &&
          latitude <= bounds.north &&
          longitude >= bounds.west &&
          longitude <= bounds.east
        );
      });
    }

    // Priority filter
    if (options?.priorityFilter && options.priorityFilter.length > 0) {
      filtered = filtered.filter(item => 
        options.priorityFilter!.includes(item.priority)
      );
    }

    // Apply limit and offset
    if (options?.offset) {
      filtered = filtered.slice(options.offset);
    }
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }



  private generateCacheKey(options?: DataQueryOptions): string {
    const optionsStr = options ? JSON.stringify(options) : 'default';
    return `${this.type}-${optionsStr}`;
  }

  private getTTLForType(type: VisualizationType): number {
    // Different TTL based on data freshness requirements
    switch (type) {
      case 'CyberAttacks':
        return 30000; // 30 seconds - very fresh data needed
      case 'IntelReports':
        return 60000; // 1 minute
      case 'CommHubs':
        return 600000; // 10 minutes
      case 'Satellites':
        return 1800000; // 30 minutes - infrastructure changes slowly
      default:
        return 300000;
    }
  }

  private getUpdateIntervalForType(type: VisualizationType): number {
    // Real-time update intervals
    switch (type) {
      case 'CyberAttacks':
        return 5000; // 5 seconds
      case 'IntelReports':
        return 30000; // 30 seconds
      case 'CommHubs':
        return 120000; // 2 minutes
      case 'Satellites':
        return 300000; // 5 minutes
      default:
        return 60000;
    }
  }



  private updateHealthStatus(latency: number, hasError: boolean): void {
    this.healthStatus.latency = latency;
    this.healthStatus.lastUpdate = new Date();
    
    if (hasError) {
      this.healthStatus.errorRate = Math.min(this.healthStatus.errorRate + 0.1, 1.0);
      this.healthStatus.dataQuality = this.healthStatus.errorRate > 0.5 ? 'poor' : 'degraded';
    } else {
      this.healthStatus.errorRate = Math.max(this.healthStatus.errorRate - 0.05, 0);
      this.healthStatus.dataQuality = this.healthStatus.errorRate < 0.1 ? 'good' : 'degraded';
    }
    
    // Online when the last read worked: an error rate under 0.8 called a
    // service whose read had just failed online.
    this.healthStatus.isOnline = !hasError;
  }
}

// =============================================================================
// FACTORY AND REGISTRY
// =============================================================================

class DataServiceRegistry {
  private services = new Map<VisualizationType, CyberCommandDataService>();

  getService(type: VisualizationType): CyberCommandDataService {
    if (!this.services.has(type)) {
      this.services.set(type, new CyberCommandDataService(type));
    }
    return this.services.get(type)!;
  }

  getAllServices(): CyberCommandDataService[] {
    return Array.from(this.services.values());
  }

  clearAll(): void {
    this.services.forEach(service => {
      service.stopRealTimeUpdates();
      service.clearCache();
    });
    this.services.clear();
  }

  async getHealthSummary(): Promise<Record<VisualizationType, ServiceHealthStatus>> {
    const summary: Partial<Record<VisualizationType, ServiceHealthStatus>> = {};
    
    for (const [type, service] of this.services.entries()) {
      summary[type] = service.getHealthStatus();
    }
    
    return summary as Record<VisualizationType, ServiceHealthStatus>;
  }
}

// Export classes for testing
export { DataCache, RateLimiter };

// Export singleton instance
export const dataServiceRegistry = new DataServiceRegistry();

// Export factory function for convenience
export function createDataService(type: VisualizationType): CyberCommandDataService {
  return dataServiceRegistry.getService(type);
}
