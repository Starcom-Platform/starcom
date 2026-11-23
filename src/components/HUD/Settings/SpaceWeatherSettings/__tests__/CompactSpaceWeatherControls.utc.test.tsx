/**
 * The compact space weather controls say when the data was last updated in UTC,
 * with the date and the local time on hover (decision D-E, settled 2026-09-14 for
 * step 9). They gave the browser's local time of day.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { localTimeTitle } from '../../../../../utils/utcTime';

const doubles = vi.hoisted(() => ({
  settings: {
    config: {
      spaceWeather: {
        preset: 'moderate', vectorIntensity: 50, vectorOpacity: 60, showElectricFields: true, showKpIndex: false,
        showSolarWind: false, enabledDatasets: {}, gridBinSize: 2, legacyCap: 1000, magnitudeFloor: 0, samplingMode: 'grid',
      },
    },
    updateSpaceWeather: () => {},
  },
  weather: { visualizationVectors: [], isLoading: false, error: null, lastUpdated: null as Date | null, telemetry: null },
}));
vi.mock('../../../../../hooks/useEcoNaturalSettings', () => ({ useEcoNaturalSettings: () => doubles.settings }));
vi.mock('../../../../../context/SpaceWeatherContext', () => ({ useSpaceWeatherContext: () => doubles.weather }));
vi.mock('../SpaceWeatherPresets', () => ({ default: () => null }));
vi.mock('../SpaceWeatherIntensity', () => ({ default: () => null }));
vi.mock('../NOAADataToggle', () => ({ default: () => null }));
vi.mock('../AdvancedNOAATabbed', () => ({ default: () => null }));

import CompactSpaceWeatherControls from '../CompactSpaceWeatherControls';

describe('CompactSpaceWeatherControls: when the data was last updated', () => {
  it('gives it in UTC, with the date and the local time on hover', () => {
    const updated = Date.UTC(2026, 8, 13, 19, 33);
    doubles.weather.lastUpdated = new Date(updated);

    render(<CompactSpaceWeatherControls subMode="SpaceWeather" />);

    expect(screen.getByText('13 Sep 19:33Z')).toHaveAttribute('title', localTimeTitle(updated));
  });
});
