/**
 * What Earth Weather draws, and an agent's say over it (decision D-W, WX9):
 * the ground's colour (temperature, rain, air quality, or none), wind and
 * clouds. The share handle sets them for its own page only, never saved, as
 * it sets the report look; a part it does not set stays the person's.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  WEATHER_COLOURS, readWeatherLook, weatherFromSettings, effectiveWeatherLook, weatherDrawn,
  setWeatherLookOverride, getWeatherLookOverride, subscribeWeatherLook,
} from '../weatherLook';

const SETTINGS = { colorMode: 'temperature' as const, weatherLayers: { temperature: true, windPatterns: true, clouds: false } };

describe('weatherFromSettings', () => {
  it('reads the person\'s settings as a look', () => {
    expect(weatherFromSettings(SETTINGS)).toEqual({ colour: 'temperature', wind: true, clouds: false });
    expect(weatherFromSettings({ ...SETTINGS, colorMode: 'rain' })).toEqual({ colour: 'rain', wind: true, clouds: false });
    expect(weatherFromSettings({ ...SETTINGS, colorMode: 'airQuality' }).colour).toBe('airQuality');
    // Temperature chosen as the colour but switched off: nothing colours the ground.
    expect(weatherFromSettings({ ...SETTINGS, weatherLayers: { ...SETTINGS.weatherLayers, temperature: false } }).colour).toBe('none');
  });
});

describe('weatherDrawn', () => {
  it('draws one thing on the ground for the colour, and the wind and clouds as the look says', () => {
    const all = { wind: true, clouds: true };
    expect(weatherDrawn({ colour: 'temperature', ...all }, true)).toEqual({ heatMap: true, rain: false, stations: false, wind: true, clouds: true });
    expect(weatherDrawn({ colour: 'rain', ...all }, true)).toEqual({ heatMap: false, rain: true, stations: false, wind: true, clouds: true });
    expect(weatherDrawn({ colour: 'airQuality', ...all }, true)).toEqual({ heatMap: false, rain: false, stations: true, wind: true, clouds: true });
    expect(weatherDrawn({ colour: 'none', wind: false, clouds: false }, true)).toEqual({ heatMap: false, rain: false, stations: false, wind: false, clouds: false });
    expect(weatherDrawn({ colour: 'none', wind: true, clouds: false }, true).wind).toBe(true);
    expect(weatherDrawn({ colour: 'none', wind: false, clouds: true }, true).clouds).toBe(true);
  });

  it('draws nothing while Earth Weather is not shown', () => {
    for (const colour of WEATHER_COLOURS) {
      expect(weatherDrawn({ colour, wind: true, clouds: true }, false)).toEqual({ heatMap: false, rain: false, stations: false, wind: false, clouds: false });
    }
  });
});

describe('readWeatherLook', () => {
  it('takes any of colour, wind and clouds, and only those', () => {
    expect(readWeatherLook({ colour: 'rain' })).toEqual({ colour: 'rain' });
    expect(readWeatherLook({ wind: false, clouds: true })).toEqual({ wind: false, clouds: true });
    expect(readWeatherLook({ colour: 'none', wind: true, clouds: true })).toEqual({ colour: 'none', wind: true, clouds: true });
    expect(WEATHER_COLOURS).toEqual(['temperature', 'rain', 'airQuality', 'none']);
  });

  it('refuses anything else by saying what a look is', () => {
    for (const bad of [null, [], {}, { colour: 'snow' }, { wind: 'yes' }, { clouds: 1 }, { colour: 'rain', fog: true }, 'rain']) {
      const read = readWeatherLook(bad);
      expect('refused' in read, JSON.stringify(bad)).toBe(true);
      expect((read as { refused: string }).refused).toMatch(/colour.*temperature.*rain.*airQuality.*none.*wind.*clouds/s);
    }
  });
});

describe('the page\'s look', () => {
  afterEach(() => setWeatherLookOverride(undefined));

  it('is the person\'s until the handle sets part of it, and says which part came from where', () => {
    const person = weatherFromSettings(SETTINGS);
    expect(effectiveWeatherLook(person)).toEqual({ colour: 'temperature', wind: true, clouds: false, from: { colour: 'setting', wind: 'setting', clouds: 'setting' } });
    setWeatherLookOverride({ colour: 'rain', clouds: true });
    expect(effectiveWeatherLook(person)).toEqual({ colour: 'rain', wind: true, clouds: true, from: { colour: 'handle', wind: 'setting', clouds: 'handle' } });
  });

  it('tells its listeners, and clears back to the person\'s', () => {
    let heard = 0;
    const stop = subscribeWeatherLook(() => { heard++; });
    setWeatherLookOverride({ wind: false });
    expect(getWeatherLookOverride()).toEqual({ wind: false });
    setWeatherLookOverride(undefined);
    expect(getWeatherLookOverride()).toBeUndefined();
    expect(heard).toBe(2);
    stop();
    setWeatherLookOverride({ wind: true });
    expect(heard).toBe(2);
  });

  it('keeps its own copy, so a caller changing its object later changes nothing', () => {
    const asked = { colour: 'rain' as const };
    setWeatherLookOverride(asked);
    (asked as { colour: string }).colour = 'none';
    expect(getWeatherLookOverride()).toEqual({ colour: 'rain' });
  });
});
