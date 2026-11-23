// Intel Data Provider for the centralized data management system
// Migrates functionality from IntelReportService.ts to the new provider pattern
// The Solana source is gone with the wallet (plan item 4.4): it fetched nothing
// and answered with placeholder reports.

import { 
  DataProvider, 
  DataServiceObserver, 
  EndpointConfig, 
  FetchOptions 
} from '../interfaces';
// Phase 3: standardize on IntelReportUI via centralized intelReportService
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { intelReportService } from '../../intel/IntelReportService';
import { createLogger } from '@utils/logger';
import { isInformationVisibility } from '../../../types/intel/IntelItemUI';
const log = createLogger({ prefix: 'IntelDataProvider' });

// Intel Data Types
// Deprecated: IntelProviderReport (legacy shape). Prefer IntelReportUI from types.
export interface IntelProviderReport {
  pubkey: string;
  title: string;
  content: string;
  tags: string[];
  latitude: number;
  longitude: number;
  timestamp: number;
  author: string;
  signature?: string;
  verified?: boolean;
  /*
   * Was `classification?: 'UNCLASS' | 'CONFIDENTIAL' | 'SECRET' |
   * 'TOP_SECRET'` — note 'UNCLASS', a FIFTH spelling of the bottom rung,
   * matching no value any other file in this codebase produced. Five spellings
   * of one ladder across five files is what the two axes replace.
   */
  visibility?: 'public' | 'limited' | 'private';
  source?: 'SIGINT' | 'HUMINT' | 'GEOINT' | 'OSINT' | 'COMINT';
}

export interface IntelSummary {
  total_reports: number;
  recent_reports: number;
  top_tags: string[];
  geographic_coverage: {
    min_lat: number;
    max_lat: number;
    min_lng: number;
    max_lng: number;
  };
  last_updated: string;
}

export interface IntelMetrics {
  reports_by_tag: Record<string, number>;
  reports_by_author: Record<string, number>;
  reports_by_region: Record<string, number>;
  temporal_distribution: Array<{
    date: string;
    count: number;
  }>;
}

// Union type for all Intel data
export type IntelDataTypes = 
  | IntelProviderReport[] 
  | IntelReportUI[]
  | IntelSummary 
  | IntelMetrics;

export class IntelDataProvider implements DataProvider<IntelDataTypes> {
  public readonly id = 'intel-reports';
  public readonly name = 'Intelligence Data Provider';
  
  public readonly endpoints: EndpointConfig[] = [
    // Unified UI-level intel reports via centralized service
    {
      id: 'intel-ui',
      url: 'local:ui-service',
      method: 'GET'
    },
    // Intelligence summary endpoint
    {
      id: 'intel-summary',
      url: 'https://api.starcom.app/intel/summary',
      method: 'GET'
    },
    // Intelligence metrics endpoint
    {
      id: 'intel-metrics',
      url: 'https://api.starcom.app/intel/metrics',
      method: 'GET'
    },
    // OSINT aggregation endpoint
    {
      id: 'osint-feeds',
      url: 'https://api.starcom.app/intel/osint',
      method: 'GET'
    },
    // Legacy intelligence API
    {
      id: 'intel-legacy',
      url: 'https://api.starcom.app/intelligence',
      method: 'GET'
    }
  ];

  private observer?: DataServiceObserver;

  async fetchData(key: string, options: FetchOptions = {}): Promise<IntelDataTypes> {
    this.observer?.onFetchStart?.(key, this.id);
    log.debug('Fetching intel data with options:', options);

    try {
      let result: IntelDataTypes;

      switch (key) {
        case 'intel-ui':
          result = await this.fetchUnifiedIntelReports();
          break;
        case 'intel-summary':
          result = await this.fetchIntelSummary();
          break;
        case 'intel-metrics':
          result = await this.fetchIntelMetrics();
          break;
        case 'osint-feeds':
          result = await this.fetchOSINTFeeds();
          break;
        case 'intel-legacy':
        default:
          result = await this.fetchLegacyIntelReports();
          break;
      }

      this.observer?.onFetchEnd?.(key, 0, this.id);
      return result;
    } catch (error) {
      this.observer?.onError?.(key, error as Error, this.id);
      throw error;
    }
  }

  // New intelligence summary endpoint
  private async fetchIntelSummary(): Promise<IntelSummary> {
    const endpoint = this.endpoints.find(e => e.id === 'intel-summary');
    if (!endpoint) {
      throw new Error('Intel summary endpoint not configured');
    }

    const response = await fetch(endpoint.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch intel summary: ${response.status}`);
    }

    const data = await response.json() as IntelSummary;
    return data;
  }

  // New intelligence metrics endpoint
  private async fetchIntelMetrics(): Promise<IntelMetrics> {
    const endpoint = this.endpoints.find(e => e.id === 'intel-metrics');
    if (!endpoint) {
      throw new Error('Intel metrics endpoint not configured');
    }

    const response = await fetch(endpoint.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch intel metrics: ${response.status}`);
    }

    const data = await response.json() as IntelMetrics;
    return data;
  }

  // New OSINT feeds aggregation
  private async fetchOSINTFeeds(): Promise<IntelProviderReport[]> {
    const endpoint = this.endpoints.find(e => e.id === 'osint-feeds');
    if (!endpoint) {
      throw new Error('OSINT feeds endpoint not configured');
    }

    const response = await fetch(endpoint.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch OSINT feeds: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform OSINT data to our IntelReport format
    if (Array.isArray(data)) {
      return data.map(item => this.transformToIntelReport(item));
    }
    
    return [];
  }

  // Legacy intel reports fallback
  private async fetchLegacyIntelReports(): Promise<IntelProviderReport[]> {
    const endpoint = this.endpoints.find(e => e.id === 'intel-legacy');
    if (!endpoint) {
      throw new Error('Legacy intel endpoint not configured');
    }

    const response = await fetch(endpoint.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch legacy intel reports: ${response.status}`);
    }

    const data = await response.json();
    
    if (Array.isArray(data)) {
      return data.map(item => this.transformToIntelReport(item));
    }
    
    return [];
  }

  // Transform various data formats to our IntelReport interface
  private transformToIntelReport(data: Record<string, unknown>): IntelProviderReport {
    return {
      pubkey: (data.id as string) || (data.pubkey as string) || `generated-${Date.now()}`,
      title: (data.title as string) || (data.subject as string) || 'Unknown Title',
      content: (data.content as string) || (data.description as string) || (data.text as string) || '',
      tags: (data.tags as string[]) || (data.categories as string[]) || (data.keywords as string[]) || [],
      latitude: (data.latitude as number) || (data.lat as number) || ((data.location as Record<string, unknown>)?.lat as number) || 0,
      longitude: (data.longitude as number) || (data.lng as number) || ((data.location as Record<string, unknown>)?.lng as number) || 0,
      timestamp: (data.timestamp as number) || (data.created_at as number) || Date.now(),
      author: (data.author as string) || (data.source as string) || (data.collector as string) || 'Unknown',
      visibility: isInformationVisibility(data.visibility) ? data.visibility : undefined,
      source: (data.intel_type as 'SIGINT' | 'HUMINT' | 'GEOINT' | 'OSINT' | 'COMINT') || (data.source_type as 'SIGINT' | 'HUMINT' | 'GEOINT' | 'OSINT' | 'COMINT') || 'OSINT',
      verified: (data.verified as boolean) || false
    };
  }

  // Map a legacy provider report into IntelReportUI for unified consumers
  private legacyToUI(rep: IntelProviderReport): IntelReportUI {
    return {
      id: rep.pubkey,
      title: rep.title,
      content: rep.content,
      summary: rep.content.slice(0, 140),
      author: rep.author,
      category: 'General',
      tags: rep.tags,
      latitude: rep.latitude,
      longitude: rep.longitude,
      createdAt: new Date(rep.timestamp),
      updatedAt: new Date(rep.timestamp),
      // Was a three-way tier test collapsing everything else to
      // 'UNCLASSIFIED'. The axis carries across as itself.
      visibility: rep.visibility,
      status: 'DRAFT',
      conclusions: [],
      recommendations: [],
      methodology: [],
      confidence: 0.5,
      targetAudience: [],
      sourceIntelIds: [],
      version: 1,
      manualSummary: false,
      history: []
    };
  }

  // New unified fetch that returns IntelReportUI via centralized service
  // A failed read fails (plan item 8.3, block B2): it answered with three
  // invented reports, "Anomalous Signal" in sector 7G among them.
  async fetchUnifiedIntelReports(): Promise<IntelReportUI[]> {
    return intelReportService.listReports();
  }

  // Filter intel reports by various criteria
  filterReports(reports: IntelProviderReport[], filters: {
    tags?: string[];
    timeRange?: { start: number; end: number };
    geographic?: { bounds: { north: number; south: number; east: number; west: number } };
    visibility?: string[];
    author?: string[];
  }): IntelProviderReport[] {
    return reports.filter(report => {
      // Tag filtering
      if (filters.tags && filters.tags.length > 0) {
        const hasMatchingTag = filters.tags.some(tag => 
          report.tags.some(reportTag => 
            reportTag.toLowerCase().includes(tag.toLowerCase())
          )
        );
        if (!hasMatchingTag) return false;
      }

      // Time range filtering
      if (filters.timeRange) {
        if (report.timestamp < filters.timeRange.start || report.timestamp > filters.timeRange.end) {
          return false;
        }
      }

      // Geographic filtering
      if (filters.geographic) {
        const { bounds } = filters.geographic;
        if (report.latitude < bounds.south || report.latitude > bounds.north ||
            report.longitude < bounds.west || report.longitude > bounds.east) {
          return false;
        }
      }

      // Was `filters.classification` against `report.classification ||
      // 'UNCLASS'`. Same filter, on the axis that carries the meaning.
      if (filters.visibility && filters.visibility.length > 0) {
        if (!report.visibility || !filters.visibility.includes(report.visibility)) {
          return false;
        }
      }

      // Author filtering
      if (filters.author && filters.author.length > 0) {
        if (!filters.author.includes(report.author)) {
          return false;
        }
      }

      return true;
    });
  }

  subscribe(
    key: string,
    onData: (data: IntelDataTypes) => void,
    options: { interval?: number } = {}
  ): () => void {
    const interval = options.interval || 300000; // Default 5 minutes for intel reports
    
    // Initial fetch
    this.fetchData(key).then(onData).catch(error => {
      this.observer?.onError?.(key, error, this.id);
    });

    // Set up polling
    const intervalId = setInterval(async () => {
      try {
        const data = await this.fetchData(key);
        onData(data);
      } catch (error) {
        this.observer?.onError?.(key, error as Error, this.id);
      }
    }, interval);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }

  setObserver(observer: DataServiceObserver): void {
    this.observer = observer;
  }

  validateData(data: unknown): data is IntelDataTypes {
    if (Array.isArray(data)) {
      // Check if it's an array of IntelReports or IntelReportData
      if (data.length === 0) return true; // Empty array is valid
      
      const firstItem = data[0];
      return (
        typeof firstItem === 'object' && 
        firstItem !== null &&
        'title' in firstItem && 
        'content' in firstItem &&
        'timestamp' in firstItem
      );
    }
    
    // Check if it's IntelSummary format
    if (typeof data === 'object' && data !== null && 'total_reports' in data) {
      return true;
    }
    
    // Check if it's IntelMetrics format
    if (typeof data === 'object' && data !== null && 'reports_by_tag' in data) {
      return true;
    }
    
    return false;
  }

  transformData(rawData: unknown): IntelDataTypes {
    if (!this.validateData(rawData)) {
      throw new Error('Invalid intel data format');
    }
    return rawData;
  }

  // Utility methods
  getEndpointConfig(key: string): EndpointConfig | undefined {
    return this.endpoints.find(e => e.id === key);
  }

  getSupportedEndpoints(): string[] {
    return this.endpoints.map(e => e.id);
  }
}
