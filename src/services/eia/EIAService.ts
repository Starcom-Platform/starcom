// Enhanced EIA Service - Comprehensive energy intelligence data service
// Artifacts: eia-service-enhancement-spec, eia-data-expansion-specification
import { EnhancedEIAProvider } from './EIADataProvider';
import { EIA_SERIES_CONFIG } from './seriesConfig';
import { 
  EIADataPoint, 
  EnhancedEIAData, 
  BatchRequest
} from './interfaces';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'EIAService' });

// Security policy enforcement and this service's own cache-policy checking
interface SecurityPolicy {
  maxRequestsPerMinute: number;
  maxDataPointsPerRequest: number;
  allowedSeriesIds: string[];
  encryptionRequired: boolean;
  auditLoggingEnabled: boolean;
  dataRetentionDays: number;
  authorizedUsers: string[];
  /*
   * `complianceStandards: string[]` was here, listing four named regimes: an
   * accounting-firm audit report, two privacy statutes, and a security
   * framework organisations are formally assessed against.
   *
   * Listing them on an energy-data cache's policy object claimed a posture
   * nobody had assessed — and what the code did with the list was iterate it
   * and push one canned sentence per name ("Verify access controls and
   * monitoring meet <regime> requirements"), which is advice, not a check.
   */
}

interface SecurityViolation {
  type: 'RATE_LIMIT' | 'UNAUTHORIZED_SERIES' | 'DATA_RETENTION' | 'ENCRYPTION' | 'COMPLIANCE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  userId?: string;
  seriesId?: string;
  timestamp: Date;
  remediation: string;
}

/**
 * The result of checking this service's OWN cache policy — retention age and
 * recent violation rate. Not a compliance report.
 *
 * It was `CachePolicyReport`, and its status could be 'COMPLIANT', which is a
 * claim about an external standard and an audit that never happened. What the
 * checks actually establish is whether this cache is inside the limits this
 * file sets for itself, so that is what the status says.
 */
interface CachePolicyReport {
  policyVersion: string;
  lastChecked: Date;
  violations: SecurityViolation[];
  status: 'WITHIN_POLICY' | 'VIOLATIONS_DETECTED' | 'CRITICAL_VIOLATIONS';
  recommendations: string[];
}

// Custom error class for security policy violations
export class SecurityPolicyViolationError extends Error {
  constructor(public violations: SecurityViolation[]) {
    super(`Security policy violations detected: ${violations.length} violation(s)`);
    this.name = 'SecurityPolicyViolationError';
  }
}

export class EnhancedEIAService {
  private static instance: EnhancedEIAService | null = null;
  private provider: EnhancedEIAProvider;
  private cache: Map<string, { data: EIADataPoint; timestamp: number }> = new Map();
  private securityPolicy: SecurityPolicy;
  private requestCounts: Map<string, { count: number; windowStart: number }> = new Map();
  private auditLog: Array<{timestamp: Date, action: string, userId?: string, details: Record<string, unknown>}> = [];
  private cachePolicyInterval: NodeJS.Timeout | null = null;
  
  private constructor() {
    this.provider = new EnhancedEIAProvider();
    this.securityPolicy = this.loadSecurityPolicy();
    this.startCachePolicyMonitoring();
  }

  public static getInstance(): EnhancedEIAService {
    if (!EnhancedEIAService.instance) {
      EnhancedEIAService.instance = new EnhancedEIAService();
    }
    return EnhancedEIAService.instance;
  }

  public static destroy(): void {
    if (EnhancedEIAService.instance) {
      EnhancedEIAService.instance.stopCachePolicyMonitoring();
      EnhancedEIAService.instance = null;
    }
  }

  private loadSecurityPolicy(): SecurityPolicy {
    // Load security policy from configuration
    return {
      maxRequestsPerMinute: 60,
      maxDataPointsPerRequest: 5000,
      allowedSeriesIds: [
        'PET.RWTC.W', // Crude Oil Prices
        'NG.RNGWHHD.W', // Natural Gas
        'ELEC.GEN.ALL-US-99.M', // Electricity Generation
        'COAL.CONS_TOT.US-TOT.Q', // Coal Consumption
        'NUCLEAR.OPERABLE_CAPACITY.US.A', // Nuclear Capacity
        'RENEWABLES.*', // All renewable energy series (pattern)
        'TOTAL.INTL.*' // International totals (pattern)
      ],
      encryptionRequired: true,
      auditLoggingEnabled: true,
      dataRetentionDays: 90,
      authorizedUsers: ['*'], // All users authorized by default
    };
  }

  private startCachePolicyMonitoring(): void {
    // Start background cache-policy monitoring only if not already running
    if (this.cachePolicyInterval) {
      clearInterval(this.cachePolicyInterval);
    }
    
    this.cachePolicyInterval = setInterval(() => {
      this.performCachePolicyCheck();
      this.cleanupExpiredData();
    }, 300000); // Check every 5 minutes
  }

  private stopCachePolicyMonitoring(): void {
    if (this.cachePolicyInterval) {
      clearInterval(this.cachePolicyInterval);
      this.cachePolicyInterval = null;
    }
  }

  async enforceSecurityPolicy(action: string, userId?: string, seriesId?: string): Promise<void> {
    const violations: SecurityViolation[] = [];

    // 1. Rate limiting enforcement
    if (userId) {
      const rateLimit = this.checkRateLimit(userId);
      if (!rateLimit.allowed) {
        violations.push({
          type: 'RATE_LIMIT',
          severity: 'HIGH',
          message: `Rate limit exceeded: ${rateLimit.current}/${this.securityPolicy.maxRequestsPerMinute} requests per minute`,
          userId,
          timestamp: new Date(),
          remediation: 'Wait before making additional requests or contact administrator for rate limit increase'
        });
      }
    }

    // 2. Series authorization check
    if (seriesId && !this.isSeriesAuthorized(seriesId)) {
      violations.push({
        type: 'UNAUTHORIZED_SERIES',
        severity: 'CRITICAL',
        message: `Unauthorized access to EIA series: ${seriesId}`,
        userId,
        seriesId,
        timestamp: new Date(),
        remediation: 'Contact administrator to request access to this data series'
      });
    }

    // 3. User authorization check
    if (userId && !this.isUserAuthorized(userId)) {
      violations.push({
        type: 'UNAUTHORIZED_SERIES',
        severity: 'CRITICAL',
        message: `Unauthorized user access attempt: ${userId}`,
        userId,
        timestamp: new Date(),
        remediation: 'User must be added to authorized users list'
      });
    }

    // Log security violations
    if (violations.length > 0) {
      this.logSecurityViolations(violations);
      throw new SecurityPolicyViolationError(violations);
    }

    // Log successful access
    this.logAuditEvent(action, userId, { seriesId, status: 'ALLOWED' });
  }

  private checkRateLimit(userId: string): { allowed: boolean; current: number } {
    const now = Date.now();
    const windowDuration = 60000; // 1 minute in milliseconds
    
    const userRequests = this.requestCounts.get(userId);
    
    if (!userRequests || now - userRequests.windowStart > windowDuration) {
      // Start new window
      this.requestCounts.set(userId, { count: 1, windowStart: now });
      return { allowed: true, current: 1 };
    }
    
    // Increment counter
    userRequests.count++;
    
    return {
      allowed: userRequests.count <= this.securityPolicy.maxRequestsPerMinute,
      current: userRequests.count
    };
  }

  private isSeriesAuthorized(seriesId: string): boolean {
    return this.securityPolicy.allowedSeriesIds.some(pattern => {
      if (pattern.includes('*')) {
        // Convert pattern to regex
        const regexPattern = pattern.replace(/\*/g, '.*');
        return new RegExp(`^${regexPattern}$`).test(seriesId);
      }
      return pattern === seriesId;
    });
  }

  private isUserAuthorized(userId: string): boolean {
    return this.securityPolicy.authorizedUsers.includes('*') || 
           this.securityPolicy.authorizedUsers.includes(userId);
  }

  private logSecurityViolations(violations: SecurityViolation[]): void {
    violations.forEach(violation => {
      log.error('🚨 Security Policy Violation:', violation);
      
      // Store in audit log
      this.logAuditEvent('SECURITY_VIOLATION', violation.userId, {
        type: violation.type,
        severity: violation.severity,
        message: violation.message,
        seriesId: violation.seriesId
      });
    });
  }

  private logAuditEvent(action: string, userId?: string, details?: Record<string, unknown>): void {
    if (!this.securityPolicy.auditLoggingEnabled) return;

    const auditEntry = {
      timestamp: new Date(),
      action,
      userId: userId || 'anonymous',
      details: details || {}
    };

    this.auditLog.push(auditEntry);

    // Keep only recent audit entries (memory management)
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }

    // Log to console for debugging (only in development)
    if (process.env.NODE_ENV === 'development' && process.env.EIA_DEBUG_AUDIT === 'true') {
      log.debug('📋 EIA Audit:', auditEntry);
    }
  }

  async performCachePolicyCheck(): Promise<CachePolicyReport> {
    const violations: SecurityViolation[] = [];
    const recommendations: string[] = [];

    // 1. Check cache entries against the retention window
    const expiredEntries = this.getExpiredCacheEntries();
    if (expiredEntries.length > 0) {
      violations.push({
        type: 'DATA_RETENTION',
        severity: 'MEDIUM',
        message: `${expiredEntries.length} cached entries exceed retention policy`,
        timestamp: new Date(),
        remediation: 'Cleanup expired cache entries automatically'
      });
    }

    /*
     * A "check" that checked nothing stood here:
     *
     *   if (this.securityPolicy.encryptionRequired) {
     *     // In a real implementation, check if data is properly encrypted
     *     recommendations.push('Verify all cached data is encrypted at rest');
     *   }
     *
     * It read a flag set to true in this same file and pushed a sentence
     * telling the reader to go and verify the thing the check was supposed to
     * verify. Nothing encrypts this cache, so the honest report is silence
     * rather than advice that implies a control exists.
     */

    // 3. Analyze audit log for patterns
    const recentViolations = this.auditLog
      .filter(entry => entry.action === 'SECURITY_VIOLATION')
      .filter(entry => Date.now() - entry.timestamp.getTime() < 86400000); // Last 24 hours

    if (recentViolations.length > 10) {
      violations.push({
        type: 'COMPLIANCE',
        severity: 'HIGH',
        message: `High number of security violations in last 24 hours: ${recentViolations.length}`,
        timestamp: new Date(),
        remediation: 'Review security policies and user access patterns'
      });
    }

    const report: CachePolicyReport = {
      policyVersion: '1.0.0',
      lastChecked: new Date(),
      violations,
      status: violations.some(v => v.severity === 'CRITICAL') ? 'CRITICAL_VIOLATIONS' :
              violations.length > 0 ? 'VIOLATIONS_DETECTED' : 'WITHIN_POLICY',
      recommendations
    };

    // Log the cache-policy result
    this.logAuditEvent('CACHE_POLICY_CHECK', 'system', {
      status: report.status,
      violationCount: violations.length,
      recommendations: recommendations.length
    });

    return report;
  }

  private getExpiredCacheEntries(): string[] {
    const maxAge = this.securityPolicy.dataRetentionDays * 24 * 60 * 60 * 1000;
    const expired: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (Date.now() - entry.timestamp > maxAge) {
        expired.push(key);
      }
    }

    return expired;
  }

  private cleanupExpiredData(): void {
    const expired = this.getExpiredCacheEntries();
    expired.forEach(key => {
      this.cache.delete(key);
    });

    if (expired.length > 0) {
      this.logAuditEvent('DATA_CLEANUP', 'system', {
        expiredEntries: expired.length,
        retentionDays: this.securityPolicy.dataRetentionDays
      });
    }
  }

  // Enhanced public methods with security enforcement
  async getSeries(seriesId: string, userId?: string): Promise<EIADataPoint> {
    await this.enforceSecurityPolicy('GET_SERIES', userId, seriesId);
    
    // Check cache first
    const cached = this.cache.get(seriesId);
    if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
      this.logAuditEvent('CACHE_HIT', userId, { seriesId });
      return cached.data;
    }

    // Fetch from provider using the correct method name
    const data = await this.provider.fetchSeries(seriesId);
    
    // Cache the result
    this.cache.set(seriesId, { data, timestamp: Date.now() });
    
    this.logAuditEvent('DATA_FETCHED', userId, { seriesId, cached: false });
    return data;
  }

  async getCachePolicyReport(): Promise<CachePolicyReport> {
    return this.performCachePolicyCheck();
  }

  getSecurityPolicy(): SecurityPolicy {
    return { ...this.securityPolicy }; // Return copy to prevent modification
  }

  updateSecurityPolicy(updates: Partial<SecurityPolicy>): void {
    this.securityPolicy = { ...this.securityPolicy, ...updates };
    this.logAuditEvent('POLICY_UPDATE', 'admin', { updates });
  }

  // TODO: Add comprehensive security vulnerability scanning and remediation - PRIORITY: HIGH

  // Legacy compatibility methods
  static async getLatestOilPrice(): Promise<number> {
    const service = EnhancedEIAService.getInstance();
    const dataPoint = await service.getSeries('PET.RWTC.W');
    return dataPoint.value;
  }

  /*
   * These returned 3.25, 350 and 3200 as the "latest" readings "to avoid
   * 'Unknown EIA series' warnings" — a warning avoided by inventing the value,
   * with a test asserting the inventions. Same as ../EIAService.ts: they
   * refuse now.
   */
  static async getLatestGasolinePrice(): Promise<number> {
    throw new Error('No live source for the gasoline price (PET.EMM_EPM0_PTE_NUS_DPG.W)');
  }

  static async getLatestOilInventory(): Promise<number> {
    throw new Error('No live source for oil inventory (PET.WCRSTUS1.W)');
  }

  static async getLatestNaturalGasStorage(): Promise<number> {
    throw new Error('No live source for natural gas storage (NG.NW2_EPG0_SWO_R48_BCF.W)');
  }

  // Enhanced data access methods

  async getMultipleSeries(seriesIds: string[]): Promise<EIADataPoint[]> {
    if (!seriesIds || seriesIds.length === 0) {
      throw new Error('Series IDs array cannot be empty');
    }

    // What is held and still fresh is served from here; only the rest is asked
    // for. The poll runs every five minutes for figures published daily, weekly
    // or monthly, and asked EIA for every one of them every time.
    const held: EIADataPoint[] = [];
    const missing: string[] = [];
    for (const seriesId of seriesIds) {
      const cached = this.cache.get(seriesId);
      if (cached && this.isCacheValid(cached, seriesId)) held.push(cached.data);
      else missing.push(seriesId);
    }
    if (missing.length === 0) return held;

    const batchRequest: BatchRequest = {
      batchId: `batch_${Date.now()}`,
      seriesIds: missing,
      priority: 'medium'
    };

    try {
      const response = await this.provider.fetchBatch(batchRequest);
      
      // Validate response
      if (!response || !response.data) {
        throw new Error('Invalid batch response received');
      }
      
      // Cache successful results
      Object.entries(response.data).forEach(([seriesId, dataPoint]) => {
        if (dataPoint && dataPoint.value !== null && dataPoint.value !== undefined) {
          this.cache.set(seriesId, {
            data: dataPoint,
            timestamp: Date.now()
          });
        }
      });

      return [...held, ...Object.values(response.data)];
    } catch (error) {
      log.error('Batch fetch failed:', error);
      
      // Fallback to individual fetches if batch fails
      const settled = await Promise.allSettled(missing.map((seriesId) => this.getSeries(seriesId)));
      return [...held, ...settled.map((result, index): EIADataPoint => {
        const seriesId = missing[index];
        if (result.status === 'fulfilled') {
          return result.value;
        }

        log.warn(`Failed to fetch series ${seriesId}:`, result.reason);
        return {
          seriesId,
          value: null,
          timestamp: new Date(),
          units: 'unknown',
          label: 'Error',
          category: 'unknown',
          priority: 'standard',
          formattedValue: 'N/A'
        };
      })];
    }
  }

  // Category-specific data aggregation methods
  async getEnergySecurityMetrics(): Promise<Partial<EnhancedEIAData>> {
    const energySecuritySeries = Object.entries(EIA_SERIES_CONFIG)
      .filter(([, config]) => config.category === 'energy-security')
      .map(([, config]) => config.series);

    const dataPoints = await this.getMultipleSeries(energySecuritySeries);
    
    return this.mapDataPointsToEnhancedData(dataPoints);
  }

  async getRenewableEnergyStatus(): Promise<Partial<EnhancedEIAData>> {
    const renewableSeries = Object.entries(EIA_SERIES_CONFIG)
      .filter(([, config]) => config.category === 'renewables')
      .map(([, config]) => config.series);

    const dataPoints = await this.getMultipleSeries(renewableSeries);
    
    return this.mapDataPointsToEnhancedData(dataPoints);
  }

  async getMarketIntelligence(): Promise<Partial<EnhancedEIAData>> {
    const marketSeries = Object.entries(EIA_SERIES_CONFIG)
      .filter(([, config]) => config.category === 'market-intelligence')
      .map(([, config]) => config.series);

    const dataPoints = await this.getMultipleSeries(marketSeries);
    
    return this.mapDataPointsToEnhancedData(dataPoints);
  }

  async getSupplyChainMetrics(): Promise<Partial<EnhancedEIAData>> {
    const supplySeries = Object.entries(EIA_SERIES_CONFIG)
      .filter(([, config]) => config.category === 'supply-chain')
      .map(([, config]) => config.series);

    const dataPoints = await this.getMultipleSeries(supplySeries);
    
    return this.mapDataPointsToEnhancedData(dataPoints);
  }

  async getInfrastructureStatus(): Promise<Partial<EnhancedEIAData>> {
    // Map infrastructure category to power-grid and energy-security
    const infraSeries = Object.entries(EIA_SERIES_CONFIG)
      .filter(([, config]) => config.category === 'power-grid' || config.category === 'energy-security')
      .map(([, config]) => config.series);

    const dataPoints = await this.getMultipleSeries(infraSeries);
    
    return this.mapDataPointsToEnhancedData(dataPoints);
  }

  // Comprehensive data fetch for TopBar Marquee
  async getAllEnhancedData(): Promise<EnhancedEIAData> {
    const allSeries = Object.values(EIA_SERIES_CONFIG).map(config => config.series);
    
    try {
      const dataPoints = await this.getMultipleSeries(allSeries);
      const mappedData = this.mapDataPointsToEnhancedData(dataPoints);
      
      return {
        // Default values for required fields
        oilPrice: null,
        gasolinePrice: null,
        oilInventory: null,
        naturalGasStorage: null,
        naturalGasPrice: null,
        electricityGeneration: null,
        electricityPrice: null,
        solarGeneration: null,
        windGeneration: null,
        hydroGeneration: null,
        brentCrude: null,
        jetFuelSupply: null,
        refineryUtilization: null,
        crudeImports: null,
        lngExports: null,
        nuclearGeneration: null,
        coalGeneration: null,
        naturalGasGeneration: null,
        distillateSupply: null,
        propaneSupply: null,
        crudeInputs: null,
        gasolineProduction: null,
        // Metadata
        loading: false,
        error: null,
        lastUpdated: Date.now(),
        dataQuality: 'excellent',
        // Override with actual data
        ...mappedData
      };
    } catch (error) {
      return {
        oilPrice: null,
        gasolinePrice: null,
        oilInventory: null,
        naturalGasStorage: null,
        naturalGasPrice: null,
        electricityGeneration: null,
        electricityPrice: null,
        solarGeneration: null,
        windGeneration: null,
        hydroGeneration: null,
        brentCrude: null,
        jetFuelSupply: null,
        refineryUtilization: null,
        crudeImports: null,
        lngExports: null,
        nuclearGeneration: null,
        coalGeneration: null,
        naturalGasGeneration: null,
        distillateSupply: null,
        propaneSupply: null,
        crudeInputs: null,
        gasolineProduction: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastUpdated: Date.now(),
        dataQuality: 'poor'
      };
    }
  }

  // Critical data for high-priority monitoring
  async getCriticalData(): Promise<Partial<EnhancedEIAData>> {
    const criticalSeries = Object.entries(EIA_SERIES_CONFIG)
      .filter(([, config]) => config.priority === 'critical')
      .map(([, config]) => config.series);

    const dataPoints = await this.getMultipleSeries(criticalSeries);
    
    return this.mapDataPointsToEnhancedData(dataPoints);
  }

  // Service health and monitoring
  async getServiceHealth() {
    return await this.provider.getHealthStatus();
  }

  async getQuotaStatus() {
    return await this.provider.getQuotaStatus();
  }

  // Cache management
  clearCache(): void {
    this.cache.clear();
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  // Private utility methods
  private isCacheValid(cached: { data: EIADataPoint; timestamp: number }, seriesId: string): boolean {
    const config = Object.values(EIA_SERIES_CONFIG).find(c => c.series === seriesId);
    // The table's intervals are minutes. This multiplied them by a thousand, as
    // seconds, so a reading kept "60" expired after a minute.
    const maxAge = (config?.cacheTime || config?.refreshInterval || 5) * 60_000;
    
    return Date.now() - cached.timestamp < maxAge;
  }

  private mapDataPointsToEnhancedData(dataPoints: EIADataPoint[]): Partial<EnhancedEIAData> {
    const result: Partial<EnhancedEIAData> = {};
    
    if (!dataPoints || dataPoints.length === 0) {
      return result;
    }
    
    dataPoints.forEach(dataPoint => {
      if (!dataPoint || typeof dataPoint.value !== 'number') {
        return; // Skip invalid data points
      }
      
      // Each series fills the field the table names (seriesConfig.ts).
      const config = Object.values(EIA_SERIES_CONFIG).find((c) => c.series === dataPoint.seriesId);
      if (!config) {
        log.warn(`Unmapped series ID: ${dataPoint.seriesId}`);
        return;
      }
      (result as Record<string, unknown>)[config.field] = dataPoint.value;
    });
    
    return result;
  }
}

// Legacy default export for backward compatibility
export default EnhancedEIAService;
