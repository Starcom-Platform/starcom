// NOAAWaterLevelService.ts
// Real, live, keyless, CORS-open (Access-Control-Allow-Origin: *, verified directly)
// NOAA CO-OPS tide/water-level gauges — US coastal stations.
//
// Two real endpoints: a station metadata list (301 real water-level stations,
// lat/lng/name/state — cheap, one call) and a per-station real-time reading
// (datagetter?product=water_level) that, verified directly, has no batch/multi-
// station support ("Wrong Station ID: The Station ID is a seven digit number" when
// given a comma-separated list) — one real request per station. Real-time readings
// are therefore capped to a bounded subset of stations (not all 301) with bounded
// concurrency, the same pattern GdacsGeometryService.ts already established for a
// per-event fetch with no batch endpoint.
import { fetchWithTimeout } from './space-weather/fetchWithTimeout';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'NOAAWaterLevelService' });

const REQUEST_TIMEOUT_MS = 12000;
const STATIONS_URL = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels';
const READING_URL = (stationId: string) =>
  `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=water_level&station=${stationId}&date=latest&datum=MLLW&units=metric&time_zone=gmt&format=json`;

// Station metadata barely changes — cache generously long.
const STATIONS_CACHE_MS = 24 * 60 * 60 * 1000;
// Real-time readings change constantly — short cache, just enough to dedupe rapid re-renders.
const READINGS_CACHE_MS = 5 * 60 * 1000;
// Bounded, not all 301 real stations — see file header. Deterministic (list order),
// not random, so results are stable/reproducible.
const MAX_STATIONS_WITH_LIVE_READINGS = 40;
const MAX_CONCURRENT_READING_FETCHES = 6;

export interface NOAAWaterLevelStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  state?: string;
}

export interface NOAAWaterLevelReading {
  station: NOAAWaterLevelStation;
  waterLevelM: number;
  timestamp: string;
}

interface RawStation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  state?: string;
}

interface RawStationsResponse {
  count: number;
  stations: RawStation[];
}

interface RawReadingResponse {
  metadata?: { id: string; name: string; lat: string; lon: string };
  data?: Array<{ t: string; v: string }>;
  error?: { message: string };
}

async function fetchOneReading(station: NOAAWaterLevelStation): Promise<NOAAWaterLevelReading | null> {
  try {
    const response = await fetchWithTimeout(READING_URL(station.id), REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(`NOAA CO-OPS reading API error: ${response.status}`);

    const payload = await response.json() as RawReadingResponse;
    const latest = payload.data?.[payload.data.length - 1];
    const value = latest ? Number(latest.v) : NaN;
    if (!Number.isFinite(value)) return null;

    return { station, waterLevelM: value, timestamp: latest!.t };
  } catch (error) {
    log.warn(`Failed to fetch real water level for station ${station.id} (${station.name})`, error);
    return null;
  }
}

export interface APIResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export class NOAAWaterLevelService {
  private stationsCache: { data: NOAAWaterLevelStation[]; timestamp: number } | null = null;
  private readingsCache: { data: NOAAWaterLevelReading[]; timestamp: number } | null = null;

  private async fetchStations(): Promise<NOAAWaterLevelStation[]> {
    if (this.stationsCache && Date.now() - this.stationsCache.timestamp < STATIONS_CACHE_MS) {
      return this.stationsCache.data;
    }

    const response = await fetchWithTimeout(STATIONS_URL, REQUEST_TIMEOUT_MS);
    if (!response.ok) throw new Error(`NOAA CO-OPS stations API error: ${response.status}`);

    const payload = await response.json() as RawStationsResponse;
    if (!payload || !Array.isArray(payload.stations)) {
      throw new Error('NOAA CO-OPS stations payload missing stations array');
    }

    const stations = payload.stations
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.id && s.name)
      .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, state: s.state }));

    this.stationsCache = { data: stations, timestamp: Date.now() };
    return stations;
  }

  async getCurrentReadings(): Promise<APIResponse<NOAAWaterLevelReading[]>> {
    try {
      if (this.readingsCache && Date.now() - this.readingsCache.timestamp < READINGS_CACHE_MS) {
        return { success: true, data: this.readingsCache.data, error: null };
      }

      const stations = await this.fetchStations();
      const subset = stations.slice(0, MAX_STATIONS_WITH_LIVE_READINGS);

      const readings: NOAAWaterLevelReading[] = [];
      let cursor = 0;
      const worker = async () => {
        while (cursor < subset.length) {
          const station = subset[cursor++];
          const reading = await fetchOneReading(station);
          if (reading) readings.push(reading);
        }
      };
      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_READING_FETCHES, subset.length) }, worker));

      if (readings.length === 0) {
        throw new Error('No usable real NOAA water-level readings were returned');
      }

      this.readingsCache = { data: readings, timestamp: Date.now() };
      return { success: true, data: readings, error: null };
    } catch (error) {
      log.error('Failed to fetch NOAA water-level readings', error);
      return { success: false, data: null, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  clearCache(): void {
    this.stationsCache = null;
    this.readingsCache = null;
  }
}

export const noaaWaterLevelService = new NOAAWaterLevelService();
