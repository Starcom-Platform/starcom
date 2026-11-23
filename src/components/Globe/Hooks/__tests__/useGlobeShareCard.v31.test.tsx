/**
 * Earth Weather's look through the share handle (WX9; contract v31): an agent
 * sets the ground's colour, the wind and the clouds for its own page, never
 * saved, a part it does not name staying as it was, and reads which part came
 * from where.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../../../hooks/useCyberCommandSettings', () => ({
  useCyberCommandSettings: () => ({ config: { markerStyles: {} }, updateMarkerStyle: vi.fn() }),
}));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({
    visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
    setVisualizationMode: vi.fn(),
  }),
}));
vi.mock('../useGlobeLayerControl', () => ({
  useGlobeLayerControl: () => ({ layers: [], pinLayer: vi.fn(), unpinLayer: vi.fn(), clearPins: vi.fn() }),
}));

import { useGlobeShareCard, SHARE_HANDLE, type ShareWeather } from '../useGlobeShareCard';
import { getWeatherLookOverride, setWeatherLookOverride, type WeatherLook } from '../../../../services/weather/weatherLook';

const globeRef = {
  current: {
    renderer: () => ({ domElement: { isConnected: true, clientWidth: 1280, clientHeight: 608 } }),
    scene: () => ({}),
    camera: () => ({}),
    getGlobeRadius: () => 100,
    pointOfView: () => ({ lat: 0, lng: 0, altitude: 2.5 }),
    controls: () => undefined,
  },
};

type Handle = {
  setWeather: (look: unknown) => ShareWeather;
  getWeather: () => ShareWeather;
};
const handle = () => (window as unknown as Record<string, Handle>)[SHARE_HANDLE];

const PERSON: WeatherLook = { colour: 'temperature', wind: true, clouds: false };
const mount = (weatherSetting?: WeatherLook) => renderHook(
  ({ setting }) => useGlobeShareCard({ globeRef: globeRef as never, feeds: [], marks: null, weatherSetting: setting }),
  { initialProps: { setting: weatherSetting } },
);

afterEach(() => {
  setWeatherLookOverride(undefined);
  delete (window as unknown as Record<string, unknown>)[SHARE_HANDLE];
  vi.restoreAllMocks();
});

describe('getWeather', () => {
  it('reads the person\'s look until the handle sets a part', () => {
    mount(PERSON);
    expect(handle().getWeather()).toEqual({ ...PERSON, from: { colour: 'setting', wind: 'setting', clouds: 'setting' } });
  });

  it('follows the person\'s settings as they change, for each part the handle has not set', () => {
    const { rerender } = mount(PERSON);
    handle().setWeather({ colour: 'rain' });
    rerender({ setting: { colour: 'airQuality', wind: false, clouds: true } });
    expect(handle().getWeather()).toEqual({ colour: 'rain', wind: false, clouds: true, from: { colour: 'handle', wind: 'setting', clouds: 'setting' } });
  });

  it('without the person\'s look, reads where people start', () => {
    mount();
    expect(handle().getWeather()).toMatchObject({ colour: 'temperature', wind: true, clouds: true });
  });
});

describe('setWeather', () => {
  it('sets the parts it names for this page, and returns the look in force', () => {
    mount(PERSON);
    expect(handle().setWeather({ colour: 'rain', clouds: true })).toEqual({
      colour: 'rain', wind: true, clouds: true, from: { colour: 'handle', wind: 'setting', clouds: 'handle' },
    });
    expect(getWeatherLookOverride()).toEqual({ colour: 'rain', clouds: true });
  });

  it('keeps what it set before when a later call names other parts', () => {
    mount(PERSON);
    handle().setWeather({ colour: 'none' });
    expect(handle().setWeather({ wind: false })).toEqual({
      colour: 'none', wind: false, clouds: false, from: { colour: 'handle', wind: 'handle', clouds: 'setting' },
    });
  });

  it('returns every part to the person\'s with null', () => {
    mount(PERSON);
    handle().setWeather({ colour: 'rain', wind: false });
    expect(handle().setWeather(null)).toEqual({ ...PERSON, from: { colour: 'setting', wind: 'setting', clouds: 'setting' } });
    expect(getWeatherLookOverride()).toBeUndefined();
  });

  it('refuses a look it cannot draw by saying what a look is, and changes nothing', () => {
    mount(PERSON);
    handle().setWeather({ wind: false });
    for (const bad of [{ colour: 'snow' }, { fog: true }, {}, 'rain', undefined]) {
      expect(() => handle().setWeather(bad), JSON.stringify(bad)).toThrow(/A weather look is any of \{ colour: 'temperature' \| 'rain' \| 'airQuality' \| 'none'/);
    }
    expect(getWeatherLookOverride()).toEqual({ wind: false });
  });

  it('never saves: nothing is written to the browser\'s storage', () => {
    mount(PERSON);
    const saved = vi.spyOn(Storage.prototype, 'setItem');
    handle().setWeather({ colour: 'airQuality', wind: false, clouds: true });
    handle().setWeather(null);
    expect(saved).not.toHaveBeenCalled();
  });
});
