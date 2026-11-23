// Integration test for space weather data display on Globe
// AI-NOTE: Tests the complete data flow from NOAA API to Globe visualization

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GlobeEngine } from './GlobeEngine';
import { fetchLatestElectricFieldData, transformNOAAToIntelMarkers } from '../services/noaaSpaceWeather';
import { fetchLiveKpSnapshot, fetchLiveSolarWindSnapshot } from '../services/SpaceWeatherLive';
import { fetchAlerts } from '../services/AlertsService';
import { NOAAElectricFieldData } from '../types';

// Mock the NOAA service
vi.mock('../services/noaaSpaceWeather', () => ({
  fetchLatestElectricFieldData: vi.fn(),
  transformNOAAToIntelMarkers: vi.fn(),
}));

vi.mock('../services/SpaceWeatherLive', () => ({
  fetchLiveSolarWindSnapshot: vi.fn(),
  fetchLiveKpSnapshot: vi.fn()
}));

vi.mock('./GlobeTextureLoader', () => ({
  GlobeTextureLoader: {
    loadTexture: vi.fn(async () => ({ dummy: true }))
  }
}));

// The real SKIN_TEXTURES, and the methods the engine calls. This mocked only
// getMaterialForMode, which the engine no longer calls, so every engine here
// failed to start and drew a fallback; found in plan item 8.3c.
vi.mock('./GlobeMaterialManager', async (importOriginal) => ({
  SKIN_TEXTURES: (await importOriginal<typeof import('./GlobeMaterialManager')>()).SKIN_TEXTURES,
  GlobeMaterialManager: {
    getMaterialForSkin: vi.fn(() => ({}) as unknown as THREE.Material),
    disposeMaterial: vi.fn(),
  }
}));

// Mock other services to avoid network calls
vi.mock('../services/WeatherDataService', () => ({
  fetchWeatherData: vi.fn().mockResolvedValue({ temp: 20, condition: 'clear' }),
}));

vi.mock('../services/AlertsService', () => ({
  fetchAlerts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/GeoEventsService', () => ({
  fetchNaturalEvents: vi.fn().mockResolvedValue([]),
}));

vi.mock('../services/SpaceAssetsService', () => ({
  fetchSpaceAssets: vi.fn().mockResolvedValue([]),
}));

const mockInterMagData = {
  time_tag: '2025-06-18',
  cadence: 60,
  product_version: 'InterMagEarthScope',
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [-124.0, 41.0]
      },
      properties: {
        Ex: -1.35,
        Ey: -18.32,
        quality_flag: 4,
        distance_nearest_station: 570.49
      }
    },
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [-124.0, 42.0]
      },
      properties: {
        Ex: -0.57,
        Ey: -7.73,
        quality_flag: 5,
        distance_nearest_station: 657.64
      }
    }
  ]
};

const mockUSCanadaData = {
  time_tag: '2025-06-18',
  cadence: 60,
  product_version: 'US-Canada-1D',
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [-139.0, 60.0]
      },
      properties: {
        Ex: -0.83,
        Ey: 3.11,
        quality_flag: 4,
        distance_nearest_station: 390.07
      }
    }
  ]
};

describe('Globe Space Weather Integration', () => {
  let globeEngine: GlobeEngine;
  let eventHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandler = vi.fn();
    
    // Setup mock implementations
    vi.mocked(fetchLatestElectricFieldData).mockImplementation(async (dataset) => {
      return dataset === 'InterMag' ? mockInterMagData : mockUSCanadaData;
    });
    
    vi.mocked(transformNOAAToIntelMarkers).mockImplementation((data, category) => {
      return data.features.map((feature, index) => ({
        pubkey: `NOAA_${category}_${index}`,
        title: `Electric Field @ (${feature.geometry.coordinates[1]}, ${feature.geometry.coordinates[0]})`,
        content: `Electric Field: Ex=${feature.properties.Ex}, Ey=${feature.properties.Ey}`,
        tags: ['SIGINT', 'space-weather', category],
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
        timestamp: Date.now() / 1000,
        author: 'NOAA_SWPC'
      }));
    });

    const freshIso = new Date().toISOString();
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValue({
      snapshot: { speedKmPerSec: 420, densityPerCm3: 6, bz: -1.2, timestamp: freshIso },
      quality: 'live'
    });
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValue({ snapshot: { kp: 3, timestamp: freshIso }, quality: 'live' });

    // Re-armed here rather than left to the module-scope vi.mock() above: the
    // global afterEach in setupVitest.ts calls vi.restoreAllMocks(), which
    // strips a one-shot mock's implementation after the first test uses it.
    // fetchAlerts is only exercised by the 'alerts' overlay path (one test in
    // this file), so it silently degraded to returning undefined for every
    // test after the first — same bug class setupVitest.ts already documents
    // and fixes for global.fetch.
    vi.mocked(fetchAlerts).mockResolvedValue([]);

    globeEngine = new GlobeEngine({
      mode: 'CyberCommand',
      onEvent: eventHandler
    });
  });

  it('should add space weather InterMag overlay and fetch data', async () => {
    // Add the overlay
    globeEngine.addOverlay('spaceWeatherInterMag');
    
    // Wait for async data fetch
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify the service was called
    expect(fetchLatestElectricFieldData).toHaveBeenCalledWith('InterMag');
    expect(transformNOAAToIntelMarkers).toHaveBeenCalledWith(mockInterMagData, 'electric-field-intermag');
    
    // Verify events were emitted
    expect(eventHandler).toHaveBeenCalledWith({
      type: 'overlayDataLoading',
      payload: { overlay: 'spaceWeatherInterMag' }
    });
    
    expect(eventHandler).toHaveBeenCalledWith({
      type: 'overlayDataUpdated',
      payload: {
        overlay: 'spaceWeatherInterMag',
        data: expect.arrayContaining([
          expect.objectContaining({
            title: expect.stringContaining('Electric Field'),
            tags: expect.arrayContaining(['SIGINT', 'space-weather', 'electric-field-intermag'])
          })
        ])
      }
    });
  });

  it('should add space weather US-Canada overlay and fetch data', async () => {
    // Add the overlay
    globeEngine.addOverlay('spaceWeatherUSCanada');
    
    // Wait for async data fetch
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify the service was called
    expect(fetchLatestElectricFieldData).toHaveBeenCalledWith('US-Canada');
    expect(transformNOAAToIntelMarkers).toHaveBeenCalledWith(mockUSCanadaData, 'electric-field-us-canada');
    
    // Verify overlay data is available
    const overlayData = globeEngine.getOverlayData('spaceWeatherUSCanada');
    expect(overlayData).toBeDefined();
    expect(Array.isArray(overlayData)).toBe(true);
  });

  it('should handle space weather data fetch errors gracefully', async () => {
    // Mock a fetch error
    vi.mocked(fetchLatestElectricFieldData).mockRejectedValueOnce(new Error('Network error'));
    
    // Add the overlay
    globeEngine.addOverlay('spaceWeatherInterMag');
    
    // Wait for error handling
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify error event was emitted
    expect(eventHandler).toHaveBeenCalledWith({
      type: 'overlayDataError',
      payload: {
        overlay: 'spaceWeatherInterMag',
        error: 'Network error'
      }
    });
  });

  it('should remove space weather overlays correctly', () => {
    // Add overlays
    globeEngine.addOverlay('spaceWeatherInterMag');
    globeEngine.addOverlay('spaceWeatherUSCanada');
    
    // Verify overlays are active
    expect(globeEngine.getOverlays()).toContain('spaceWeatherInterMag');
    expect(globeEngine.getOverlays()).toContain('spaceWeatherUSCanada');
    
    // Remove one overlay
    globeEngine.removeOverlay('spaceWeatherInterMag');
    
    // Verify overlay was removed
    expect(globeEngine.getOverlays()).not.toContain('spaceWeatherInterMag');
    expect(globeEngine.getOverlays()).toContain('spaceWeatherUSCanada');
    
    // Verify removal event was emitted
    expect(eventHandler).toHaveBeenCalledWith({
      type: 'overlayRemoved',
      payload: 'spaceWeatherInterMag'
    });
  });

  it('does not fetch InterMag/US-Canada electric-field data from the periodic spaceWeather poller (nothing renders it — see fetchAndUpdateSpaceWeather)', async () => {
    // Regression test: this poller used to fetch InterMag/US-Canada independently of the
    // identical fetch SpaceWeatherContext/useSpaceWeatherData already makes on the React
    // side — a real, wasted duplicate NOAA request every 5 minutes for data nothing
    // downstream ever read. Only the boundary fetchers (solar wind/Kp) should run here.
    globeEngine.addOverlay('spaceWeather');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(fetchLatestElectricFieldData).not.toHaveBeenCalled();
    expect(fetchLiveSolarWindSnapshot).toHaveBeenCalled();
    expect(fetchLiveKpSnapshot).toHaveBeenCalled();
  });

  it('builds and tears down boundary objects when overlays toggle off', async () => {
    globeEngine.addOverlay('spaceWeatherMagnetopause');
    globeEngine.addOverlay('spaceWeatherAurora');
    await new Promise((r) => setTimeout(r, 80));

    expect(globeEngine.getOverlayObject('spaceWeatherMagnetopause')).toBeTruthy();
    expect(globeEngine.getOverlayObject('spaceWeatherAuroraLinesNorth')).toBeTruthy();
    expect(globeEngine.getOverlayObject('spaceWeatherAuroraLinesSouth')).toBeTruthy();
    expect(globeEngine.getOverlayObject('spaceWeatherAuroraBlackout')).toBeTruthy();

    globeEngine.removeOverlay('spaceWeatherAurora');
    globeEngine.removeOverlay('spaceWeatherMagnetopause');

    expect(globeEngine.getOverlayObject('spaceWeatherMagnetopause')).toBeUndefined();
    expect(globeEngine.getOverlayObject('spaceWeatherAuroraLinesNorth')).toBeUndefined();
    expect(globeEngine.getOverlayObject('spaceWeatherAuroraLinesSouth')).toBeUndefined();
    expect(globeEngine.getOverlayObject('spaceWeatherAuroraBlackout')).toBeUndefined();
  });

  /*
   * The boundary poller fetched for all four boundary overlays and built and announced every one,
   * switched on or not, and the globe attached what was announced: entering Space Weather drew the
   * Kp aurora ring and shell under OVATION's aurora with their toggles off (D-SW, step 3).
   */
  it('builds and announces only the boundary overlays switched on, keeping the rest ready for when they are', async () => {
    const announced: string[] = [];
    globeEngine.on('overlayDataUpdated', (event) => {
      const overlay = (event.payload as { overlay?: string } | undefined)?.overlay;
      if (overlay) announced.push(overlay);
    });
    globeEngine.addOverlay('spaceWeatherMagnetopause');
    await new Promise((r) => setTimeout(r, 80));
    expect(globeEngine.getOverlayObject('spaceWeatherMagnetopause')).toBeTruthy();
    expect(globeEngine.getOverlayObject('spaceWeatherAuroraLinesNorth')).toBeUndefined();
    expect(globeEngine.getOverlayObject('spaceWeatherGeomagneticIndex')).toBeUndefined();
    expect(globeEngine.getOverlayObject('spaceWeatherBowShock')).toBeUndefined();
    expect(announced).not.toContain('spaceWeatherAurora');
    // Switched on later, it is drawn at once from what the poll kept.
    globeEngine.addOverlay('spaceWeatherAurora');
    expect(globeEngine.getOverlayObject('spaceWeatherAuroraLinesNorth')).toBeTruthy();
  });

  it('builds and tears down the geomagnetic index shell', async () => {
    globeEngine.addOverlay('spaceWeatherGeomagneticIndex');
    await new Promise((r) => setTimeout(r, 80));

    expect(globeEngine.getOverlayObject('spaceWeatherGeomagneticIndex')).toBeTruthy();
    const payload = globeEngine.getOverlayData('spaceWeatherGeomagneticIndex') as { kp: number; quality: string };
    expect(payload.kp).toBe(3);
    expect(payload.quality).toBe('live');

    globeEngine.removeOverlay('spaceWeatherGeomagneticIndex');
    expect(globeEngine.getOverlayObject('spaceWeatherGeomagneticIndex')).toBeUndefined();
  });

  it('fetches Kp once per boundary-update cycle and reuses it for both aurora and the geomagnetic shell', async () => {
    globeEngine.addOverlay('spaceWeatherAurora');
    globeEngine.addOverlay('spaceWeatherGeomagneticIndex');
    await new Promise((r) => setTimeout(r, 80));

    vi.mocked(fetchLiveKpSnapshot).mockClear();
    await (globeEngine as unknown as { fetchAndUpdateSpaceWeatherBoundaries: () => Promise<void> }).fetchAndUpdateSpaceWeatherBoundaries();

    expect(fetchLiveKpSnapshot).toHaveBeenCalledTimes(1);
    const aurora = globeEngine.getOverlayData('spaceWeatherAurora') as { kp: number; quality: string };
    const geomagneticIndex = globeEngine.getOverlayData('spaceWeatherGeomagneticIndex') as { kp: number; quality: string };
    expect(geomagneticIndex.kp).toBe(aurora.kp);
    expect(geomagneticIndex.quality).toBe(aurora.quality);
  });

  it('debounces a redundant geomagnetic index rebuild when Kp is unchanged', async () => {
    globeEngine.addOverlay('spaceWeatherGeomagneticIndex');
    await new Promise((r) => setTimeout(r, 80));
    const firstObject = globeEngine.getOverlayObject('spaceWeatherGeomagneticIndex');

    eventHandler.mockClear();
    await (globeEngine as unknown as { fetchAndUpdateSpaceWeatherBoundaries: () => Promise<void> }).fetchAndUpdateSpaceWeatherBoundaries();

    expect(globeEngine.getOverlayObject('spaceWeatherGeomagneticIndex')).toBe(firstObject);
    expect(eventHandler).toHaveBeenCalledWith({
      type: 'overlayDataUpdated',
      payload: { overlay: 'spaceWeatherGeomagneticIndex', data: expect.anything(), unchanged: true }
    });
  });

  it('should transform NOAA data to proper intelligence markers format', () => {
    const result = transformNOAAToIntelMarkers(mockInterMagData, 'test-category');
    
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      pubkey: expect.any(String),
      title: expect.stringContaining('Electric Field'),
      content: expect.stringMatching(/Ex=.*Ey=/),
      tags: expect.arrayContaining(['SIGINT', 'space-weather', 'test-category']),
      latitude: expect.any(Number),
      longitude: expect.any(Number),
      timestamp: expect.any(Number),
      author: expect.any(String)
    });
  });
  
  it('marks boundary payloads stale when live timestamps exceed thresholds', async () => {
    const oldSolarIso = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const oldKpIso = new Date(Date.now() - 100 * 60 * 1000).toISOString();

    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValueOnce({
      snapshot: { speedKmPerSec: 380, densityPerCm3: 5, bz: -0.5, timestamp: oldSolarIso },
      quality: 'live'
    });
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValueOnce({ snapshot: { kp: 6, timestamp: oldKpIso }, quality: 'live' });

    // Disable background interval to avoid racing live refresh overriding stale data
    (globeEngine as any).startSpaceWeatherUpdates = vi.fn();

    // Each overlay read below switched on: the poll draws only those (D-SW, step 3).
    globeEngine.addOverlay('spaceWeatherMagnetopause');
    globeEngine.addOverlay('spaceWeatherBowShock');
    globeEngine.addOverlay('spaceWeatherAurora');
    globeEngine.addOverlay('spaceWeatherGeomagneticIndex');
    await new Promise((r) => setTimeout(r, 80));

    const mp = globeEngine.getOverlayData('spaceWeatherMagnetopause') as { quality: string; meta?: Record<string, unknown> };
    const bs = globeEngine.getOverlayData('spaceWeatherBowShock') as { quality: string; meta?: Record<string, unknown> };
    const aur = globeEngine.getOverlayData('spaceWeatherAurora') as { quality: string; meta?: Record<string, unknown> };
    const geo = globeEngine.getOverlayData('spaceWeatherGeomagneticIndex') as { quality: string; meta?: Record<string, unknown> };

    expect(mp.quality).toBe('stale');
    expect(bs.quality).toBe('stale');
    expect(aur.quality).toBe('stale');
    expect(geo.quality).toBe('stale');
    expect(mp.meta?.stale).toBe(true);
    expect(aur.meta?.stale).toBe(true);
    expect(geo.meta?.stale).toBe(true);
    expect(typeof mp.meta?.ageMs).toBe('number');
    expect(mp.meta?.ageMs as number).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect(geo.meta?.ageMs as number).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });

  it('propagates fallback quality when live fetchers return fallback snapshots', async () => {
    const nowIso = new Date().toISOString();
    vi.mocked(fetchLiveSolarWindSnapshot).mockResolvedValueOnce({
      snapshot: { speedKmPerSec: 420, densityPerCm3: 6, bz: -2, timestamp: nowIso },
      quality: 'fallback'
    });
    vi.mocked(fetchLiveKpSnapshot).mockResolvedValueOnce({ snapshot: { kp: 4, timestamp: nowIso }, quality: 'fallback' });

    // Disable background interval to keep the fallback payloads intact for assertions
    (globeEngine as any).startSpaceWeatherUpdates = vi.fn();

    // Each overlay read below switched on: the poll draws only those (D-SW, step 3).
    globeEngine.addOverlay('spaceWeatherMagnetopause');
    globeEngine.addOverlay('spaceWeatherBowShock');
    globeEngine.addOverlay('spaceWeatherAurora');
    globeEngine.addOverlay('spaceWeatherGeomagneticIndex');
    await new Promise((r) => setTimeout(r, 80));

    const aur = globeEngine.getOverlayData('spaceWeatherAurora') as { quality: string };
    const mp = globeEngine.getOverlayData('spaceWeatherMagnetopause') as { quality: string };
    const bs = globeEngine.getOverlayData('spaceWeatherBowShock') as { quality: string };
    const geo = globeEngine.getOverlayData('spaceWeatherGeomagneticIndex') as { quality: string };

    expect(aur.quality).toBe('fallback');
    expect(geo.quality).toBe('fallback');
    expect(mp.quality).toBe('fallback');
    expect(bs.quality).toBe('fallback');
  });
});

// AI-NOTE: This test suite verifies the complete integration of NOAA space weather data
// with the Globe visualization system, ensuring proper data flow and error handling.
