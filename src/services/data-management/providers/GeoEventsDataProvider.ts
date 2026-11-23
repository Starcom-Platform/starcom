// GeoEvents Data Provider for the centralized data management system
// Migrates functionality from GeoEventsService.ts to the new provider pattern
// Supports natural events data (earthquakes, volcanoes, etc.)

import { 
  DataProvider, 
  DataServiceObserver, 
  EndpointConfig, 
  FetchOptions 
} from '../interfaces';
import { env } from '../../../config/env';
import { gdacsEvents, GDACS_LIST_URL, type GdacsFeature, type GdacsHazardType, type GdacsResponse } from '../../gdacs/gdacsList';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'GeoEventsDataProvider' });

// GeoEvents Data Types
export interface NaturalEvent {
  id: string | number;
  lat: number;
  lng: number;
  type: string; // e.g., 'earthquake', 'volcano', 'wildfire', 'flood', 'drought', 'hurricane'
  magnitude?: number;
  intensity?: number;
  status?: string;
  timestamp?: string;
  description?: string;
  source?: string;
  severityOverride?: 'minor' | 'major' | 'catastrophic';
  // Earthquake-specific real fields — both already present in USGS's GeoJSON feed
  // (depth as coords[2], tsunami as a real properties flag) but previously fetched
  // and discarded without being mapped through.
  depthKm?: number;
  tsunami?: boolean;
  // A USGS quake's detail, given only where the feed's `types` name a ShakeMap: its
  // shaking contours are read from it (ShakeMapService.ts; D-EQ, EQ11).
  shakeMapDetailUrl?: string;
  // Who reported a quake (quakeWindow.ts; D-EQ, EQ2).
  reportedBy?: string[];
  // GDACS flood/drought/hurricane events only — the real per-event geometry endpoint
  // (see GdacsGeometryService.ts) and the numeric event id it needs.
  gdacsEventId?: number;
  gdacsGeometryUrl?: string;
  // The event's own page at its publisher (USGS's event page, the EONET source's page,
  // GDACS's report), which a click on its mark links to (critique C5). Only as the feed
  // gives it: an event whose feed names no page has none.
  sourceUrl?: string;
}

export interface USGSEarthquakeData {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      mag: number;
      place: string;
      time: number;
      updated: number;
      tz: number;
      url: string;
      detail: string;
      felt: number | null;
      cdi: number | null;
      mmi: number | null;
      alert: string | null;
      status: string;
      tsunami: number;
      sig: number;
      net: string;
      code: string;
      ids: string;
      sources: string;
      types: string;
      nst: number | null;
      dmin: number | null;
      rms: number;
      gap: number | null;
      magType: string;
      type: string;
      title: string;
    };
    geometry: {
      type: 'Point';
      coordinates: [number, number, number]; // [lng, lat, depth]
    };
    id: string;
  }>;
}

export interface VolcanicEvent {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: 'active' | 'dormant' | 'extinct';
  last_eruption?: string;
  source?: string;
  /** Its page at the source EONET names (the Smithsonian GVP's), as NaturalEvent.sourceUrl. */
  sourceUrl?: string;
  isMock?: boolean;
  // Static registry metadata (elevation, rock type, country/region) — not populated by
  // the current NASA EONET-backed real data path, which reports eruption *events* rather
  // than a catalog of known volcanoes. Left optional for a possible future richer source
  // (e.g. the Smithsonian GVP volcano registry itself).
  elevation?: number;
  type?: string;
  country?: string;
  region?: string;
}

// NASA EONET (Earth Observatory Natural Event Tracker) — real, live, keyless, CORS-open
// (`Access-Control-Allow-Origin: *`, verified directly) global event feed. Used here for
// both wildfires and volcanoes: NASA FIRMS (the previous wildfire source) blocks browser
// CORS, and there was never a real volcano source at all (hardcoded mock data). EONET's
// wildfire category is IRWIN-sourced (US wildland fire); its volcano category is sourced
// from the Smithsonian Institution's Global Volcanism Program.
interface EonetGeometryPoint {
  date: string;
  type: string;
  coordinates: [number, number] | [number, number, number];
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
}

interface EonetEvent {
  id: string;
  title: string;
  description: string | null;
  closed: string | null;
  categories: Array<{ id: string; title: string }>;
  sources: Array<{ id: string; url: string }>;
  geometry: EonetGeometryPoint[];
}

interface EonetResponse {
  title: string;
  events: EonetEvent[];
}

// GDACS (Global Disaster Alert and Coordination System, gdacs.org) — real, live,
// keyless, CORS-open (`Access-Control-Allow-Origin: *`, verified directly). Tracks
// exactly 6 hazard types (EQ/TC/FL/VO/DR/WF); used here only for the 3 EONET has no
// real coverage for at all (floods, droughts, tropical cyclones both had zero current
// or historical events in EONET at verification time). Already-shipped earthquake/
// wildfire/volcano sources are untouched — this is additive, not a replacement.
type GdacsEventType = Extract<GdacsHazardType, 'FL' | 'DR' | 'TC'>;

// Union type for all GeoEvents data
export type GeoEventsDataTypes = 
  | NaturalEvent[] 
  | USGSEarthquakeData 
  | VolcanicEvent[];

/** An event's page, when its feed gives one: a field it left out stays out. */
const pageOf = (url: unknown): { sourceUrl?: string } =>
  (typeof url === 'string' && url.trim() ? { sourceUrl: url.trim() } : {});

/** "NASA EONET (IRWIN)", "NASA EONET (GDACS)": the agencies an EONET event names as its sources. */
const eonetSourceName = (event: EonetEvent): string => {
  const ids = [...new Set((event.sources ?? []).map((source) => source?.id).filter((id): id is string => Boolean(id)))];
  return ids.length ? `NASA EONET (${ids.join(', ')})` : 'NASA EONET';
};

export class GeoEventsDataProvider implements DataProvider<GeoEventsDataTypes> {
  public readonly id = 'geo-events';
  public readonly name = 'GeoEvents Data Provider';
  private static readonly DEFAULT_TIMEOUT_MS = 12000;
  private static readonly DEFAULT_RETRIES = 1;
  private readonly lastGoodData = new Map<string, { data: GeoEventsDataTypes; timestamp: number }>();
  private readonly warnOnceTags = new Set<string>();
  // Raw GDACS payload, shared across the floods/droughts/hurricanes endpoints (all
  // three read from this one feed) — separate from lastGoodData, which caches each
  // endpoint's already-filtered-and-mapped *output*, not this shared raw input.
  private gdacsRawCache: { data: GdacsFeature[]; timestamp: number } | null = null;
  private static readonly GDACS_CACHE_MS = 5 * 60 * 1000;
  
  public readonly endpoints: EndpointConfig[] = [
    // USGS Earthquake data - real-time
    {
      id: 'earthquakes-recent',
      url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
      method: 'GET'
    },
    {
      id: 'earthquakes-major',
      url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson',
      method: 'GET'
    },
    {
      id: 'earthquakes-all',
      url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
      method: 'GET'
    },
    // Wildfires - NASA EONET (IRWIN-sourced). Replaces the previous NASA FIRMS CSV
    // endpoint, which blocks browser CORS (verified directly) and was disabled outright.
    {
      id: 'wildfires-eonet',
      url: 'https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open',
      method: 'GET'
    },
    // Volcanoes - NASA EONET (Smithsonian GVP-sourced). Replaces the previous hardcoded
    // 2-entry mock dataset with real, live, currently-active volcanic events.
    {
      id: 'volcanoes',
      url: 'https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes&status=open',
      method: 'GET'
    },
    // Floods / droughts / hurricanes - GDACS. All three share this one endpoint (GDACS
    // returns every hazard type it tracks in a single feed) — fetchGdacsRaw() caches
    // the raw fetch so requesting all three costs one real network call, not three.
    {
      id: 'gdacs-current',
      url: GDACS_LIST_URL,
      method: 'GET'
    }
  ];

  private observer?: DataServiceObserver;

  async fetchData(key: string, options: FetchOptions = {}): Promise<GeoEventsDataTypes> {
    const startTime = Date.now();
    this.observer?.onFetchStart?.(key, this.id);
    this.logInfo('Fetch start', key, { options });

    const timeoutMs = options.timeout ?? GeoEventsDataProvider.DEFAULT_TIMEOUT_MS;
    const retries = options.retries ?? GeoEventsDataProvider.DEFAULT_RETRIES;

    try {
      let result: GeoEventsDataTypes;

      switch (key) {
        case 'earthquakes-recent':
        case 'earthquakes-major':
        case 'earthquakes-all': {
          const endpoint = this.endpoints.find(e => e.id === key);
          if (!endpoint) {
            this.warnOnce(`missing-endpoint-${key}`, `Endpoint missing for ${key}; returning empty.`);
            result = [];
          } else {
            result = await this.fetchUSGSEarthquakes(key, { timeoutMs, retries });
          }
          break;
        }
        case 'wildfires-eonet':
          result = await this.fetchWildfireData({ timeoutMs, retries });
          break;
        case 'volcanoes':
          result = await this.fetchVolcanicData({ timeoutMs, retries });
          break;
        case 'floods-gdacs':
          result = await this.fetchGdacsByType('FL', { timeoutMs, retries });
          break;
        case 'droughts-gdacs':
          result = await this.fetchGdacsByType('DR', { timeoutMs, retries });
          break;
        case 'hurricanes-gdacs':
          result = await this.fetchGdacsByType('TC', { timeoutMs, retries });
          break;
        case 'natural-events-legacy':
          result = await this.fetchLegacyNaturalEvents({ timeoutMs, retries });
          break;
        default: {
          this.warnOnce(`unknown-key-${key}`, `Unknown geo-events key '${key}' requested; falling back to earthquakes-recent.`);
          result = await this.fetchUSGSEarthquakes('earthquakes-recent', { timeoutMs, retries });
        }
      }

      const duration = Date.now() - startTime;
      this.recordGoodData(key, result);
      this.observer?.onFetchEnd?.(key, duration, this.id);
      this.logInfo('Fetch complete', key, { durationMs: duration, source: this.id });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.observer?.onError?.(key, error as Error, this.id);
      this.observer?.onFetchEnd?.(key, duration, this.id);
      this.logError('Fetch failed', key, error as Error, { durationMs: duration, timeoutMs, retries });

      const cached = this.lastGoodData.get(key);
      if (cached) {
        this.logWarn('Serving last known good data after failure', key, { ageMs: Date.now() - cached.timestamp });
        return cached.data;
      }

      throw error;
    }
  }

  // Migrated from original GeoEventsService.ts with improvements
  private async fetchLegacyNaturalEvents(opts: { timeoutMs: number; retries: number }): Promise<NaturalEvent[]> {
    const apiUrl = env.geoEventsApiUrl;
    // See SpaceAssetsDataProvider: unset must read as unset, not as an outage.
    if (!apiUrl) {
      this.logWarn('Legacy natural-events API is not configured; skipping', 'natural-events-legacy', {});
      return [];
    }
    const data = await this.fetchJsonWithDiagnostics('natural-events-legacy', apiUrl, opts);

    if (data !== undefined && !Array.isArray(data)) {
      this.logWarn('Legacy natural events payload is not an array; returning empty', 'natural-events-legacy', {
        receivedType: typeof data,
        sampleKeys: typeof data === 'object' && data ? Object.keys(data as Record<string, unknown>).slice(0, 5) : []
      });
      return [];
    }

    return Array.isArray(data) ? data : [];
  }

  // New USGS earthquake data integration
  private async fetchUSGSEarthquakes(key: string, opts: { timeoutMs: number; retries: number }): Promise<USGSEarthquakeData> {
    const endpoint = this.endpoints.find(e => e.id === key);
    if (!endpoint) {
      throw new Error(`Earthquake endpoint not found: ${key}`);
    }

    const data = await this.fetchJsonWithDiagnostics(key, endpoint.url, opts) as USGSEarthquakeData;

    // Validate USGS GeoJSON structure
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
      this.logError('Invalid USGS earthquake data format', key, new Error('Invalid format'), {
        receivedType: data?.type,
        featureCount: Array.isArray(data?.features) ? data.features.length : 'n/a'
      });
      throw new Error('Invalid USGS earthquake data format');
    }

    return data;
  }

  // Shared NASA EONET fetch — used by both wildfires and volcanoes below. Reuses
  // fetchJsonWithDiagnostics for the same retry/timeout/logging behavior every other
  // real endpoint here already gets, and lets errors propagate to fetchData()'s outer
  // try/catch (last-known-good fallback) rather than swallowing them locally.
  private async fetchEonetEvents(endpointId: 'wildfires-eonet' | 'volcanoes', opts: { timeoutMs: number; retries: number }): Promise<EonetEvent[]> {
    const endpoint = this.endpoints.find(e => e.id === endpointId);
    if (!endpoint) {
      throw new Error(`EONET endpoint not configured: ${endpointId}`);
    }

    const payload = await this.fetchJsonWithDiagnostics(endpointId, endpoint.url, opts) as EonetResponse;
    if (!payload || !Array.isArray(payload.events)) {
      throw new Error(`EONET payload for ${endpointId} missing events array`);
    }
    return payload.events;
  }

  // An EONET event's geometry is a time series of report points (a fire's tracked
  // perimeter, a volcano's successive activity reports) — the latest entry is the
  // current, most relevant location.
  private latestEonetPoint(event: EonetEvent): EonetGeometryPoint | undefined {
    const points = event.geometry;
    return Array.isArray(points) && points.length > 0 ? points[points.length - 1] : undefined;
  }

  // Wildfire data — NASA EONET, IRWIN-sourced (US wildland fire incident tracking).
  private async fetchWildfireData(opts: { timeoutMs: number; retries: number }): Promise<NaturalEvent[]> {
    const events = await this.fetchEonetEvents('wildfires-eonet', opts);

    return events.reduce<NaturalEvent[]>((acc, event) => {
      const point = this.latestEonetPoint(event);
      const [lng, lat] = point?.coordinates ?? [];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return acc;

      acc.push({
        id: event.id,
        lat: lat as number,
        lng: lng as number,
        type: 'wildfire',
        // magnitudeValue is fire size in acres, not a Richter-like scale — deliberately
        // NOT passed through as `magnitude` (classifySeverity()'s thresholds are tuned
        // for earthquake magnitude and would misclassify nearly every real fire as
        // "catastrophic"). Carried as `intensity` instead, same as the old brightness value.
        intensity: typeof point?.magnitudeValue === 'number' ? point.magnitudeValue : undefined,
        timestamp: point?.date,
        description: event.title,
        // EONET carries fires from more than one agency (IRWIN's and GDACS's, in about equal
        // numbers on 2026-10-16): each is named by its own sources, never by one of them.
        source: eonetSourceName(event),
        ...pageOf(event.sources?.[0]?.url)
      });
      return acc;
    }, []);
  }

  // Volcanic activity data — NASA EONET, Smithsonian Global Volcanism Program-sourced.
  // Real currently-active eruption events, not a static volcano registry (see the
  // VolcanicEvent comment above for why elevation/country/region are absent here).
  private async fetchVolcanicData(opts: { timeoutMs: number; retries: number }): Promise<VolcanicEvent[]> {
    const events = await this.fetchEonetEvents('volcanoes', opts);

    return events.reduce<VolcanicEvent[]>((acc, event) => {
      const point = this.latestEonetPoint(event);
      const [lng, lat] = point?.coordinates ?? [];
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return acc;

      acc.push({
        id: event.id,
        name: event.title,
        lat: lat as number,
        lng: lng as number,
        // EONET's "open" status for the volcanoes category means currently-reported
        // activity — an accurate mapping to 'active' for this union, not an assumption.
        status: 'active',
        last_eruption: point?.date,
        source: 'Smithsonian GVP via NASA EONET',
        ...pageOf(event.sources?.[0]?.url),
        isMock: false
      });
      return acc;
    }, []);
  }

  // Shared raw GDACS fetch, cached separately from fetchData()'s per-endpoint
  // lastGoodData (which caches each of floods/droughts/hurricanes' already-filtered
  // *output* independently) — this caches the one underlying feed all three read from,
  // so calling fetchGdacsByType() three times in a row (exactly what
  // providerRegistry.getNaturalEventsData() does) costs one real network request.
  private async fetchGdacsRaw(opts: { timeoutMs: number; retries: number }): Promise<GdacsFeature[]> {
    if (this.gdacsRawCache && Date.now() - this.gdacsRawCache.timestamp < GeoEventsDataProvider.GDACS_CACHE_MS) {
      return this.gdacsRawCache.data;
    }

    const endpoint = this.endpoints.find(e => e.id === 'gdacs-current');
    if (!endpoint) {
      throw new Error('GDACS endpoint not configured');
    }

    const payload = await this.fetchJsonWithDiagnostics('gdacs-current', endpoint.url, opts) as GdacsResponse;
    if (!payload || !Array.isArray(payload.features)) {
      throw new Error('GDACS payload missing features array');
    }

    this.gdacsRawCache = { data: payload.features, timestamp: Date.now() };
    return payload.features;
  }

  // Floods / droughts / hurricanes — GDACS, filtered client-side by hazard type from
  // the one shared raw fetch above.
  private async fetchGdacsByType(eventType: GdacsEventType, opts: { timeoutMs: number; retries: number }): Promise<NaturalEvent[]> {
    return gdacsEvents(await this.fetchGdacsRaw(opts), [eventType]);
  }

  private async fetchJsonWithDiagnostics(endpointId: string, url: string, opts: { timeoutMs: number; retries: number }): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= opts.retries; attempt++) {
      const start = Date.now();
      try {
        this.logInfo('Fetch attempt', endpointId, { url, attempt, timeoutMs: opts.timeoutMs });
        const response = await this.fetchWithTimeout(url, opts.timeoutMs);
        const duration = Date.now() - start;

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status}`);
          this.logWarn('Fetch received non-OK status', endpointId, { status: response.status, durationMs: duration, attempt });
          this.warnOnce(`non-ok-${endpointId}-${response.status}`, `Non-OK response for ${endpointId}: ${response.status}`, {
            url,
            statusText: response.statusText
          });
          continue;
        }

        const contentLength = Number(response.headers.get('content-length') || 0);
        const json = await response.json();
        this.logInfo('Fetch succeeded', endpointId, { durationMs: duration, contentLength, attempt });
        return json;
      } catch (error) {
        const duration = Date.now() - start;
        lastError = error;
        this.logError('Fetch attempt failed', endpointId, error as Error, { attempt, durationMs: duration });
      }
    }

    throw lastError ?? new Error(`Failed to fetch ${endpointId}`);
  }

  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    /*
     * Aborted WITH a reason. A bare abort() surfaces as "signal is aborted without reason",
     * which is what the GDACS failures in the layer audit said — and it reads as some
     * other code cancelling the request, not as this timeout firing. It sent the diagnosis
     * the wrong way before anyone looked here.
     */
    const timer = setTimeout(
      () => controller.abort(new DOMException(`Timed out after ${timeoutMs} ms: ${url}`, 'TimeoutError')),
      timeoutMs,
    );

    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private recordGoodData(key: string, data: GeoEventsDataTypes): void {
    this.lastGoodData.set(key, { data, timestamp: Date.now() });
  }

  private logInfo(message: string, key: string, extra?: Record<string, unknown>): void {
    log.info(`[GeoEvents] ${message}`, { key, ...extra });
  }

  private logWarn(message: string, key: string, extra?: Record<string, unknown>): void {
    log.warn(`[GeoEvents] ${message}`, { key, ...extra });
  }

  private logError(message: string, key: string, error: Error, extra?: Record<string, unknown>): void {
    log.error(`[GeoEvents] ${message}`, { key, error: error.message, stack: error.stack, ...extra });
  }

  private warnOnce(tag: string, message: string, extra?: Record<string, unknown>): void {
    if (this.warnOnceTags.has(tag)) return;
    this.warnOnceTags.add(tag);
    log.warn(`[GeoEvents] ${message}`, extra ?? {});
  }

  // Transform USGS data to our unified NaturalEvent format
  transformUSGSToNaturalEvents(usgsData: USGSEarthquakeData): NaturalEvent[] {
    return usgsData.features.reduce<NaturalEvent[]>((events, feature, index) => {
      const coords = feature?.geometry?.coordinates;
      const props = feature?.properties;

      if (!Array.isArray(coords) || coords.length < 2) {
        log.error('Invalid USGS feature geometry; dropping feature.', { id: feature?.id, index });
        return events;
      }

      const [lng, lat, depth] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        log.error('Invalid USGS feature coordinates; dropping feature.', { id: feature?.id, index });
        return events;
      }

      events.push({
        id: feature.id,
        lat,
        lng,
        type: 'earthquake',
        magnitude: props?.mag,
        intensity: props?.sig, // Significance
        status: props?.status,
        timestamp: props?.time ? new Date(props.time).toISOString() : undefined,
        description: props?.title,
        source: 'USGS',
        // coords[2] (depth, km) and properties.tsunami were already present in every
        // USGS response this app fetches — previously read into `coords`/`props` and
        // then dropped without being mapped onto the event.
        depthKm: Number.isFinite(depth) ? depth : undefined,
        tsunami: props?.tsunami === 1,
        ...(typeof props?.types === 'string' && props.types.includes(',shakemap,') && typeof props.detail === 'string'
          ? { shakeMapDetailUrl: props.detail }
          : {}),
        ...pageOf(props?.url)
      });

      return events;
    }, []);
  }

  subscribe(
    key: string,
    onData: (data: GeoEventsDataTypes) => void,
    options: { interval?: number } = {}
  ): () => void {
    const interval = options.interval || 300000; // Default 5 minutes for geo events
    
    // Initial fetch
    this.fetchData(key).then(onData).catch(error => {
      this.observer?.onError?.(key, error, this.id);
      this.logError('Subscription initial fetch failed', key, error as Error);
    });

    // Set up polling
    const intervalId = setInterval(async () => {
      try {
        const data = await this.fetchData(key);
        onData(data);
      } catch (error) {
        this.observer?.onError?.(key, error as Error, this.id);
        this.logError('Subscription poll failed', key, error as Error);
      }
    }, interval);

    // Return cleanup function
    return () => clearInterval(intervalId);
  }

  setObserver(observer: DataServiceObserver): void {
    this.observer = observer;
  }

  validateData(data: unknown): data is GeoEventsDataTypes {
    if (Array.isArray(data)) {
      // Check if it's an array of NaturalEvents or VolcanicEvents
      return data.every(item => 
        typeof item === 'object' && 
        item !== null &&
        'lat' in item && 
        'lng' in item &&
        typeof item.lat === 'number' &&
        typeof item.lng === 'number'
      );
    }
    
    // Check if it's USGS GeoJSON format
    if (typeof data === 'object' && data !== null && 'type' in data) {
      const geoData = data as USGSEarthquakeData;
      return geoData.type === 'FeatureCollection' && Array.isArray(geoData.features);
    }
    
    return false;
  }

  transformData(rawData: unknown): GeoEventsDataTypes {
    if (!this.validateData(rawData)) {
      throw new Error('Invalid geo events data format');
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
