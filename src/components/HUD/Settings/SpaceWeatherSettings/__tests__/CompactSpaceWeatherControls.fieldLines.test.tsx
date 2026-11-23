/**
 * The field lines' settings (space-weather-visualization.md, SW2, SW4): many, few, or none, in the
 * Space Weather panel and the sub-rail's magnetosphere popup alike.
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
        enabledDatasets: {}, autoRefresh: true, refreshInterval: 5, showAuroralOval: true, showMagnetopause: false,
        showFieldLines: true, fieldLineDensity: 'many',
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
import SpaceWeatherSettingsMagnetopause from '../../../../SpaceWeather/settings/SpaceWeatherSettingsMagnetopause';
import SpaceWeatherSettingsSolarWind from '../../../../SpaceWeather/settings/SpaceWeatherSettingsSolarWind';

describe('the field lines\' settings', () => {
  beforeEach(() => {
    doubles.settings.updateSpaceWeather.mockClear();
    Object.assign(doubles.settings.config.spaceWeather, { showFieldLines: true, fieldLineDensity: 'many' });
  });

  it('in the panel, say which is drawn and set each', () => {
    render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    const group = screen.getByRole('group', { name: 'The field lines drawn' });
    const pressed = () => ['Many', 'Few', 'Off'].filter((name) => group.querySelector(`[aria-pressed="true"]`)?.textContent === name);
    expect(pressed()).toEqual(['Many']);
    fireEvent.click(screen.getByRole('button', { name: 'Few' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showFieldLines: true, fieldLineDensity: 'few' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Off' }).find((b) => group.contains(b))!);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showFieldLines: false });
  });

  it('in the panel and the popup, turn the Van Allen belts off and on, on unless said otherwise', () => {
    delete doubles.settings.config.spaceWeather.showVanAllen;
    const { unmount } = render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    const belts = screen.getByRole('button', { name: 'Belts' });
    expect(belts).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(belts);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showVanAllen: false });
    unmount();
    doubles.settings.config.spaceWeather.showVanAllen = false;
    render(<SpaceWeatherSettingsMagnetopause />);
    const box = screen.getByRole('checkbox', { name: 'Van Allen belts' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showVanAllen: true });
  });

  it('in the panel and the popup, turn the cusps off and on, on unless said otherwise', () => {
    delete doubles.settings.config.spaceWeather.showCusps;
    const { unmount } = render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    const cusps = screen.getByRole('button', { name: 'Cusps' });
    expect(cusps).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(cusps);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showCusps: false });
    unmount();
    doubles.settings.config.spaceWeather.showCusps = false;
    render(<SpaceWeatherSettingsMagnetopause />);
    const box = screen.getByRole('checkbox', { name: 'Cusps' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showCusps: true });
  });

  it('in the panel and the popup, turn the tail\'s current sheet off and on, on unless said otherwise', () => {
    delete doubles.settings.config.spaceWeather.showTailSheet;
    const { unmount } = render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    const sheet = screen.getByRole('button', { name: 'Tail sheet' });
    expect(sheet).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(sheet);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showTailSheet: false });
    unmount();
    doubles.settings.config.spaceWeather.showTailSheet = false;
    render(<SpaceWeatherSettingsMagnetopause />);
    const box = screen.getByRole('checkbox', { name: 'Tail current sheet' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showTailSheet: true });
  });

  it('in the panel and the solar wind popup, turn the stream from the Sun off and on, on unless said otherwise', () => {
    delete doubles.settings.config.spaceWeather.showHeliosphere;
    const { unmount } = render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    const stream = screen.getByRole('button', { name: 'Sun–Earth' });
    expect(stream).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(stream);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showHeliosphere: false });
    unmount();
    doubles.settings.config.spaceWeather.showHeliosphere = false;
    render(<SpaceWeatherSettingsSolarWind />);
    const box = screen.getByRole('checkbox', { name: 'Sun to Earth (a hindcast)' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showHeliosphere: true });
    expect(screen.getByRole('checkbox', { name: 'Near the Earth (now)' })).toBeChecked();
    // The bow shock, named for what it is, and nothing promised for later.
    expect(screen.getByRole('checkbox', { name: 'Bow shock' })).toBeInTheDocument();
    expect(screen.queryByText(/not yet implemented|will appear here/)).toBeNull();
  });

  it('in the panel, turn the wind near the Earth off and on, on unless said otherwise', () => {
    delete doubles.settings.config.spaceWeather.showNearEarthFlow;
    render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    const near = screen.getByRole('button', { name: 'Near Earth' });
    expect(near).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(near);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showNearEarthFlow: false });
  });

  it('in the panel and the solar wind popup, turn ENLIL off and on, on unless said otherwise, and choose density or speed', () => {
    delete doubles.settings.config.spaceWeather.showEnlil;
    delete doubles.settings.config.spaceWeather.enlilQuantity;
    const { unmount } = render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    const enlil = screen.getByRole('button', { name: 'ENLIL' });
    expect(enlil).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Density' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Speed' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ enlilQuantity: 'velocity' });
    fireEvent.click(enlil);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showEnlil: false });
    unmount();
    Object.assign(doubles.settings.config.spaceWeather, { showEnlil: false, enlilQuantity: 'density' });
    render(<SpaceWeatherSettingsSolarWind />);
    const box = screen.getByRole('checkbox', { name: 'ENLIL model (days ago to days ahead)' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showEnlil: true });
    expect(screen.getByRole('radio', { name: 'Density' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Speed' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ enlilQuantity: 'velocity' });
  });

  it('in the panel and the solar wind popup, turn the CMEs off and on, on unless said otherwise', () => {
    delete doubles.settings.config.spaceWeather.showCmes;
    const { unmount } = render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);
    const button = screen.getByRole('button', { name: 'CMEs' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showCmes: false });
    unmount();
    doubles.settings.config.spaceWeather.showCmes = false;
    render(<SpaceWeatherSettingsSolarWind />);
    const box = screen.getByRole('checkbox', { name: 'CMEs (NASA DONKI)' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showCmes: true });
  });

  it('in the magnetosphere popup, the same, and nothing promised for later', () => {
    doubles.settings.config.spaceWeather.fieldLineDensity = 'few';
    render(<SpaceWeatherSettingsMagnetopause />);
    expect(screen.getByRole('radio', { name: 'Few' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Many' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showFieldLines: true, fieldLineDensity: 'many' });
    expect(screen.queryByText(/Future/)).toBeNull();
    expect(screen.getByText(/T96/)).toBeInTheDocument();
  });
});
