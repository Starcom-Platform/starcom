import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EarthWeatherService, buildWeatherGrid, openMeteoTimeToIso } from './EarthWeatherService';

global.fetch = vi.fn();
const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

const openMeteoResponseFor = (grid: Array<{ lat: number; lng: number }>) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(
    grid.map((point, i) => ({
      // Deliberately different from the requested point (model-snapped), to prove the
      // service uses the requested grid coordinates, not these, for position.
      latitude: point.lat + 0.03,
      longitude: point.lng - 0.02,
      current: {
        time: '2026-08-14T12:00',
        temperature_2m: 10 + i,
        precipitation: 0.5,
        cloud_cover: 40,
        wind_speed_10m: 12.3,
        wind_direction_10m: 270,
        relative_humidity_2m: 55,
        surface_pressure: 1013
      }
    }))
  )
});

const airQualityResponseFor = (grid: Array<{ lat: number; lng: number }>) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(
    grid.map(() => ({
      current: { pm2_5: 12.3, pm10: 18.1, us_aqi: 55 }
    }))
  )
});

// getCurrentGrid() fetches weather and air quality in parallel — tests that care
// about both must queue two responses in the order the service requests them
// (weather first, then air quality; see the Promise.allSettled call site).
const mockBothOk = (grid: Array<{ lat: number; lng: number }>) => {
  mockFetch.mockResolvedValueOnce(openMeteoResponseFor(grid));
  mockFetch.mockResolvedValueOnce(airQualityResponseFor(grid));
};

describe('buildWeatherGrid', () => {
  it('produces a regular grid that stays within the configured bounds', () => {
    const grid = buildWeatherGrid(20, 70);
    expect(grid.length).toBeGreaterThan(0);
    for (const point of grid) {
      expect(Math.abs(point.lat)).toBeLessThanOrEqual(70);
      expect(point.lng).toBeGreaterThanOrEqual(-180);
      expect(point.lng).toBeLessThan(180);
    }
  });

  it('is deterministic for the same inputs', () => {
    expect(buildWeatherGrid(20, 70)).toEqual(buildWeatherGrid(20, 70));
  });
});

describe('EarthWeatherService', () => {
  let service: EarthWeatherService;

  beforeEach(() => {
    service = new EarthWeatherService();
    mockFetch.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('maps a real-shaped Open-Meteo batch response, using requested grid coordinates rather than the response-snapped ones', async () => {
    const grid = buildWeatherGrid();
    mockBothOk(grid);

    const result = await service.getCurrentGrid();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(grid.length);
    expect(result.data![0]).toEqual({
      lat: grid[0].lat,
      lng: grid[0].lng,
      temperatureC: 10,
      precipitationMm: 0.5,
      cloudCoverPct: 40,
      windSpeedKmh: 12.3,
      windDirectionDeg: 270,
      humidityPct: 55,
      pressureHpa: 1013,
      // Normalised to UTC with its Z. Open-Meteo sends '2026-08-14T12:00' — no
      // zone designator — and JavaScript reads that as the BROWSER's local time.
      // This test used to pin the bare string passing straight through.
      timestamp: '2026-08-14T12:00:00.000Z',
      usAqi: 55,
      pm25: 12.3,
      pm10: 18.1
    });
  });

  it('merges air quality onto weather points by matching grid index (both fetches share the same grid)', async () => {
    const grid = buildWeatherGrid();
    mockBothOk(grid);

    const result = await service.getCurrentGrid();

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, secondCallArgs] = mockFetch.mock.calls;
    expect(secondCallArgs[0]).toContain('air-quality-api.open-meteo.com');
    expect(result.data!.every((p) => p.usAqi === 55)).toBe(true);
  });

  it('still returns real weather points, without AQI fields, when the air quality fetch fails', async () => {
    const grid = buildWeatherGrid();
    mockFetch.mockResolvedValueOnce(openMeteoResponseFor(grid));
    mockFetch.mockRejectedValueOnce(new Error('air quality service down'));

    const result = await service.getCurrentGrid();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(grid.length);
    expect(result.data![0].temperatureC).toBe(10);
    expect(result.data![0].usAqi).toBeUndefined();
  });

  it('caches results and does not re-fetch within the TTL', async () => {
    const grid = buildWeatherGrid();
    mockFetch.mockResolvedValue(openMeteoResponseFor(grid));

    const first = await service.getCurrentGrid();
    const second = await service.getCurrentGrid();

    // 2, not 1: weather and air quality are separate Open-Meteo services fetched in
    // parallel on the one real call; the second getCurrentGrid() call must add none.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(second).toEqual(first);
  });

  it('re-fetches after clearCache()', async () => {
    const grid = buildWeatherGrid();
    mockFetch.mockResolvedValue(openMeteoResponseFor(grid));

    await service.getCurrentGrid();
    service.clearCache();
    await service.getCurrentGrid();

    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('returns a graceful failure result (not a throw) on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve(null) });

    const result = await service.getCurrentGrid();

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toContain('503');
  });

  it('returns a graceful failure result on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const result = await service.getCurrentGrid();

    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
  });

  it('drops entries with a missing or non-finite temperature instead of throwing', async () => {
    const grid = buildWeatherGrid();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(
        grid.map((point, i) => (
          i === 0
            ? { latitude: point.lat, longitude: point.lng, current: undefined }
            : { latitude: point.lat, longitude: point.lng, current: { time: 't', temperature_2m: 15, precipitation: 0, cloud_cover: 0, wind_speed_10m: 0, wind_direction_10m: 0, relative_humidity_2m: 0, surface_pressure: 1000 } }
        ))
      )
    });

    const result = await service.getCurrentGrid();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(grid.length - 1);
  });
});

const eonetSeaIceResponse = (events: unknown[]) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ title: 'EONET Events', events })
});

describe('EarthWeatherService.getSeaIceEvents', () => {
  let service: EarthWeatherService;

  beforeEach(() => {
    service = new EarthWeatherService();
    mockFetch.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('maps a real-shaped EONET iceberg event, using the latest tracked position', async () => {
    mockFetch.mockResolvedValueOnce(eonetSeaIceResponse([
      {
        id: 'EONET_20822',
        title: 'Iceberg D33D',
        geometry: [
          { date: '2026-06-25T00:00:00Z', coordinates: [-55.51, -64.35], magnitudeValue: 62.73, magnitudeUnit: 'NM^2' },
          { date: '2026-07-23T00:00:00Z', coordinates: [-55.47, -63.78], magnitudeValue: 90.0, magnitudeUnit: 'NM^2' }
        ]
      }
    ]));

    const result = await service.getSeaIceEvents();

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      {
        id: 'EONET_20822',
        name: 'Iceberg D33D',
        lat: -63.78,
        lng: -55.47,
        sizeNm2: 90.0,
        lastUpdated: '2026-07-23T00:00:00Z',
        // Real full drift history — both real reported positions, oldest first, not
        // just the latest (which drives lat/lng above).
        track: [
          { lat: -64.35, lng: -55.51, date: '2026-06-25T00:00:00Z' },
          { lat: -63.78, lng: -55.47, date: '2026-07-23T00:00:00Z' }
        ]
      }
    ]);
  });

  it('drops individual malformed track points but keeps the rest of a real drift history', async () => {
    mockFetch.mockResolvedValueOnce(eonetSeaIceResponse([
      {
        id: 'EONET_X',
        title: 'Iceberg X',
        geometry: [
          { date: '2026-01-01T00:00:00Z', coordinates: [NaN, 10] },
          { date: '2026-02-01T00:00:00Z', coordinates: [-10, 20] },
          { date: '2026-03-01T00:00:00Z', coordinates: [-11, 21] }
        ]
      }
    ]));

    const result = await service.getSeaIceEvents();

    expect(result.data![0].track).toEqual([
      { lat: 20, lng: -10, date: '2026-02-01T00:00:00Z' },
      { lat: 21, lng: -11, date: '2026-03-01T00:00:00Z' }
    ]);
  });

  it('caches results and does not re-fetch within the TTL', async () => {
    mockFetch.mockResolvedValue(eonetSeaIceResponse([]));

    await service.getSeaIceEvents();
    await service.getSeaIceEvents();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('drops icebergs with missing or non-finite coordinates instead of throwing', async () => {
    mockFetch.mockResolvedValueOnce(eonetSeaIceResponse([
      { id: 'bad', title: 'Bad iceberg', geometry: [] }
    ]));

    const result = await service.getSeaIceEvents();
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('returns a graceful failure result on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    const result = await service.getSeaIceEvents();

    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
  });
});

/**
 * Open-Meteo's times, made unambiguous where they enter (decision D-E; D-F 11).
 *
 * It returns `current.time` as '2026-09-19T19:30' — no zone designator — even
 * with timezone=UTC, and says the offset separately in `utc_offset_seconds`.
 * JavaScript parses a date-time without an offset as LOCAL time. On the machine
 * these tests were written on (America/Chicago), `new Date('2026-09-19T19:30')`
 * is 00:30Z the NEXT day: five hours out, and an age computed from it negative.
 * Nothing read the field until the key began stating each source's age.
 */
describe('openMeteoTimeToIso', () => {
  it('reads a bare time as UTC when the offset is zero', () => {
    expect(openMeteoTimeToIso('2026-09-19T19:30', 0)).toBe('2026-09-19T19:30:00.000Z');
  });

  /*
   * The case that fails if this ever parses through the local zone: the answer
   * must be the same instant whatever zone the machine running it is in.
   */
  it('gives the same instant whatever zone the machine is in', () => {
    const iso = openMeteoTimeToIso('2026-09-19T19:30', 0)!;

    expect(Date.parse(iso)).toBe(Date.UTC(2026, 8, 19, 19, 30));
  });

  it('honours the offset Open-Meteo reports, rather than assuming UTC', () => {
    // A time given in UTC+01:00 is an hour EARLIER in UTC.
    expect(openMeteoTimeToIso('2026-09-19T19:30', 3600)).toBe('2026-09-19T18:30:00.000Z');
  });

  it('returns what it was given when it cannot read it, so the key calls it unreadable', () => {
    expect(openMeteoTimeToIso('t', 0)).toBe('t');
  });
});
