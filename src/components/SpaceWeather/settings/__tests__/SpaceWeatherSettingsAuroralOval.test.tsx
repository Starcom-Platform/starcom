/**
 * The aurora's popup from the sub-rail (space-weather-visualization.md, SW3): the same three choices
 * as the Space Weather panel, OVATION's band with its curtain, the band alone, or none.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const doubles = vi.hoisted(() => ({
  settings: { config: { spaceWeather: { showAuroralOval: true, auroraCurtain: false } as Record<string, unknown> }, updateSpaceWeather: vi.fn() },
}));
vi.mock('../../../../hooks/useEcoNaturalSettings', () => ({ useEcoNaturalSettings: () => doubles.settings }));

import SpaceWeatherSettingsAuroralOval from '../SpaceWeatherSettingsAuroralOval';

describe('the aurora\'s popup', () => {
  beforeEach(() => { doubles.settings.updateSpaceWeather.mockClear(); });

  it('offers the panel\'s three choices, saying which is drawn, and promises nothing more', () => {
    render(<SpaceWeatherSettingsAuroralOval />);
    expect(screen.getByRole('radio', { name: 'Band' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Curtain' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Off' })).not.toBeChecked();
    expect(screen.queryByText(/will appear here/)).toBeNull();
    expect(screen.getByText(/OVATION/)).toBeInTheDocument();
  });

  it('sets each as the panel does', () => {
    render(<SpaceWeatherSettingsAuroralOval />);
    fireEvent.click(screen.getByRole('radio', { name: 'Curtain' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showAuroralOval: true, auroraCurtain: true });
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(doubles.settings.updateSpaceWeather).toHaveBeenLastCalledWith({ showAuroralOval: false });
  });
});
