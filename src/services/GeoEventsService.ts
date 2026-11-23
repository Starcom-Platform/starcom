// src/services/GeoEventsService.ts
// Artifact-driven: Provides real-time natural event data for overlays (see globe-overlays.artifact)
import axios from 'axios';
import { DataManagerHelpers, createConfiguredDataManager } from './data-management/providerRegistry';
import { GeoEventsDataProvider, type USGSEarthquakeData, type VolcanicEvent } from './data-management/providers/GeoEventsDataProvider';
import { ecoHistoryStore } from './history/EcoHistoryStore';
import { env } from '../config/env';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'GeoEventsService' });

const GEO_EVENTS_API_URL = env.geoEventsApiUrl;
const DEFAULT_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 45_000; // prevent rapid re-fetch when multiple consumers poll

export interface NaturalEvent {
  id: string | number;
  lat: number;
  lng: number;
  type: string; // e.g., 'earthquake', 'volcano', 'flood', 'drought', 'hurricane'
  magnitude?: number;
  status?: string;
  timestamp?: string;
  description?: string;
  source?: string;
  intensity?: number;
  isMock?: boolean;
  // A source that already computed its own severity classification (e.g. GDACS's
  // Green/Orange/Red alert level) rather than a bare numeric magnitude — read by
  // useGeoEvents' classifySeverity() in preference to its magnitude-threshold
  // heuristic, since magnitude isn't comparable across every hazard type (cyclone
  // wind speed and flood extent aren't earthquake-scale numbers).
  severityOverride?: 'minor' | 'major' | 'catastrophic';
  // Earthquake-specific real fields (USGS depth/tsunami flag) — see
  // GeoEventsDataProvider.ts's transformUSGSToNaturalEvents for where these are set.
  depthKm?: number;
  tsunami?: boolean;
  // A USGS quake's detail, where it has a ShakeMap — see ShakeMapService.ts.
  shakeMapDetailUrl?: string;
  // Who reported a quake: "USGS (ci)", "EMSC (CSN)", both where the two were folded (quakeWindow.ts; D-EQ, EQ2).
  reportedBy?: string[];
  // A quake from the history, its date as precisely as its record gives it ("1755", "11 Mar 2011 05:46Z"), and what
  // NOAA's atlas says of it (quakeHistory.ts; D-EQ, EQ3, EQ4).
  dateWords?: string;
  atlas?: { ncei: number; deaths: number | null; deathsOrder: number | null; damageMillions: number | null; tsunami: boolean; intensity: number | null };
  // GDACS flood/drought/hurricane events only — see GdacsGeometryService.ts.
  gdacsEventId?: number;
  gdacsGeometryUrl?: string;
  // The event's own page at its publisher — see GeoEventsDataProvider.ts's NaturalEvent.
  sourceUrl?: string;
}

export interface FetchNaturalEventsOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

type NaturalEventsPayload = {
  earthquakes?: unknown;
  wildfires?: unknown;
  volcanoes?: unknown;
  floods?: unknown;
  droughts?: unknown;
  hurricanes?: unknown;
};

const arrayLength = (value: unknown): number => (Array.isArray(value) ? value.length : 0);
const featureCount = (value: unknown): number => {
  const features = (value as { features?: unknown } | undefined)?.features;
  return Array.isArray(features) ? features.length : 0;
};

let helpersPromise: Promise<DataManagerHelpers> | null = null;
let lastResultCache: { data: NaturalEvent[]; timestamp: number } | null = null;
let inFlight: { startedAt: number; promise: Promise<NaturalEvent[]> } | null = null;

const getHelpers = async () => {
  if (!helpersPromise) {
    helpersPromise = createConfiguredDataManager().then((manager) => new DataManagerHelpers(manager));
  }
  return helpersPromise;
};

const fetchLegacyNaturalEvents = async (): Promise<NaturalEvent[]> => {
  try {
    const response = await axios.get(GEO_EVENTS_API_URL);
    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response.data.events)) return response.data.events;
    return [];
  } catch (error) {
    log.error('Error fetching natural events:', error);
    return [];
  }
};

let volcanoWarningEmitted = false;

const normalizeVolcanoEvents = (events: unknown): NaturalEvent[] => {
  if (events === undefined || events === null) return [];

  // If we accidentally received a GeoJSON FeatureCollection, treat as non-volcano payload and skip quietly.
  const looksLikeGeoJson = typeof events === 'object' && events !== null && 'type' in (events as Record<string, unknown>) && 'features' in (events as Record<string, unknown>);
  if (looksLikeGeoJson) {
    if (!volcanoWarningEmitted) {
      volcanoWarningEmitted = true;
      log.warn('Dropping non-volcano payload assigned to volcanoes (looks like GeoJSON); skipping.', {
        receivedType: typeof events,
        sampleKeys: Object.keys(events as Record<string, unknown>).slice(0, 5)
      });
    }
    return [];
  }

  if (!Array.isArray(events)) {
    if (!volcanoWarningEmitted) {
      volcanoWarningEmitted = true;
      log.warn('Invalid volcano payload; expected array.', {
        receivedType: typeof events,
        sampleKeys: typeof events === 'object' && events ? Object.keys(events as Record<string, unknown>).slice(0, 5) : []
      });
    }
    return [];
  }
  return (events as VolcanicEvent[]).map((volcano) => ({
    id: volcano.id,
    lat: volcano.lat,
    lng: volcano.lng,
    type: 'volcano',
    status: volcano.status,
    timestamp: volcano.last_eruption ? new Date(volcano.last_eruption).toISOString() : undefined,
    description: volcano.name,
    // Defaults preserve the old always-mock behavior for any VolcanicEvent that doesn't
    // report its own source (e.g. a future static/curated dataset) — the real NASA
    // EONET-backed provider now sets both explicitly.
    source: volcano.source ?? 'volcano-mock',
    ...(volcano.sourceUrl ? { sourceUrl: volcano.sourceUrl } : {}),
    isMock: volcano.isMock ?? true
  }));
};

// Generic validator for any hazard payload that's already NaturalEvent-shaped (as
// opposed to earthquakes' USGS GeoJSON or volcanoes' VolcanicEvent[] — both need their
// own field-mapping transform above). Originally wildfire-only; now shared by
// wildfires, floods, droughts, and hurricanes since GeoEventsDataProvider already
// returns all four as NaturalEvent[] directly.
const normalizeGenericHazardEvents = (events: unknown, hazardLabel: string): NaturalEvent[] => {
  if (events !== undefined && !Array.isArray(events)) {
    log.warn(`Invalid ${hazardLabel} payload; expected array.`, {
      receivedType: typeof events,
      sampleKeys: typeof events === 'object' && events ? Object.keys(events as Record<string, unknown>).slice(0, 5) : []
    });
    return [];
  }
  if (!Array.isArray(events)) return [];
  return (events as NaturalEvent[]).filter(
    (e) => typeof e.lat === 'number' && Number.isFinite(e.lat) && typeof e.lng === 'number' && Number.isFinite(e.lng)
  );
};

const normalizeEarthquakeEvents = (events: unknown): NaturalEvent[] => {
  if (!events) return [];
  if (Array.isArray(events)) return events as NaturalEvent[];

  const geoJson = events as USGSEarthquakeData;
  if (geoJson?.type === 'FeatureCollection' && Array.isArray(geoJson.features)) {
    const provider = new GeoEventsDataProvider();
    return provider.transformUSGSToNaturalEvents(geoJson);
  }

  log.error('Invalid earthquake payload; expected USGS FeatureCollection.');

  return [];
};

const normalizeNaturalEvents = (payload: NaturalEventsPayload): NaturalEvent[] => {
  if (!payload || typeof payload !== 'object') {
    log.error('Invalid natural events payload received; expected object payload.');
    return [];
  }

  const { earthquakes, volcanoes, wildfires, floods, droughts, hurricanes, ...unsupported } = payload as Record<string, unknown>;
  const unsupportedKeys = Object.keys(unsupported);
  if (unsupportedKeys.length) {
    log.warn('Dropping unsupported hazard types', unsupportedKeys);
  }

  const normalized: NaturalEvent[] = [];
  normalized.push(...normalizeEarthquakeEvents(earthquakes));
  normalized.push(...normalizeVolcanoEvents(volcanoes));
  normalized.push(...normalizeGenericHazardEvents(wildfires, 'wildfire'));
  normalized.push(...normalizeGenericHazardEvents(floods, 'flood'));
  normalized.push(...normalizeGenericHazardEvents(droughts, 'drought'));
  normalized.push(...normalizeGenericHazardEvents(hurricanes, 'hurricane'));
  return normalized;
};

const fetchFromDataManager = async (): Promise<NaturalEventsPayload> => {
  const helpers = await getHelpers();
  return helpers.getNaturalEventsData() as unknown as NaturalEventsPayload;
};

export const fetchNaturalEvents = async (options: FetchNaturalEventsOptions = {}): Promise<NaturalEvent[]> => {
  const { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const now = Date.now();

  if (lastResultCache && now - lastResultCache.timestamp < CACHE_TTL_MS) {
    return lastResultCache.data;
  }

  if (inFlight) {
    return inFlight.promise;
  }
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const abortPromise = signal
    ? new Promise<never>((_, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      })
    : null;

  const timeoutPromise = timeoutMs
    ? new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Natural events fetch timed out')), timeoutMs);
      })
    : null;

  const fetchPromise = (async () => {
    try {
      const payload = await fetchFromDataManager();
      const summary = Array.isArray(payload)
        ? {
            totalEvents: payload.length,
            volcanoes: payload.filter((e) => (e as NaturalEvent)?.type === 'volcano').length,
            earthquakes: payload.filter((e) => (e as NaturalEvent)?.type === 'earthquake').length,
            wildfires: payload.filter((e) => (e as NaturalEvent)?.type === 'wildfire').length
          }
        : {
            earthquakes: featureCount(payload.earthquakes),
            volcanoes: arrayLength(payload.volcanoes),
            wildfires: arrayLength(payload.wildfires),
            floods: arrayLength(payload.floods),
            droughts: arrayLength(payload.droughts),
            hurricanes: arrayLength(payload.hurricanes)
          };
      log.info('[GeoEvents] Normalizing payload', summary);
      const normalized = Array.isArray(payload) ? (payload as NaturalEvent[]) : normalizeNaturalEvents(payload as NaturalEventsPayload);
      lastResultCache = { data: normalized, timestamp: Date.now() };
      // Fire-and-forget: a history-capture failure must never affect the real fetch
      // this is piggybacking on. Decoupled from rendering entirely — no read path
      // consumes this yet (see EcoHistoryStore.ts's header comment for why it exists).
      void ecoHistoryStore.appendSnapshot(normalized).catch((error) => {
        log.warn('Failed to capture history snapshot (non-fatal)', error);
      });
      return normalized;
    } catch (error) {
      log.error('DataManager natural events fetch failed, falling back to legacy endpoint', error);
      const legacy = await fetchLegacyNaturalEvents();
      lastResultCache = { data: legacy, timestamp: Date.now() };
      return legacy;
    }
  })();

  inFlight = { startedAt: now, promise: fetchPromise.finally(() => { inFlight = null; }) as Promise<NaturalEvent[]> };

  try {
    const contenders = [fetchPromise, abortPromise, timeoutPromise].filter(Boolean) as Promise<NaturalEvent[]>[];
    const result = await Promise.race(contenders);
    return result;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    inFlight = null;
  }
};

/**
 * Test-only: clears module-level cache/in-flight/one-time-warning state.
 * fetchNaturalEvents caches results for CACHE_TTL_MS across all callers by
 * design (prevents rapid re-fetch when multiple consumers poll) — without
 * this, tests that call fetchNaturalEvents more than once in quick succession
 * silently observe a previous test's cached result instead of exercising
 * their own mock payload.
 */
export const __resetNaturalEventsCacheForTests = (): void => {
  lastResultCache = null;
  inFlight = null;
  volcanoWarningEmitted = false;
};
