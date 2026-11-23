// Alerts Data Provider for the centralized data management system
// Migrates functionality from AlertsService.ts to the new provider pattern

import { 
  DataProvider, 
  DataServiceObserver, 
  EndpointConfig, 
  FetchOptions 
} from '../interfaces';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'AlertsDataProvider' });

export interface AlertData {
  id: string;
  type: 'security' | 'weather' | 'infrastructure' | 'geological' | 'space-weather';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: string;
  location?: {
    latitude: number;
    longitude: number;
    region?: string;
  };
  source: string;
  expiresAt?: string;
  affectedAreas?: string[];
}

interface WeatherFeature {
  properties: {
    id: string;
    severity: string;
    event: string;
    description?: string;
    headline?: string;
    sent: string;
    expires?: string;
    areaDesc?: string;
  };
  geometry?: {
    coordinates: number[][];
  };
}

interface GeologicalFeature {
  id: string;
  properties: {
    id: string;
    mag: number;
    place: string;
    time: number;
    title: string;
  };
  geometry?: {
    coordinates: number[];
  };
}

export class AlertsDataProvider implements DataProvider<AlertData[]> {
  readonly id: string = 'alerts-data';
  readonly name: string = 'Alerts Data Provider';
  readonly endpoints: EndpointConfig[] = [
    {
      id: 'security-alerts',
      url: 'https://api.example.com/security-alerts', // Placeholder - would be real endpoint
      method: 'GET'
    },
    {
      id: 'weather-alerts',
      url: 'https://api.weather.gov/alerts/active', // Real NWS alerts API
      method: 'GET'
    },
    {
      id: 'geological-alerts',
      url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_hour.geojson',
      method: 'GET'
    }
  ];

  private observer?: DataServiceObserver;

  async fetchData(key: string, _options: FetchOptions = {}): Promise<AlertData[]> {
    this.observer?.onFetchStart?.(key, this.id);
    const startTime = performance.now();

    try {
      let data: AlertData[];

      switch (key) {
        case 'security-alerts':
          data = await this.fetchSecurityAlerts();
          break;
        case 'weather-alerts':
          data = await this.fetchWeatherAlerts();
          break;
        case 'geological-alerts':
          data = await this.fetchGeologicalAlerts();
          break;
        case 'all-alerts': {
          // Fetch all types and combine
          const [security, weather, geological] = await Promise.all([
            this.fetchSecurityAlerts(),
            this.fetchWeatherAlerts(),
            this.fetchGeologicalAlerts()
          ]);
          data = [...security, ...weather, ...geological];
          break;
        }
        default:
          throw new Error(`Unknown alerts data key: ${key}`);
      }

      const duration = performance.now() - startTime;
      this.observer?.onFetchEnd?.(key, duration, this.id);

      return data;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.observer?.onFetchEnd?.(key, duration, this.id);
      this.observer?.onError?.(key, error as Error, this.id);
      throw error;
    }
  }

  /**
   * No security-alert source is wired, so this returns nothing.
   *
   * ─── IT USED TO FABRICATE AN ADVISORY AND ATTRIBUTE IT TO AN AGENCY ──────
   *
   * The body returned one hardcoded alert:
   *
   *   title:       'Cyber Security Advisory'
   *   description: 'Elevated threat level for infrastructure systems'
   *   severity:    'medium'
   *   source:      a named US federal cybersecurity agency
   *   timestamp:   new Date().toISOString()   // always "now"
   *
   * That source was a real US federal cybersecurity agency. This put an
   * invented infrastructure threat warning in a federal agency's mouth,
   * timestamped to the moment it was read so it always looked current. Its own
   * comment said "return mock data or empty array" and it chose mock.
   *
   * The sibling methods here fetch REAL feeds — api.weather.gov for weather,
   * earthquake.usgs.gov for geological — and attributing those to NWS and USGS
   * is honest, because the data came from them. This one had no source to
   * attribute to, so it named an agency anyway.
   *
   * Nothing currently fetches the 'security-alerts' key, which is the only
   * reason this never reached a screen. It is registered in providerRegistry,
   * so it was one call away.
   *
   * Empty is the honest answer: no alerts, because there is no source — which
   * getSecurityAlertStatus() below states explicitly rather than leaving the
   * caller to read an empty array as "all clear".
   */
  private async fetchSecurityAlerts(): Promise<AlertData[]> {
    return [];
  }

  /**
   * Why fetchSecurityAlerts returns nothing, in a form a caller can render.
   *
   * An empty alert list and a quiet world look identical, and the difference
   * matters — the same distinction ThreatAssessmentPanel had to make when its
   * invented threats were removed.
   */
  public getSecurityAlertStatus(): { wired: boolean; reason: string } {
    return {
      wired: false,
      reason: 'No security-advisory feed is configured, so no security alerts '
        + 'are reported. This is not an all-clear.',
    };
  }

  private async fetchWeatherAlerts(): Promise<AlertData[]> {
    try {
      const response = await fetch('https://api.weather.gov/alerts/active');
      if (!response.ok) {
        throw new Error(`Weather alerts API failed: ${response.status}`);
      }

      const data = await response.json();
      
      return data.features?.map((feature: WeatherFeature) => ({
        id: feature.properties.id,
        type: 'weather' as const,
        severity: this.mapNWSSeverity(feature.properties.severity),
        title: feature.properties.event,
        description: feature.properties.description || feature.properties.headline,
        timestamp: feature.properties.sent,
        location: feature.geometry ? {
          latitude: feature.geometry.coordinates[0][1],
          longitude: feature.geometry.coordinates[0][0],
          region: feature.properties.areaDesc
        } : undefined,
        source: 'National Weather Service',
        expiresAt: feature.properties.expires,
        affectedAreas: feature.properties.areaDesc ? [feature.properties.areaDesc] : []
      })) || [];
    } catch (error) {
      log.warn('Failed to fetch weather alerts:', error);
      return [];
    }
  }

  private async fetchGeologicalAlerts(): Promise<AlertData[]> {
    try {
      const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_hour.geojson');
      if (!response.ok) {
        throw new Error(`USGS API failed: ${response.status}`);
      }

      const data = await response.json();
      
      return data.features?.map((feature: GeologicalFeature) => ({
        id: feature.id,
        type: 'geological' as const,
        severity: this.mapEarthquakeSeverity(feature.properties.mag),
        title: `Magnitude ${feature.properties.mag} Earthquake`,
        description: feature.properties.title,
        timestamp: new Date(feature.properties.time).toISOString(),
        location: feature.geometry ? {
          latitude: feature.geometry.coordinates[1],
          longitude: feature.geometry.coordinates[0],
          region: feature.properties.place
        } : undefined,
        source: 'USGS',
        affectedAreas: [feature.properties.place]
      })) || [];
    } catch (error) {
      log.warn('Failed to fetch geological alerts:', error);
      return [];
    }
  }

  subscribe(
    key: string,
    onData: (data: AlertData[]) => void,
    options: { interval?: number } = {}
  ): () => void {
    const interval = options.interval ?? 2 * 60 * 1000; // Default 2 minutes for alerts
    
    // Initial fetch
    this.fetchData(key)
      .then(onData)
      .catch(error => log.warn(`Initial alerts fetch failed for ${key}:`, error));
    
    // Set up periodic updates
    const intervalId = setInterval(async () => {
      try {
        const data = await this.fetchData(key);
        onData(data);
      } catch (error) {
        log.warn(`Alerts subscription update failed for ${key}:`, error);
      }
    }, interval);
    
    return () => clearInterval(intervalId);
  }

  setObserver(observer: DataServiceObserver): void {
    this.observer = observer;
  }

  validateData(data: unknown): data is AlertData[] {
    return Array.isArray(data) && data.every(item => 
      typeof item === 'object' && 
      item !== null && 
      'id' in item && 
      'type' in item && 
      'severity' in item &&
      'title' in item &&
      'timestamp' in item
    );
  }

  transformData(rawData: unknown): AlertData[] {
    if (this.validateData(rawData)) {
      return rawData;
    }
    throw new Error('Invalid data format for Alerts provider');
  }

  // Utility methods
  private mapNWSSeverity(nwsSeverity: string): AlertData['severity'] {
    switch (nwsSeverity?.toLowerCase()) {
      case 'extreme':
        return 'critical';
      case 'severe':
        return 'high';
      case 'moderate':
        return 'medium';
      case 'minor':
      default:
        return 'low';
    }
  }

  private mapEarthquakeSeverity(magnitude: number): AlertData['severity'] {
    if (magnitude >= 7.0) return 'critical';
    if (magnitude >= 6.0) return 'high';
    if (magnitude >= 5.0) return 'medium';
    return 'low';
  }

  // Static method to get all available data keys
  static getAvailableKeys(): string[] {
    return ['security-alerts', 'weather-alerts', 'geological-alerts', 'all-alerts'];
  }
}
