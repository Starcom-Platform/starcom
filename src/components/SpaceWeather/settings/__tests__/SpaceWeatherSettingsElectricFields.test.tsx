/**
 * The e-field's popup from the sub-rail (space-weather-visualization.md, SW1, SW2): the Space Weather
 * panel's settings, which act on the field drawn, and none of the dots' (vector scale, sampling,
 * normalization), which had nothing left to act on.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const doubles = vi.hoisted(() => ({
  settings: {
    config: {
      spaceWeather: {
        eFieldLook: 'relief', eFieldScale: 'absolute', eFieldFlowSpeed: 1, eFieldFlowDensity: 0.5,
        enabledDatasets: { intermag: true, usCanada: false, pipeline: false }, autoRefresh: true, refreshInterval: 15,
      } as Record<string, unknown>,
    },
    updateSpaceWeather: vi.fn(),
  },
}));
vi.mock('../../../../hooks/useEcoNaturalSettings', () => ({ useEcoNaturalSettings: () => doubles.settings }));

import SpaceWeatherSettingsElectricFields from '../SpaceWeatherSettingsElectricFields';

describe('the e-field\'s popup', () => {
  beforeEach(() => { doubles.settings.updateSpaceWeather.mockClear(); });

  it('shows the settings as they are: the look, the colours, the streaks, the models, the fetch', () => {
    render(<SpaceWeatherSettingsElectricFields />);
    expect(screen.getByRole('radio', { name: 'Relief' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Streaks' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Absolute' })).toBeChecked();
    expect(screen.getByLabelText('How many streaks the e-field draws')).toHaveValue('0.5');
    expect(screen.getByRole('checkbox', { name: 'InterMag EarthScope' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'US-Canada 1D' })).not.toBeChecked();
    expect(screen.getByLabelText('How often NOAA\'s e-field files and aurora forecast are fetched')).toHaveValue('15');
  });

  it('offers none of the dots\' settings', () => {
    render(<SpaceWeatherSettingsElectricFields />);
    for (const gone of [/Vector Scale/i, /Enhanced Sampling/i, /Outlier/i, /Smoothing/i, /^Method$/i, /^Pipeline$/i]) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('sets each as the panel does', () => {
    render(<SpaceWeatherSettingsElectricFields />);
    fireEvent.click(screen.getByRole('radio', { name: 'Arrows' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ eFieldLook: 'arrows' });
    fireEvent.click(screen.getByRole('radio', { name: 'Relative' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ eFieldScale: 'relative' });
    fireEvent.change(screen.getByLabelText('How fast the e-field\'s streaks move'), { target: { value: '1.5' } });
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ eFieldFlowSpeed: 1.5 });
    fireEvent.click(screen.getByRole('checkbox', { name: 'US-Canada 1D' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ enabledDatasets: { intermag: true, usCanada: true, pipeline: false } });
    fireEvent.change(screen.getByLabelText('How often NOAA\'s e-field files and aurora forecast are fetched'), { target: { value: '0' } });
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ autoRefresh: false });
  });
});
