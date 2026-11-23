/**
 * Earth Weather's look on the rail (critique-2026-11-01, O14; plan B2): bound to the person's Eco Natural settings,
 * which the settings popup also sets. "None" is temperature switched off, as the settings have always said it.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRailBindings } from '../railBindings';
import useEcoNaturalSettings from '../../../../hooks/useEcoNaturalSettings';

describe("Earth Weather's look on the rail", () => {
  it('reads and sets the ground colour, the wind and the clouds in the Eco Natural settings', () => {
    const { result } = renderHook(() => ({ rail: useRailBindings('EarthWeather'), eco: useEcoNaturalSettings() }));
    act(() => result.current.rail['weather:colour'].set('rain'));
    expect(result.current.eco.config.earthWeather.colorMode).toBe('rain');
    expect(result.current.rail['weather:colour'].value).toBe('rain');

    act(() => result.current.rail['weather:colour'].set('none'));
    expect(result.current.eco.config.earthWeather.colorMode).toBe('temperature');
    expect(result.current.eco.config.earthWeather.weatherLayers.temperature).toBe(false);
    expect(result.current.rail['weather:colour'].value).toBe('none');

    act(() => result.current.rail['weather:colour'].set('temperature'));
    expect(result.current.eco.config.earthWeather.weatherLayers.temperature).toBe(true);
    expect(result.current.rail['weather:colour'].value).toBe('temperature');

    const wind = result.current.rail['weather:wind'].value;
    act(() => result.current.rail['weather:wind'].set(!wind));
    expect(result.current.eco.config.earthWeather.weatherLayers.windPatterns).toBe(!wind);
    act(() => result.current.rail['weather:clouds'].set(false));
    expect(result.current.rail['weather:clouds'].value).toBe(false);
  });
});
