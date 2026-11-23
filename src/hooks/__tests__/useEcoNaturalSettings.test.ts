import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, beforeEach, expect, vi } from 'vitest';
import useEcoNaturalSettings from '../useEcoNaturalSettings';

const STORAGE_KEY = 'starcom-eco-natural-settings';

describe('useEcoNaturalSettings migrations', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('migrates earthquakes and volcanoes defaults to ON for legacy storage', async () => {
    const legacyPayload = {
      version: 1,
      data: {
        ecologicalDisasters: {
          disasterTypes: {
            earthquakes: false,
            volcanoes: false,
            wildfires: false
          }
        }
      }
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyPayload));

    const { result } = renderHook(() => useEcoNaturalSettings());

    await waitFor(() => {
      expect(result.current.config.ecologicalDisasters.disasterTypes.earthquakes).toBe(true);
      expect(result.current.config.ecologicalDisasters.disasterTypes.volcanoes).toBe(true);
    });

    // Ensure unrelated hazard values persist through migration
    expect(result.current.config.ecologicalDisasters.disasterTypes.wildfires).toBe(false);
  });
});

describe('useEcoNaturalSettings validation and persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clamps ecological disaster numeric fields on load', async () => {
    const legacyPayload = {
      version: 2,
      data: {
        ecologicalDisasters: {
          timeRange: 0,
          radiusOpacity: 150,
          severity: { showMinor: 'yes' },
          disasterTypes: { floods: 'truthy' }
        }
      }
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyPayload));

    const { result } = renderHook(() => useEcoNaturalSettings());

    await waitFor(() => expect(result.current.config.ecologicalDisasters.timeRange).toBe(1));
    expect(result.current.config.ecologicalDisasters.radiusOpacity).toBe(100);
    expect(result.current.config.ecologicalDisasters.severity.showMinor).toBe(true);
    expect(result.current.config.ecologicalDisasters.disasterTypes.floods).toBe(true);
  });

  it('persists sanitized values when updating ecological disasters', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useEcoNaturalSettings());

    act(() => {
      result.current.updateEcologicalDisasters({ timeRange: 0, radiusOpacity: 150 });
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });
    vi.useRealTimers();

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBeTruthy();
    const parsed = stored ? JSON.parse(stored) : { data: {} };
    expect(parsed.data.ecologicalDisasters.timeRange).toBe(1);
    expect(parsed.data.ecologicalDisasters.radiusOpacity).toBe(100);
  });

  it('restores persisted ecological settings on re-init (reload)', async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useEcoNaturalSettings());

    act(() => {
      result.current.updateEcologicalDisasters({ timeRange: 3, radiusOpacity: 55, disasterTypes: { hurricanes: false } });
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });

    unmount();
    vi.useRealTimers();

    const { result: rehydrated } = renderHook(() => useEcoNaturalSettings());

    await waitFor(() => expect(rehydrated.current.config.ecologicalDisasters.timeRange).toBe(3));
    expect(rehydrated.current.config.ecologicalDisasters.radiusOpacity).toBe(55);
    expect(rehydrated.current.config.ecologicalDisasters.disasterTypes.hurricanes).toBe(false);
  });
});

describe('Earth Weather\'s ground colour (decision D-W, WX8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps rain as a saved choice across a reload', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, data: { earthWeather: { colorMode: 'rain' } } }));
    const { result } = renderHook(() => useEcoNaturalSettings());
    await waitFor(() => expect(result.current.config.earthWeather.colorMode).toBe('rain'));
  });

  it('falls back to temperature for a colour it does not know', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, data: { earthWeather: { colorMode: 'snowfall' } } }));
    const { result } = renderHook(() => useEcoNaturalSettings());
    await waitFor(() => expect(result.current.config.earthWeather.colorMode).toBe('temperature'));
  });

  it('draws wind by default, now that wind is streaks', () => {
    const { result } = renderHook(() => useEcoNaturalSettings());
    expect(result.current.config.earthWeather.weatherLayers.windPatterns).toBe(true);
  });
});

describe('the aurora\'s settings (decision D-SW)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('draws the aurora, with its night curtain, by default, as the owner chose (SW3, SW15)', () => {
    const { result } = renderHook(() => useEcoNaturalSettings());
    expect(result.current.config.spaceWeather.showAuroralOval).toBe(true);
    expect(result.current.config.spaceWeather.auroraCurtain).toBe(true);
  });

  it('turns the aurora on, once, for settings saved before it was OVATION\'s, keeping the rest (SW15)', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, data: { spaceWeather: { showAuroralOval: false, showMagnetopause: true, eFieldLook: 'arrows' } } }));
    const { result } = renderHook(() => useEcoNaturalSettings());
    await waitFor(() => expect(result.current.config.spaceWeather.showAuroralOval).toBe(true));
    expect(result.current.config.spaceWeather.showMagnetopause).toBe(true);
    expect(result.current.config.spaceWeather.eFieldLook).toBe('arrows');
  });

  it('keeps the aurora off for someone who turned it off since', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, data: { spaceWeather: { showAuroralOval: false } } }));
    const { result } = renderHook(() => useEcoNaturalSettings());
    expect(result.current.config.spaceWeather.showAuroralOval).toBe(false);
  });
});

/*
 * One set of settings for every part of the page that reads them (space-weather-visualization.md,
 * SW2). Each caller held its own copy, so a change in a settings panel reached the globe only
 * after a reload: the panel's copy was saved, and the globe's copy never heard of it.
 */
describe('one settings for the whole page', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows a change made by one reader to every other, at once', async () => {
    const panel = renderHook(() => useEcoNaturalSettings());
    const globe = renderHook(() => useEcoNaturalSettings());
    act(() => { panel.result.current.updateSpaceWeather({ eFieldScale: 'relative', showAuroralOval: true }); });
    expect(globe.result.current.config.spaceWeather.eFieldScale).toBe('relative');
    expect(globe.result.current.config.spaceWeather.showAuroralOval).toBe(true);
    act(() => { globe.result.current.updateEarthWeather({ colorMode: 'rain' }); });
    expect(panel.result.current.config.earthWeather.colorMode).toBe('rain');
    panel.unmount();
    globe.unmount();
  });

  it('keeps the change once every reader has gone, as a reload finds it', async () => {
    const first = renderHook(() => useEcoNaturalSettings());
    act(() => { first.result.current.updateSpaceWeather({ eFieldLook: 'streaks', eFieldFlowSpeed: 1.5 }); });
    first.unmount();
    const again = renderHook(() => useEcoNaturalSettings());
    expect(again.result.current.config.spaceWeather.eFieldFlowSpeed).toBe(1.5);
    again.unmount();
  });
});
