// src/context/SpaceWeatherContext.test.tsx
// Integration tests for SpaceWeatherContext basic toggle & layer gating.
//
// This file used to also carry a "pipeline integration" describe block, but
// it was a broken near-duplicate of SpaceWeatherContext.pipeline.test.tsx
// (same scenarios, same assertions) — its inline AdapterOrchestrator mock
// was missing a `clear()` method that SpaceWeatherContext.tsx's teardown
// calls unconditionally, and one assertion (`pipelineActive` should be
// `false` after a fetch failure) had drifted stale relative to
// pipeline.test.tsx's own passing version of the identical scenario, which
// correctly expects `true` (a failed fetch records an error but does not
// disable the pipeline). Removed rather than repaired, since
// pipeline.test.tsx already covers this correctly — keeping both would mean
// maintaining two copies of the same coverage, one of which was wrong.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { SpaceWeatherProvider, useSpaceWeatherContext } from './SpaceWeatherContext';
import { useEcoNaturalSettings } from '../hooks/useEcoNaturalSettings';
import { useSpaceWeatherData } from '../hooks/useSpaceWeatherData';
import { useEnterpriseSpaceWeatherData } from '../hooks/useEnterpriseSpaceWeatherData';
import { normalizeElectricFieldVectors } from '../utils/electricFieldNormalization';

// Mock visualization mode to satisfy mode gating (EcoNatural/SpaceWeather)
vi.mock('./VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'EcoNatural', subMode: 'SpaceWeather' },
    setVisualizationMode: vi.fn(),
    setPrimaryMode: vi.fn(),
    resetVisualizationMode: vi.fn()
  })
}));

// Mock dependent hooks & utils
vi.mock('../hooks/useEcoNaturalSettings');
vi.mock('../hooks/useSpaceWeatherData');
vi.mock('../hooks/useEnterpriseSpaceWeatherData');
vi.mock('../utils/electricFieldNormalization');
vi.mock('../services/space-weather/AdapterOrchestrator', () => ({
  createAdapterOrchestrator: () => ({
    register() { return this; },
    async fetchAll() { return { datasets: [], vectors: [], metrics: { adapterCount: 0, totalVectors: 0, fetchMs: 0, failures: 0 }, errors: [] }; },
    clear: vi.fn()
  })
}));
vi.mock('../services/space-weather/adapters/NoaaInterMagAdapter', () => ({ createNoaaInterMagAdapter: () => ({ id: 'a' }) }));
vi.mock('../services/space-weather/adapters/NoaaUSCanadaAdapter', () => ({ createNoaaUSCanadaAdapter: () => ({ id: 'b' }) }));

const mockUpdateSpaceWeather = vi.fn();
const mockSpaceWeatherData = {
  interMagData: null,
  usCanadaData: null,
  alerts: [],
  isLoading: false,
  error: null,
  lastUpdated: null,
  refresh: vi.fn()
};

const baseConfig = {
  spaceWeather: {
    activeLayer: 'electricFields',
    showElectricFields: true,
    showGeomagneticIndex: false,
    showAlerts: true,
    vectorIntensity: 80,
    vectorOpacity: 60,
    vectorScale: 1.0,
    heatMapIntensity: 50,
    showMagneticField: false,
    showAuroralOval: false,
    showKpIndex: false,
    showSolarWind: false,
    showMagnetopause: false,
    timeWindow: 24,
    alertThresholds: { moderate: 1000, high: 3000, extreme: 5000 },
    autoRefresh: true,
    refreshInterval: 5,
    showStatistics: true,
    normalization: {
      method: 'adaptive',
      outlierFactor: 1.5,
      smoothingFactor: 0.1,
      percentileRange: [10, 90],
      clampMax: null
    },
    enhancedSampling: false,
    pipelineEnabled: false,
    enabledDatasets: { intermag: true, usCanada: true, pipeline: true }
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useEcoNaturalSettings).mockReturnValue({
    config: baseConfig,
    updateSpaceWeather: mockUpdateSpaceWeather,
    isElectricFieldsEnabled: baseConfig.spaceWeather.showElectricFields,
    vectorSettings: { intensity: baseConfig.spaceWeather.vectorIntensity / 100, opacity: baseConfig.spaceWeather.vectorOpacity / 100 },
    alertThresholds: baseConfig.spaceWeather.alertThresholds,
    dataSettings: { autoRefresh: baseConfig.spaceWeather.autoRefresh, refreshIntervalMs: baseConfig.spaceWeather.refreshInterval * 60 * 1000 }
  });
  vi.mocked(useSpaceWeatherData).mockReturnValue(mockSpaceWeatherData);
  vi.mocked(useEnterpriseSpaceWeatherData).mockReturnValue(mockSpaceWeatherData);
  vi.mocked(normalizeElectricFieldVectors).mockReturnValue([]);
});

describe('SpaceWeatherContext basic & layer gating', () => {
  const wrapper = (props) => React.createElement(SpaceWeatherProvider, null, props.children);

  it('shows overlay when activeLayer is electricFields and enabled', () => {
    const { result } = renderHook(() => useSpaceWeatherContext(), { wrapper });
    expect(result.current.shouldShowOverlay).toBe(true);
  });

  it('hides overlay when electric fields disabled', () => {
    const disabledConfig = { ...baseConfig, spaceWeather: { ...baseConfig.spaceWeather, showElectricFields: false } };
    vi.mocked(useEcoNaturalSettings).mockReturnValue({
      config: disabledConfig,
      updateSpaceWeather: mockUpdateSpaceWeather,
      isElectricFieldsEnabled: false,
      vectorSettings: { intensity: disabledConfig.spaceWeather.vectorIntensity / 100, opacity: disabledConfig.spaceWeather.vectorOpacity / 100 },
      alertThresholds: disabledConfig.spaceWeather.alertThresholds,
      dataSettings: { autoRefresh: disabledConfig.spaceWeather.autoRefresh, refreshIntervalMs: disabledConfig.spaceWeather.refreshInterval * 60 * 1000 }
    });
    const { result } = renderHook(() => useSpaceWeatherContext(), { wrapper });
    expect(result.current.shouldShowOverlay).toBe(false);
  });

  it('gates overlay when activeLayer is geomagnetic (placeholder)', () => {
    const geomagneticConfig = { ...baseConfig, spaceWeather: { ...baseConfig.spaceWeather, activeLayer: 'geomagnetic' } };
    vi.mocked(useEcoNaturalSettings).mockReturnValue({
      config: geomagneticConfig,
      updateSpaceWeather: mockUpdateSpaceWeather,
      isElectricFieldsEnabled: geomagneticConfig.spaceWeather.showElectricFields,
      vectorSettings: { intensity: geomagneticConfig.spaceWeather.vectorIntensity / 100, opacity: geomagneticConfig.spaceWeather.vectorOpacity / 100 },
      alertThresholds: geomagneticConfig.spaceWeather.alertThresholds,
      dataSettings: { autoRefresh: geomagneticConfig.spaceWeather.autoRefresh, refreshIntervalMs: geomagneticConfig.spaceWeather.refreshInterval * 60 * 1000 }
    });
    const { result } = renderHook(() => useSpaceWeatherContext(), { wrapper });
    expect(result.current.shouldShowOverlay).toBe(false);
    expect(result.current.visualizationVectors).toEqual([]);
  });

  it('exposes normalization settings', () => {
    const { result } = renderHook(() => useSpaceWeatherContext(), { wrapper });
    expect(result.current.settings.normalization.method).toBe('adaptive');
  });

  it('provides update function', () => {
    const { result } = renderHook(() => useSpaceWeatherContext(), { wrapper });
    expect(result.current.updateSettings).toBe(mockUpdateSpaceWeather);
  });

  it('supports activeLayer update persistence', () => {
    const { result, rerender } = renderHook(() => useSpaceWeatherContext(), { wrapper });
    expect(result.current.settings.activeLayer).toBe('electricFields');
    mockUpdateSpaceWeather({ activeLayer: 'geomagnetic' });
    expect(mockUpdateSpaceWeather).toHaveBeenCalledWith({ activeLayer: 'geomagnetic' });
    const updatedConfig = { ...baseConfig, spaceWeather: { ...baseConfig.spaceWeather, activeLayer: 'geomagnetic' } };
    vi.mocked(useEcoNaturalSettings).mockReturnValue({
      config: updatedConfig,
      updateSpaceWeather: mockUpdateSpaceWeather,
      isElectricFieldsEnabled: updatedConfig.spaceWeather.showElectricFields,
      vectorSettings: { intensity: updatedConfig.spaceWeather.vectorIntensity / 100, opacity: updatedConfig.spaceWeather.vectorOpacity / 100 },
      alertThresholds: updatedConfig.spaceWeather.alertThresholds,
      dataSettings: { autoRefresh: updatedConfig.spaceWeather.autoRefresh, refreshIntervalMs: updatedConfig.spaceWeather.refreshInterval * 60 * 1000 }
    });
    rerender();
    expect(result.current.settings.activeLayer).toBe('geomagnetic');
  });
});
