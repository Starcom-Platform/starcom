/* Tests for activeLayer gating & persistence.
 *
 * Wraps in a mocked useVisualizationMode (fixed at EcoNatural/SpaceWeather),
 * not the real VisualizationModeProvider — the real provider initializes to
 * CyberCommand/IntelReports and only reaches EcoNatural/SpaceWeather via an
 * explicit setPrimaryMode call this file never made, so shouldShowOverlay
 * was unconditionally false here regardless of any other mock. Matches the
 * mocking pattern already used successfully by every sibling
 * SpaceWeatherContext test file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { SpaceWeatherProvider, useSpaceWeatherContext } from './SpaceWeatherContext';
import { useEcoNaturalSettings } from '../hooks/useEcoNaturalSettings';
import { useSpaceWeatherData } from '../hooks/useSpaceWeatherData';
import { useEnterpriseSpaceWeatherData } from '../hooks/useEnterpriseSpaceWeatherData';
import { normalizeElectricFieldVectors } from '../utils/electricFieldNormalization';

vi.mock('./VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'EcoNatural', subMode: 'SpaceWeather' },
    setVisualizationMode: vi.fn(),
    setPrimaryMode: vi.fn(),
    resetVisualizationMode: vi.fn()
  })
}));
vi.mock('../hooks/useEcoNaturalSettings');
vi.mock('../hooks/useSpaceWeatherData');
vi.mock('../hooks/useEnterpriseSpaceWeatherData');
vi.mock('../utils/electricFieldNormalization');

const mockUpdateSpaceWeather = vi.fn();

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

const mockData = {
  interMagData: { vectors: [], timestamp: Date.now() },
  usCanadaData: { vectors: [], timestamp: Date.now() },
  alerts: [],
  isLoading: false,
  error: null,
  lastUpdated: null,
  refresh: vi.fn()
};

const mockNormalize = vi.mocked(normalizeElectricFieldVectors);

function setupMocks(cfg = baseConfig) {
  vi.mocked(useEcoNaturalSettings).mockReturnValue({
    config: cfg,
    updateSpaceWeather: mockUpdateSpaceWeather,
    isElectricFieldsEnabled: cfg.spaceWeather.showElectricFields,
    vectorSettings: { intensity: cfg.spaceWeather.vectorIntensity / 100, opacity: cfg.spaceWeather.vectorOpacity / 100 },
    alertThresholds: cfg.spaceWeather.alertThresholds,
    dataSettings: { autoRefresh: cfg.spaceWeather.autoRefresh, refreshIntervalMs: cfg.spaceWeather.refreshInterval * 60 * 1000 }
  });
  vi.mocked(useSpaceWeatherData).mockReturnValue(mockData);
  vi.mocked(useEnterpriseSpaceWeatherData).mockReturnValue(mockData);
  mockNormalize.mockReturnValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

function Wrapper(props) {
  const { children } = props;
  return React.createElement(SpaceWeatherProvider, null, children);
}

describe('SpaceWeather activeLayer gating', () => {
  it('renders vectors when activeLayer is electricFields', () => {
  const { result } = renderHook(() => useSpaceWeatherContext(), { wrapper: Wrapper });
    expect(result.current.shouldShowOverlay).toBe(true);
  });

  it('gates vectors when activeLayer is geomagnetic (placeholder)', () => {
    const geomagneticConfig = { ...baseConfig, spaceWeather: { ...baseConfig.spaceWeather, activeLayer: 'geomagnetic', showElectricFields: true } };
    setupMocks(geomagneticConfig);
  const { result } = renderHook(() => useSpaceWeatherContext(), { wrapper: Wrapper });
    expect(result.current.shouldShowOverlay).toBe(false);
    expect(result.current.visualizationVectors).toEqual([]);
  });

  it('updateSpaceWeather persists activeLayer change', () => {
  const { result, rerender } = renderHook(() => useSpaceWeatherContext(), { wrapper: Wrapper });
    act(() => {
      mockUpdateSpaceWeather({ activeLayer: 'geomagnetic' });
    });
    expect(mockUpdateSpaceWeather).toHaveBeenCalledWith({ activeLayer: 'geomagnetic' });
    // Simulate persistence by re-mocking with updated layer
    const updatedConfig = { ...baseConfig, spaceWeather: { ...baseConfig.spaceWeather, activeLayer: 'geomagnetic' } };
    setupMocks(updatedConfig);
    rerender();
    expect(result.current.settings.activeLayer).toBe('geomagnetic');
  });
});
