/**
 * The e-field's settings (space-weather-visualization.md, SW1, SW2): how it shows its
 * direction, its colour scale, its streaks, and how often NOAA's files are fetched.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const doubles = vi.hoisted(() => ({
  settings: {
    config: {
      spaceWeather: {
        preset: 'moderate', vectorIntensity: 50, vectorOpacity: 60, showElectricFields: true, showKpIndex: false, showSolarWind: false,
        enabledDatasets: {}, eFieldLook: 'streaks', eFieldScale: 'absolute', eFieldFlowSpeed: 1, eFieldFlowDensity: 1,
        autoRefresh: true, refreshInterval: 5,
      } as Record<string, unknown>,
    },
    updateSpaceWeather: vi.fn(),
  },
  weather: { isLoading: false, error: null, lastUpdated: null, telemetry: { rawInterMag: 3432, rawUSCanada: 6763 } },
}));
vi.mock('../../../../../hooks/useEcoNaturalSettings', () => ({ useEcoNaturalSettings: () => doubles.settings }));
vi.mock('../../../../../context/SpaceWeatherContext', () => ({ useSpaceWeatherContext: () => doubles.weather }));
vi.mock('../SpaceWeatherPresets', () => ({ default: () => null }));
vi.mock('../SpaceWeatherIntensity', () => ({ default: () => null }));
vi.mock('../NOAADataToggle', () => ({ default: () => null }));
vi.mock('../AdvancedNOAATabbed', () => ({ default: () => null }));

import CompactSpaceWeatherControls from '../CompactSpaceWeatherControls';

describe('the e-field\'s settings', () => {
  beforeEach(() => { doubles.settings.updateSpaceWeather.mockClear(); });

  it('says how many samples it read, every one drawn, and offers no cap', () => {
    render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    expect(screen.getByText('10195')).toHaveAttribute('title', 'NOAA samples read; the field draws them all');
    expect(screen.queryByText('Cap')).toBeNull();
  });

  it('chooses the look and the colour scale, saying which is on', () => {
    render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    expect(screen.getByRole('button', { name: 'Streaks' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Relative' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenCalledWith({ eFieldScale: 'relative' });
    expect(screen.getByRole('button', { name: 'Absolute' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers every look the field has (SW1), each set by its button', () => {
    render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    for (const [name, look] of [['Arrows', 'arrows'], ['Ripples', 'ripples'], ['Relief', 'relief']] as const) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(screen.getByRole('button', { name }));
      expect(doubles.settings.updateSpaceWeather).toHaveBeenCalledWith({ eFieldLook: look });
    }
  });

  it('sets the streaks\' pace and number', () => {
    render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    fireEvent.change(screen.getByLabelText('How fast the e-field\'s streaks move'), { target: { value: '1.5' } });
    expect(doubles.settings.updateSpaceWeather).toHaveBeenCalledWith({ eFieldFlowSpeed: 1.5 });
    fireEvent.change(screen.getByLabelText('How many streaks the e-field draws'), { target: { value: '0.5' } });
    expect(doubles.settings.updateSpaceWeather).toHaveBeenCalledWith({ eFieldFlowDensity: 0.5 });
  });

  it('fetches every 5, 15 or 30 minutes, or once, the e-field and the aurora alike', () => {
    render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    const fetch = screen.getByLabelText('How often NOAA\'s e-field files and aurora forecast are fetched');
    expect(fetch).toHaveValue('5');
    fireEvent.change(fetch, { target: { value: '15' } });
    expect(doubles.settings.updateSpaceWeather).toHaveBeenCalledWith({ autoRefresh: true, refreshInterval: 15 });
    fireEvent.change(fetch, { target: { value: '0' } });
    expect(doubles.settings.updateSpaceWeather).toHaveBeenCalledWith({ autoRefresh: false });
  });
});
