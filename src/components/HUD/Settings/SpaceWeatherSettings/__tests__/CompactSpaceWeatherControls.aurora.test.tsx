/**
 * The aurora's settings (space-weather-visualization.md, SW2, SW3): OVATION's band with the night
 * curtain, the band alone, or none.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const doubles = vi.hoisted(() => ({
  settings: {
    config: {
      spaceWeather: {
        preset: 'moderate', vectorIntensity: 50, vectorOpacity: 60, showElectricFields: true, showKpIndex: false, showSolarWind: false,
        enabledDatasets: {}, eFieldLook: 'streaks', eFieldScale: 'absolute', eFieldFlowSpeed: 1, eFieldFlowDensity: 1,
        autoRefresh: true, refreshInterval: 5, showAuroralOval: true, auroraCurtain: true,
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

// The aurora's own buttons: the field lines' group has an Off too.
const aurora = () => within(screen.getByRole('group', { name: 'The aurora drawn' }));
const pressed = () => ['Curtain', 'Band', 'Off'].filter((name) => aurora().getByRole('button', { name }).getAttribute('aria-pressed') === 'true');

describe('the aurora\'s settings', () => {
  beforeEach(() => {
    doubles.settings.updateSpaceWeather.mockClear();
    Object.assign(doubles.settings.config.spaceWeather, { showAuroralOval: true, auroraCurtain: true });
  });

  it('says which is drawn: the curtain, the band alone, or none', () => {
    const { rerender } = render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    expect(screen.getByRole('group', { name: 'The aurora drawn' })).toBeInTheDocument();
    expect(pressed()).toEqual(['Curtain']);
    doubles.settings.config.spaceWeather.auroraCurtain = false;
    rerender(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    expect(pressed()).toEqual(['Band']);
    doubles.settings.config.spaceWeather.showAuroralOval = false;
    rerender(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    expect(pressed()).toEqual(['Off']);
  });

  it('a curtain unless said otherwise, and a setting saved before there was one', () => {
    delete doubles.settings.config.spaceWeather.auroraCurtain;
    render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    expect(pressed()).toEqual(['Curtain']);
  });

  it('sets each by its button', () => {
    render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    fireEvent.click(aurora().getByRole('button', { name: 'Band' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showAuroralOval: true, auroraCurtain: false });
    fireEvent.click(aurora().getByRole('button', { name: 'Off' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showAuroralOval: false });
    fireEvent.click(aurora().getByRole('button', { name: 'Curtain' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showAuroralOval: true, auroraCurtain: true });
  });
});
