/**
 * Which engine overlays the globe asks for (D-SW, step 3): Space Weather's boundaries only where
 * switched on, and the Kp model's aurora only while OVATION's cannot be read. All four were asked
 * for whenever the layer was on, and the Kp ring was drawn under OVATION's aurora, switched off.
 */
import { describe, expect, it } from 'vitest';
import { engineOverlaysFor, ENGINE_MANAGED_OVERLAYS, kpAuroraStandsIn, spaceWeatherBoundaryOn } from '../engineOverlays';

const none = { showMagnetopause: false, showSolarWind: false, showGeomagneticIndex: false };

describe('the Kp model\'s aurora', () => {
  it('stands in only while the aurora is on and OVATION\'s could not be read', () => {
    expect(kpAuroraStandsIn(true, { drawn: false, error: 'OVATION answered 503.' })).toBe(true);
    expect(kpAuroraStandsIn(true, { drawn: false, error: null })).toBe(false);
    expect(kpAuroraStandsIn(true, { drawn: true, error: null })).toBe(false);
    expect(kpAuroraStandsIn(false, { drawn: false, error: 'OVATION answered 503.' })).toBe(false);
  });
});

describe('Space Weather\'s boundaries', () => {
  it('each follows its own switch', () => {
    const on = spaceWeatherBoundaryOn({ showMagnetopause: true, showSolarWind: false, showGeomagneticIndex: true }, false);
    expect(on('spaceWeatherMagnetopause')).toBe(true);
    expect(on('spaceWeatherBowShock')).toBe(false);
    expect(on('spaceWeatherGeomagneticIndex')).toBe(true);
    expect(on('spaceWeatherAurora')).toBe(false);
    const wind = spaceWeatherBoundaryOn({ ...none, showSolarWind: true }, true);
    expect(wind('spaceWeatherBowShock')).toBe(true);
    expect(wind('spaceWeatherMagnetopause')).toBe(false);
    expect(wind('spaceWeatherGeomagneticIndex')).toBe(false);
    expect(wind('spaceWeatherAurora')).toBe(true);
    expect(wind('somethingElse')).toBe(false);
  });

  it('are asked of the engine only where switched on, with the layer', () => {
    const active = (layers: string[]) => (id: string) => layers.includes(id);
    expect(engineOverlaysFor(active(['SpaceWeather']), spaceWeatherBoundaryOn(none, false))).toEqual(['spaceWeather']);
    expect(engineOverlaysFor(active(['SpaceWeather']), spaceWeatherBoundaryOn({ ...none, showMagnetopause: true }, true)))
      .toEqual(['spaceWeather', 'spaceWeatherMagnetopause', 'spaceWeatherAurora']);
    expect(engineOverlaysFor(active(['EcologicalDisasters']), () => true)).toEqual(['naturalEvents']);
    expect(engineOverlaysFor(active([]), () => true)).toEqual([]);
  });

  it('are all managed by the layers, switched on or off', () => {
    expect([...ENGINE_MANAGED_OVERLAYS].sort()).toEqual([
      'naturalEvents', 'spaceWeather', 'spaceWeatherAurora', 'spaceWeatherBowShock', 'spaceWeatherGeomagneticIndex', 'spaceWeatherMagnetopause',
    ]);
  });
});
