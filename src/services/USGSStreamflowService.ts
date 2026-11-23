// USGSStreamflowService.ts
// US river gauges' live discharge, from USGS's Water Data API (api.waterdata.usgs.gov):
// keyless and CORS-open (Access-Control-Allow-Origin: *, checked 2026-10-07).
//
// ─── WHY THIS API ──────────────────────────────────────────────────────────
//
// This read USGS WaterServices (waterservices.usgs.gov/nwis/iv), which "will be
// permanently shut down on February 22nd, 2027", with outages from January: inside
// Starcom Academy's fourth cohort, which uses the live app (record D-L). The Water Data
// API is its replacement, an OGC API: `latest-continuous` holds each time series'
// newest reading with the gauge's point, and `monitoring-locations` the gauges' names.
//
// ─── WHAT IS ASKED ─────────────────────────────────────────────────────────
//
// The same six states as before, geographically spread (Pacific, Mountain, Midwest,
// Northeast, Southeast, Gulf), a request each: discharge (parameter 00060), the
// instantaneous reading (statistic 00011), from gauges heard from in the last day,
// which stands for WaterServices' "active sites". California answered with 483 series in
// one page, 41 KB compressed. Names come after, for the gauges drawn only, at most 150 to
// a request (481 ids made a URL the API refused, 414), and are kept for the session:
// names do not change, so a refresh asks only for gauges not seen before.
import { fetchWithTimeout } from './space-weather/fetchWithTimeout';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'USGSStreamflowService' });

const API = 'https://api.waterdata.usgs.gov/ogcapi/v1/collections';
const REQUEST_TIMEOUT_MS = 12000;
const CACHE_MS = 10 * 60 * 1000;
/** A gauge silent for longer than this is not drawn as live. */
const HEARD_WITHIN_MS = 24 * 60 * 60 * 1000;
const PARAMETER_CODE_STREAMFLOW = '00060'; // cubic feet per second — USGS's own standard code
const STATISTIC_INSTANTANEOUS = '00011';
const NAMES_PER_REQUEST = 150;
/** Pages followed per state before stopping: one has been enough. */
const MAX_PAGES = 5;

/** Postal code (what each reading says) and ANSI code (what the API asks). */
const CURATED_STATES = [
  { postal: 'ca', ansi: '06' },
  { postal: 'co', ansi: '08' },
  { postal: 'il', ansi: '17' },
  { postal: 'ny', ansi: '36' },
  { postal: 'ga', ansi: '13' },
  { postal: 'tx', ansi: '48' },
] as const;

export interface USGSStreamflowReading {
  /** The gauge, as the API names it: agency, then number ("USGS-11447650"). */
  siteId: string;
  siteName: string;
  lat: number;
  lng: number;
  stateCode: string;
  dischargeCfs: number;
  timestamp: string;
}

interface LatestFeature {
  geometry: { type: string; coordinates: [number, number] } | null;
  properties: {
    monitoring_location_id: string;
    time: string;
    value: string | null;
    unit_of_measure: string;
    qualifier: string[] | null;
  };
}

interface FeatureCollection<F> {
  features?: F[];
  links?: Array<{ rel: string; href: string }>;
}

const utcSeconds = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

function readingsUrl(ansi: string, now: number): string {
  const params = new URLSearchParams({
    f: 'json',
    parameter_code: PARAMETER_CODE_STREAMFLOW,
    statistic_id: STATISTIC_INSTANTANEOUS,
    state_code: ansi,
    time: `${utcSeconds(now - HEARD_WITHIN_MS)}/..`,
    limit: '10000',
  });
  return `${API}/latest-continuous/items?${params}`;
}

function namesUrl(ids: string[]): string {
  const params = new URLSearchParams({
    f: 'json',
    filter: `id IN (${ids.map((id) => `'${id}'`).join(',')})`,
    'filter-lang': 'cql2-text',
    properties: 'monitoring_location_name',
    skipGeometry: 'true',
    limit: String(ids.length),
  });
  return `${API}/monitoring-locations/items?${params}`;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
  if (!response.ok) throw new Error(`USGS Water Data API answered ${response.status}`);
  return response.json() as Promise<T>;
}

/**
 * A reading drawn as discharge, or null. A gauge at zero flow reports no value and
 * the ZEROFLOW qualifier, which is a reading of zero; a gauge with no value otherwise
 * (UNAVAIL), a discontinued series, or another unit says nothing to draw.
 */
function dischargeOf(feature: LatestFeature): number | null {
  const { value, unit_of_measure, qualifier } = feature.properties;
  if (unit_of_measure !== 'ft^3/s') return null;
  if (qualifier?.includes('DISCONTINUED')) return null;
  if (value === null) return qualifier?.includes('ZEROFLOW') ? 0 : null;
  const discharge = Number(value);
  // USGS's own no-data sentinel (-999999) alongside genuinely malformed values.
  if (!Number.isFinite(discharge) || discharge <= -999999) return null;
  return discharge;
}

/** One state's gauges: every page, one reading a gauge (the newest where a gauge reports two). */
async function fetchOneState(state: (typeof CURATED_STATES)[number], now: number): Promise<Omit<USGSStreamflowReading, 'siteName'>[]> {
  const newest = new Map<string, Omit<USGSStreamflowReading, 'siteName'>>();
  let url: string | undefined = readingsUrl(state.ansi, now);
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const payload: FeatureCollection<LatestFeature> = await getJson(url);
    for (const feature of payload.features ?? []) {
      const discharge = dischargeOf(feature);
      const [lng, lat] = feature.geometry?.coordinates ?? [NaN, NaN];
      if (discharge === null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const { monitoring_location_id: siteId, time } = feature.properties;
      const held = newest.get(siteId);
      if (held && Date.parse(held.timestamp) >= Date.parse(time)) continue;
      newest.set(siteId, { siteId, lat, lng, stateCode: state.postal, dischargeCfs: discharge, timestamp: time });
    }
    url = payload.links?.find((link) => link.rel === 'next')?.href;
  }
  return [...newest.values()];
}

export interface APIResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export class USGSStreamflowService {
  private cache: { data: USGSStreamflowReading[]; timestamp: number } | null = null;
  /** Gauge names, kept for the session: they do not change. */
  private readonly names = new Map<string, string>();

  async getCurrentReadings(): Promise<APIResponse<USGSStreamflowReading[]>> {
    try {
      const now = Date.now();
      if (this.cache && now - this.cache.timestamp < CACHE_MS) {
        return { success: true, data: this.cache.data, error: null };
      }

      const results = await Promise.allSettled(CURATED_STATES.map((state) => fetchOneState(state, now)));
      const found: Omit<USGSStreamflowReading, 'siteName'>[] = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          found.push(...result.value);
        } else {
          log.warn(`Failed to fetch real streamflow for state ${CURATED_STATES[i].postal}`, result.reason);
        }
      });

      if (found.length === 0) {
        throw new Error('No usable real USGS streamflow readings were returned from any curated state');
      }

      await this.learnNames(found.map((r) => r.siteId));
      // A gauge whose name could not be read is labelled by its id rather than not drawn.
      const readings = found.map((r) => ({ ...r, siteName: this.names.get(r.siteId) ?? r.siteId }));
      this.cache = { data: readings, timestamp: now };
      return { success: true, data: readings, error: null };
    } catch (error) {
      log.error('Failed to fetch USGS streamflow readings', error);
      return { success: false, data: null, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /** The names of gauges not already known, a request per 150, one after another. */
  private async learnNames(ids: string[]): Promise<void> {
    const unknown = [...new Set(ids)].filter((id) => !this.names.has(id));
    for (let i = 0; i < unknown.length; i += NAMES_PER_REQUEST) {
      try {
        const payload: FeatureCollection<{ id: string; properties: { monitoring_location_name?: string } }> =
          await getJson(namesUrl(unknown.slice(i, i + NAMES_PER_REQUEST)));
        for (const feature of payload.features ?? []) {
          const name = feature.properties?.monitoring_location_name;
          if (name) this.names.set(feature.id, name);
        }
      } catch (error) {
        log.warn('Gauge names could not be read; those gauges are labelled by their ids', error);
      }
    }
  }

  clearCache(): void {
    this.cache = null;
  }
}

export const usgsStreamflowService = new USGSStreamflowService();
