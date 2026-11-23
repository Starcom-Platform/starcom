/**
 * Share handle v31, as published: Earth Weather's look (decision D-W, WX9).
 * `setWeather({ colour, wind, clouds })` sets any of the three for this page
 * only, never saved, null returning to the person's; `getWeather()` says the
 * look in force and who set each part; `weatherColours` lists the colours.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { SHARE_HANDLE_CONTRACT, SHARE_HANDLE_VERSION } from '../shareHandleContract';
import { WEATHER_COLOURS } from '../../../../services/weather/weatherLook';

describe('contract v31', () => {
  it('is at version 31', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(31);
  });

  it('sets and reads Earth Weather\'s look for a page', () => {
    expect(SHARE_HANDLE_CONTRACT.methods.setWeather).toEqual({ args: 1, options: ['colour', 'wind', 'clouds'] });
    expect(SHARE_HANDLE_CONTRACT.methods.getWeather).toEqual({ args: 0, options: [] });
    expect(SHARE_HANDLE_CONTRACT.returns.setWeather).toEqual(['colour', 'wind', 'clouds', 'from']);
    expect(SHARE_HANDLE_CONTRACT.returns.getWeather).toEqual(['colour', 'wind', 'clouds', 'from']);
  });

  it('publishes the colours the ground can take', () => {
    expect(SHARE_HANDLE_CONTRACT.weatherColours).toEqual([...WEATHER_COLOURS]);
    expect(SHARE_HANDLE_CONTRACT.weatherColours).toEqual(['temperature', 'rain', 'airQuality', 'none']);
  });
});
