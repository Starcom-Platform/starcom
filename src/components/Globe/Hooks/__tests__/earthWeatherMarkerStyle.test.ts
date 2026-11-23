/**
 * Earth Weather honours a chosen style — both hooks, all four kinds of mark —
 * and restyling never refetches (decision D-F, step 6.3).
 *
 * ─── WHY THESE ARE HOOK TESTS ──────────────────────────────────────────────
 *
 * Neither hook had a rendering test; both tested only their pure functions. A
 * builder test proves the thing that draws honours a style, not that the hook
 * passes one — which is the gap that kept Satellites `not-yet`. So these mock
 * the services the hooks fetch from and stub the frame loop, as
 * useGlobeSatellites.test.ts does.
 *
 * ─── WHY THE REFETCH ASSERTIONS ────────────────────────────────────────────
 *
 * On Satellites the style was a dependency of the effect that loads its data, so
 * choosing one reloaded the catalogue — and a test passing the choices inline ran
 * the worker out of heap. Here a restyle goes through setScreenPointsStyle, which
 * touches the material alone. These tests pass the choices inline on purpose, and
 * check the services were each asked once.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { useGlobeEarthWeather, weatherObservedAt } from '../useGlobeEarthWeather';
import { useGlobeWaterGauges } from '../useGlobeWaterGauges';
import { MARKER_STYLES, type MarkerStyleChoices } from '../../markerStyles';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';

const svc = vi.hoisted(() => ({
  grid: vi.fn(), ice: vi.fn(), tides: vi.fn(), rivers: vi.fn(),
}));

vi.mock('../../../../services/EarthWeatherService', () => ({
  earthWeatherService: { getCurrentGrid: () => svc.grid(), getSeaIceEvents: () => svc.ice() },
}));
vi.mock('../../../../services/NOAAWaterLevelService', () => ({
  noaaWaterLevelService: { getCurrentReadings: () => svc.tides() },
}));
vi.mock('../../../../services/USGSStreamflowService', () => ({
  usgsStreamflowService: { getCurrentReadings: () => svc.rivers() },
}));
// The gauges thin by camera distance; with no camera there is nothing to measure.
vi.mock('../useCameraDetailTier', () => ({ useCameraDetailTier: () => 2 }));

const POINT = {
  lat: 10, lng: 20, temperatureC: 21, precipitationMm: 0, cloudCoverPct: 10, windSpeedKmh: 12,
  windDirectionDeg: 90, humidityPct: 50, pressureHpa: 1013, timestamp: '2026-09-19T12:00:00Z', usAqi: 40,
};
const ICEBERG = { id: 'b', name: 'A-23a', lat: -60, lng: -40, lastUpdated: '2026-09-18', track: [] };
const TIDE = { station: { id: '1', name: 'The Battery', lat: 40.7, lng: -74 }, waterLevelM: 0.2, timestamp: '2026-09-19 12:00' };
const RIVER = { siteId: '9', siteName: 'Hudson', lat: 42, lng: -74, stateCode: 'ny', dischargeCfs: 5000, timestamp: '2026-09-19T12:00:00Z' };

const ok = <T,>(data: T) => ({ success: true, data, error: null });
const refs = new WeakMap<THREE.Scene, unknown>();
const globeRefFor = (s: THREE.Scene) => {
  if (!refs.has(s)) refs.set(s, { current: { scene: () => s } });
  return refs.get(s) as never;
};
const isLayerActive = (id: string) => id === 'EarthWeather';

const pointsOfType = (s: THREE.Scene, type: string): THREE.Points | undefined => {
  let found: THREE.Points | undefined;
  s.traverse((o) => { if ((o as THREE.Points).isPoints && o.userData?.type === type) found = o as THREE.Points; });
  return found;
};
const styleOf = (p: THREE.Points | undefined) =>
  Object.keys((p?.material as THREE.ShaderMaterial)?.defines ?? {}).find((k) => k.startsWith('STYLE_')) ?? 'STYLE_DISC';

beforeEach(() => {
  resetLegendsForTest();
  svc.grid.mockReset().mockResolvedValue(ok([POINT]));
  svc.ice.mockReset().mockResolvedValue(ok([ICEBERG]));
  svc.tides.mockReset().mockResolvedValue(ok([TIDE]));
  svc.rivers.mockReset().mockResolvedValue(ok([RIVER]));
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('useGlobeEarthWeather — station and iceberg marks', () => {
  const mount = (markerStyles?: MarkerStyleChoices) => {
    const s = new THREE.Scene();
    const hook = renderHook(
      ({ ms }) => useGlobeEarthWeather({ globeRef: globeRefFor(s), isLayerActive, markerStyles: ms }),
      { initialProps: { ms: markerStyles } },
    );
    return { s, ...hook };
  };
  const loaded = (s: THREE.Scene) => waitFor(() => {
    expect(pointsOfType(s, 'earthWeatherGrid')).toBeDefined();
    expect(pointsOfType(s, 'earthWeatherSeaIce')).toBeDefined();
  });

  it('draws both kinds of mark in the chosen style', async () => {
    const { s } = mount({ EarthWeather: 'ring' });
    await loaded(s);

    expect(styleOf(pointsOfType(s, 'earthWeatherGrid'))).toBe('STYLE_RING');
    expect(styleOf(pointsOfType(s, 'earthWeatherSeaIce'))).toBe('STYLE_RING');
  });

  it('can be asked for every style a person can pick', async () => {
    for (const style of MARKER_STYLES) {
      const { s, unmount } = mount({ EarthWeather: style });
      await loaded(s);
      expect(styleOf(pointsOfType(s, 'earthWeatherGrid'))).toBe(`STYLE_${style.toUpperCase()}`);
      unmount();
    }
  });

  it('ignores a style chosen for another layer', async () => {
    const { s } = mount({ SpaceWeather: 'ring' });
    await loaded(s);

    expect(styleOf(pointsOfType(s, 'earthWeatherGrid'))).toBe('STYLE_DISC');
  });

  it('restyles both in place when the choice changes, and fetches nothing to do it', async () => {
    const { s, rerender } = mount({ EarthWeather: 'disc' });
    await loaded(s);
    const stations = pointsOfType(s, 'earthWeatherGrid');

    rerender({ ms: { EarthWeather: 'glow' } });

    await waitFor(() => expect(styleOf(pointsOfType(s, 'earthWeatherGrid'))).toBe('STYLE_GLOW'));
    expect(styleOf(pointsOfType(s, 'earthWeatherSeaIce'))).toBe('STYLE_GLOW');
    // In place: the same object, not a rebuild.
    expect(pointsOfType(s, 'earthWeatherGrid')).toBe(stations);
    expect(svc.grid).toHaveBeenCalledTimes(1);
    expect(svc.ice).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when the same choices arrive in a new object', async () => {
    const { s, rerender } = mount({});
    await loaded(s);

    rerender({ ms: {} });
    rerender({ ms: {} });

    expect(svc.grid).toHaveBeenCalledTimes(1);
  });

  it('tells the card the shape, and follows a change', async () => {
    const { s, rerender } = mount({ EarthWeather: 'ring' });
    await loaded(s);
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'EarthWeather')?.shapeMeans).toBe('ring'));

    rerender({ ms: { EarthWeather: 'glow' } });

    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'EarthWeather')?.shapeMeans).toBe('glow'));
  });
});

describe('useGlobeWaterGauges — tide and river gauges', () => {
  const mount = (markerStyles?: MarkerStyleChoices) => {
    const s = new THREE.Scene();
    const hook = renderHook(
      ({ ms }) => useGlobeWaterGauges({ globeRef: globeRefFor(s), isLayerActive, enabled: true, markerStyles: ms }),
      { initialProps: { ms: markerStyles } },
    );
    return { s, ...hook };
  };
  const loaded = (s: THREE.Scene) => waitFor(() => {
    expect(pointsOfType(s, 'noaaTideGauge')).toBeDefined();
    expect(pointsOfType(s, 'usgsStreamflowGauge')).toBeDefined();
  });

  /*
   * The gauges gate on EarthWeather, so they take EarthWeather's choice. A layer
   * half on rings and half on discs would be one the person never chose.
   */
  it('draws both networks in the style chosen for Earth Weather', async () => {
    const { s } = mount({ EarthWeather: 'ring' });
    await loaded(s);

    expect(styleOf(pointsOfType(s, 'noaaTideGauge'))).toBe('STYLE_RING');
    expect(styleOf(pointsOfType(s, 'usgsStreamflowGauge'))).toBe('STYLE_RING');
  });

  it('restyles both in place, and asks neither network again', async () => {
    const { s, rerender } = mount({ EarthWeather: 'disc' });
    await loaded(s);
    const tide = pointsOfType(s, 'noaaTideGauge');
    const river = pointsOfType(s, 'usgsStreamflowGauge');

    rerender({ ms: { EarthWeather: 'ring' } });

    await waitFor(() => expect(styleOf(pointsOfType(s, 'noaaTideGauge'))).toBe('STYLE_RING'));
    expect(styleOf(pointsOfType(s, 'usgsStreamflowGauge'))).toBe('STYLE_RING');
    expect(svc.tides).toHaveBeenCalledTimes(1);
    expect(svc.rivers).toHaveBeenCalledTimes(1);
    /*
     * And in place — the same objects. The network count alone cannot see a
     * style leaking into this hook's load: the gauges cache their raw readings
     * so a detail-tier change can rebuild without refetching, so the load
     * re-runs from cache and asks nobody. A mutation doing exactly that survived
     * until this was added. It would work, and rebuild every gauge to change a
     * shader define.
     */
    expect(pointsOfType(s, 'noaaTideGauge')).toBe(tide);
    expect(pointsOfType(s, 'usgsStreamflowGauge')).toBe(river);
  });

  /*
   * Each builder published the key before keeping the mesh it had just built, so
   * the key ran one build behind: the river gauges, built last, never had a row.
   * Seen on the running app on 2026-10-07: 750 river gauges drawn, the key naming
   * the tide gauges alone.
   */
  it('names the tide gauges in the key when the river gauges could not be read', async () => {
    svc.rivers.mockReset().mockResolvedValue({ success: false, data: null, error: 'USGS did not answer' });
    const { s } = mount();
    await waitFor(() => expect(pointsOfType(s, 'noaaTideGauge')).toBeDefined());
    const labels = () => (getLegends().find((l) => l.layerId === 'EarthWeather:waterGauges')?.swatches ?? []).map((w) => w.label);
    await waitFor(() => expect(labels()).toEqual(['tide gauge (NOAA)']));
  });

  it('reports each network: when it last reported, or why it could not be read', async () => {
    svc.rivers.mockReset().mockResolvedValue({ success: false, data: null, error: 'USGS did not answer' });
    const { result } = mount();
    await waitFor(() => expect(result.current.tide).toEqual({ loading: false, error: null, newest: '2026-09-19T12:00:00Z' }));
    expect(result.current.rivers).toEqual({ loading: false, error: 'USGS did not answer', newest: null });
  });

  it('reports the newest river reading', async () => {
    svc.rivers.mockReset().mockResolvedValue(ok([RIVER, { ...RIVER, siteId: '10', timestamp: '2026-09-19T12:30:00Z' }]));
    const { result } = mount();
    await waitFor(() => expect(result.current.rivers).toEqual({ loading: false, error: null, newest: '2026-09-19T12:30:00Z' }));
  });

  it('names both networks in the key once both are drawn', async () => {
    const { s } = mount();
    await loaded(s);
    const labels = () => (getLegends().find((l) => l.layerId === 'EarthWeather:waterGauges')?.swatches ?? []).map((w) => w.label);
    await waitFor(() => expect(labels()).toEqual(['tide gauge (NOAA)', 'river gauge (USGS)']));
  });

  it('tells the card the shape, and follows a change', async () => {
    const { s, rerender } = mount({ EarthWeather: 'ring' });
    await loaded(s);
    const legend = () => getLegends().find((l) => l.layerId === 'EarthWeather:waterGauges');
    await waitFor(() => expect(legend()?.shapeMeans).toBe('ring'));

    rerender({ ms: { EarthWeather: 'disc' } });

    await waitFor(() => expect(legend()?.shapeMeans).toBe('disc'));
  });
});

/**
 * What Earth Weather says about its own data (decision D-F, step 11).
 *
 * The hook returned only its group, so Globe.tsx built its feed as
 * `unreported: true` and both the share card and the key said "does not report
 * whether its data arrived" about a layer that fetches its own weather.
 */
describe('useGlobeEarthWeather — what it reports about its data', () => {
  const mountHealth = () => {
    const s = new THREE.Scene();
    return renderHook(() => useGlobeEarthWeather({ globeRef: globeRefFor(s), isLayerActive }));
  };

  /*
   * The source's clock, and the OLDEST reading: a layer is only as current as
   * its most out-of-date mark. Never the moment the app fetched — a cached grid
   * re-read now is still weather observed then.
   */
  it('reports when the weather was observed, by the oldest point drawn', async () => {
    svc.grid.mockResolvedValue(ok([
      { ...POINT, timestamp: '2026-09-19T16:45:00.000Z' },
      { ...POINT, lat: 30, timestamp: '2026-09-19T16:30:00.000Z' },
    ]));
    const { result } = mountHealth();

    await waitFor(() => expect(result.current.lastLoadedAt).toBe(Date.parse('2026-09-19T16:30:00.000Z')));
    expect(result.current.error).toBeNull();
    expect(result.current.untimed).toBe(false);
  });

  it('says the weather is drawn but untimed when no point carries a readable time', async () => {
    svc.grid.mockResolvedValue(ok([{ ...POINT, timestamp: 't' }]));
    const { result } = mountHealth();

    await waitFor(() => expect(result.current.untimed).toBe(true));
    expect(result.current.lastLoadedAt).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('carries the reason when the first load fails', async () => {
    svc.grid.mockResolvedValue({ success: false, data: null, error: 'HTTP 502' });
    const { result } = mountHealth();

    await waitFor(() => expect(result.current.error).toBe('HTTP 502'));
    expect(result.current.lastLoadedAt).toBeNull();
  });
});

describe('weatherObservedAt', () => {
  it('takes the oldest readable time, skipping any it cannot read', () => {
    expect(weatherObservedAt([
      { ...POINT, timestamp: '2026-09-19T17:00:00.000Z' },
      { ...POINT, timestamp: 'garbage' },
      { ...POINT, timestamp: '2026-09-19T16:00:00.000Z' },
    ])).toBe(Date.parse('2026-09-19T16:00:00.000Z'));
  });

  it('is null when nothing can be read, rather than "now"', () => {
    expect(weatherObservedAt([{ ...POINT, timestamp: 'garbage' }])).toBeNull();
    expect(weatherObservedAt([])).toBeNull();
  });
});

describe('useGlobeEarthWeather — the key when the weather source is down', () => {
  /*
   * Found on the running globe with Open-Meteo forced to 503: no stations drawn,
   * icebergs drawn, and the key still said "colour: temperature" beside one
   * white iceberg swatch.
   */
  it('does not claim colour means temperature when no station is drawn', async () => {
    svc.grid.mockResolvedValue({ success: false, data: null, error: 'HTTP 503' });
    const s = new THREE.Scene();
    renderHook(() => useGlobeEarthWeather({ globeRef: globeRefFor(s), isLayerActive }));

    await waitFor(() => expect(pointsOfType(s, 'earthWeatherSeaIce')).toBeDefined());
    const legend = getLegends().find((l) => l.layerId === 'EarthWeather');
    expect(legend?.swatches.map((w) => w.label)).toEqual(['tracked iceberg']);
    expect(legend?.colorMeans).toBeUndefined();
  });
});
