// EarthWeatherService.ts
// Real terrestrial weather data via Open-Meteo (api.open-meteo.com) — free, keyless,
// CORS-open (verified directly: Access-Control-Allow-Origin: *). Open-Meteo has no
// global-raster endpoint on its free tier, only per-point queries, so this samples a
// coarse global grid and batches it into a single request via Open-Meteo's
// multi-coordinate support (comma-separated lat/lng lists).

import { sourceAllowed } from '../legal/buildProfile';
import { fetchWithTimeout } from './space-weather/fetchWithTimeout';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'EarthWeatherService' });

const REQUEST_TIMEOUT_MS = 15000;
const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * An Open-Meteo time as an unambiguous UTC ISO string (decision D-E).
 *
 * Open-Meteo sends `current.time` as '2026-09-19T19:30' — NO zone designator,
 * even with timezone=UTC — and reports the offset separately, in
 * `utc_offset_seconds`. JavaScript parses a date-time without an offset as the
 * BROWSER's local time: in America/Chicago `new Date('2026-09-19T19:30')` is
 * 00:30Z the next day, five hours out. Nothing read the field until the globe's
 * key began stating how old each source's data is (D-F step 11), which made this
 * the moment to fix it — where the data enters, so no reader has to know.
 *
 * Returns the input unchanged when it cannot be read, so a reader classifies it
 * as unreadable rather than being handed an invented instant.
 */
export function openMeteoTimeToIso(bare: string, utcOffsetSeconds = 0): string {
  const asIfUtc = Date.parse(`${bare}Z`);
  if (Number.isNaN(asIfUtc)) return bare;
  return new Date(asIfUtc - utcOffsetSeconds * 1000).toISOString();
}
const CURRENT_VARIABLES = 'temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure';

// Open-Meteo also runs a dedicated, separately-hosted Air Quality API — same vendor,
// same keyless/CORS-open/multi-coordinate-batch pattern as the weather API above.
// Chosen over OpenAQ: OpenAQ retired its keyless v1/v2 endpoints (confirmed directly —
// v3 returns 401 without a registered API key now), which would mean embedding a
// personal key in client-side JS. This needs no key at all and gives a standard US
// AQI number directly, not just raw pollutant concentrations to classify ourselves.
const AIR_QUALITY_BASE_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const AIR_QUALITY_VARIABLES = 'pm2_5,pm10,us_aqi';

// Sea ice — NASA EONET's seaLakeIce category, NATICE (US National Ice Center)
// -sourced. Verified directly: real, individually-tracked, named icebergs (e.g.
// "Iceberg D33D") with real drift positions and sizes, not a grid-sampled continuum
// like the weather/air-quality data above — rendered as discrete point markers instead
// of blended into the weather grid (see useGlobeEarthWeather.ts).
const SEA_ICE_EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?category=seaLakeIce&status=open';

// Grid resolution: measured directly against the real API before picking this value —
// a 15° grid (264 points) took 31s to respond (likely server-side batch degradation
// above some threshold), while this 20° grid (144 points) reliably responds in ~1s.
// Points are also kept out of the poles, where Open-Meteo's model grid degrades.
const GRID_STEP_DEG = 20;
const MAX_LAT = 70;

export interface EarthWeatherPoint {
  lat: number;
  lng: number;
  temperatureC: number;
  precipitationMm: number;
  cloudCoverPct: number;
  windSpeedKmh: number;
  windDirectionDeg: number;
  humidityPct: number;
  pressureHpa: number;
  timestamp: string;
  // Air quality — undefined if the air-quality fetch failed while the weather fetch
  // succeeded (the two are independent Open-Meteo services; one being down shouldn't
  // block the other from rendering).
  usAqi?: number;
  pm25?: number;
  pm10?: number;
}

export interface SeaIceEvent {
  id: string;
  name: string;
  lat: number;
  lng: number;
  sizeNm2?: number;
  lastUpdated: string;
  // Real full drift history (every position EONET has reported for this iceberg),
  // oldest first. Previously only the latest point was kept — this real track data
  // was being fetched and discarded on every single call.
  track: Array<{ lat: number; lng: number; date: string }>;
}

export interface APIResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export function buildWeatherGrid(stepDeg: number = GRID_STEP_DEG, maxLat: number = MAX_LAT): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  for (let lat = -maxLat; lat <= maxLat; lat += stepDeg) {
    for (let lng = -180; lng < 180; lng += stepDeg) {
      points.push({ lat, lng });
    }
  }
  return points;
}

interface OpenMeteoCurrentResponse {
  /**
   * The offset of `current.time` from UTC. Declared because `time` carries no
   * zone designator of its own — see openMeteoTimeToIso. Checked against the
   * live API on 2026-09-19: present on every response, 0 with timezone=UTC.
   */
  utc_offset_seconds?: number;
  current?: {
    /** Wall-clock time in the requested zone, WITHOUT a designator: '2026-09-19T19:30'. */
    time: string;
    temperature_2m: number;
    precipitation: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    relative_humidity_2m: number;
    surface_pressure: number;
  };
}

interface OpenMeteoAirQualityResponse {
  current?: {
    pm2_5: number;
    pm10: number;
    us_aqi: number;
  };
}

interface EonetGeometryPoint {
  date: string;
  coordinates: [number, number];
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
}

interface EonetEvent {
  id: string;
  title: string;
  geometry: EonetGeometryPoint[];
}

interface EonetResponse {
  events: EonetEvent[];
}

export class EarthWeatherService {
  private cache: { data: EarthWeatherPoint[]; timestamp: number } | null = null;
  // 10 minutes — comfortably under Open-Meteo's own ~15-minute model update interval
  // (the API's own response carries "interval": 900 seconds, confirmed directly).
  private readonly cacheTimeoutMs = 10 * 60 * 1000;
  private seaIceCache: { data: SeaIceEvent[]; timestamp: number } | null = null;
  // Icebergs drift and resize slowly — a much longer cache than weather is appropriate.
  private readonly seaIceCacheTimeoutMs = 60 * 60 * 1000;

  async getCurrentGrid(): Promise<APIResponse<EarthWeatherPoint[]>> {
    // Open-Meteo's free tier is non-commercial: a commercial build draws no stations (D-CS, CS1, CS13).
    if (!sourceAllowed('openMeteo')) return { success: true, data: [], error: null };
    try {
      if (this.cache && Date.now() - this.cache.timestamp < this.cacheTimeoutMs) {
        return { success: true, data: this.cache.data, error: null };
      }

      const grid = buildWeatherGrid();
      const latParam = grid.map(p => p.lat).join(',');
      const lngParam = grid.map(p => p.lng).join(',');
      const weatherUrl = `${OPEN_METEO_BASE_URL}?latitude=${latParam}&longitude=${lngParam}&current=${CURRENT_VARIABLES}&timezone=UTC`;
      const airQualityUrl = `${AIR_QUALITY_BASE_URL}?latitude=${latParam}&longitude=${lngParam}&current=${AIR_QUALITY_VARIABLES}&timezone=UTC`;

      // Independent services — a failure in one (fetch throwing, non-OK status) must
      // not take down the other, so each is settled separately rather than raced
      // together with Promise.all.
      const [weatherResult, airQualityResult] = await Promise.allSettled([
        fetchWithTimeout(weatherUrl, REQUEST_TIMEOUT_MS).then(async (r) => {
          if (!r.ok) throw new Error(`Open-Meteo weather API error: ${r.status}`);
          return r.json() as Promise<OpenMeteoCurrentResponse[]>;
        }),
        fetchWithTimeout(airQualityUrl, REQUEST_TIMEOUT_MS).then(async (r) => {
          if (!r.ok) throw new Error(`Open-Meteo air quality API error: ${r.status}`);
          return r.json() as Promise<OpenMeteoAirQualityResponse[]>;
        })
      ]);

      if (weatherResult.status === 'rejected') {
        throw weatherResult.reason;
      }
      const rawWeather = weatherResult.value;
      if (!Array.isArray(rawWeather)) {
        throw new Error('Open-Meteo weather batch response was not an array');
      }

      const rawAirQuality = airQualityResult.status === 'fulfilled' && Array.isArray(airQualityResult.value)
        ? airQualityResult.value
        : null;
      if (airQualityResult.status === 'rejected') {
        log.warn('Air quality fetch failed; weather points will omit AQI', { error: (airQualityResult.reason as Error)?.message });
      }

      const points: EarthWeatherPoint[] = [];
      rawWeather.forEach((entry, i) => {
        // Use the requested grid coordinates for position, not the response's
        // model-snapped latitude/longitude (Open-Meteo rounds to its nearest grid
        // cell, e.g. requested 40 -> returned 39.97) — keeps the rendered grid regular.
        const gridPoint = grid[i];
        const current = entry?.current;
        if (!gridPoint || !current) return;
        if (!Number.isFinite(current.temperature_2m)) return;

        const aq = rawAirQuality?.[i]?.current;

        points.push({
          lat: gridPoint.lat,
          lng: gridPoint.lng,
          temperatureC: current.temperature_2m,
          precipitationMm: current.precipitation,
          cloudCoverPct: current.cloud_cover,
          windSpeedKmh: current.wind_speed_10m,
          windDirectionDeg: current.wind_direction_10m,
          humidityPct: current.relative_humidity_2m,
          pressureHpa: current.surface_pressure,
          timestamp: openMeteoTimeToIso(current.time, entry?.utc_offset_seconds ?? 0),
          usAqi: Number.isFinite(aq?.us_aqi) ? aq!.us_aqi : undefined,
          pm25: Number.isFinite(aq?.pm2_5) ? aq!.pm2_5 : undefined,
          pm10: Number.isFinite(aq?.pm10) ? aq!.pm10 : undefined
        });
      });

      if (points.length === 0) {
        throw new Error('Open-Meteo batch response yielded zero usable weather points');
      }

      this.cache = { data: points, timestamp: Date.now() };
      return { success: true, data: points, error: null };
    } catch (error) {
      log.error('Failed to fetch Earth weather grid', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getSeaIceEvents(): Promise<APIResponse<SeaIceEvent[]>> {
    try {
      if (this.seaIceCache && Date.now() - this.seaIceCache.timestamp < this.seaIceCacheTimeoutMs) {
        return { success: true, data: this.seaIceCache.data, error: null };
      }

      const response = await fetchWithTimeout(SEA_ICE_EONET_URL, REQUEST_TIMEOUT_MS);
      if (!response.ok) {
        throw new Error(`EONET sea ice API error: ${response.status}`);
      }

      const payload = await response.json() as EonetResponse;
      if (!payload || !Array.isArray(payload.events)) {
        throw new Error('EONET sea ice payload missing events array');
      }

      const events: SeaIceEvent[] = [];
      for (const event of payload.events) {
        const points = Array.isArray(event.geometry) ? event.geometry : [];
        // Icebergs are tracked over time as a series of real position reports — the
        // latest is the current position (used for the marker); the full sequence is
        // a real drift history (used for the trail — see useGlobeEarthWeather.ts).
        const latest = points.length > 0 ? points[points.length - 1] : undefined;
        const [lng, lat] = latest?.coordinates ?? [];
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const track = points.reduce<Array<{ lat: number; lng: number; date: string }>>((acc, point) => {
          const [pLng, pLat] = point.coordinates ?? [];
          if (Number.isFinite(pLat) && Number.isFinite(pLng)) {
            acc.push({ lat: pLat as number, lng: pLng as number, date: point.date });
          }
          return acc;
        }, []);

        events.push({
          id: event.id,
          name: event.title,
          lat: lat as number,
          lng: lng as number,
          sizeNm2: typeof latest?.magnitudeValue === 'number' ? latest.magnitudeValue : undefined,
          lastUpdated: latest?.date ?? '',
          track
        });
      }

      this.seaIceCache = { data: events, timestamp: Date.now() };
      return { success: true, data: events, error: null };
    } catch (error) {
      log.error('Failed to fetch sea ice events', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  clearCache(): void {
    this.cache = null;
    this.seaIceCache = null;
  }
}

export const earthWeatherService = new EarthWeatherService();
