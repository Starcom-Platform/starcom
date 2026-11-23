/**
 * Which of the globe engine's overlays the globe asks for: Space Weather's, and the natural events'.
 *
 * One definition for the engine's starting set and for the sync that follows, so the two cannot
 * disagree about which overlays a layer implies. Space Weather's boundaries are asked for only where
 * switched on (D-SW, step 3): all four were asked for whenever the layer was on, and a second effect
 * took the disabled ones off again, so whichever ran last decided what was drawn.
 */
import type { GlobeLayerId } from './Hooks/useGlobeLayerControl';

/** Space Weather's boundaries, each drawn only while switched on. */
export const SPACE_WEATHER_BOUNDARIES = [
  'spaceWeatherMagnetopause', 'spaceWeatherBowShock', 'spaceWeatherAurora', 'spaceWeatherGeomagneticIndex',
] as const;

/** Every engine overlay whose presence is decided by which layers are active. */
export const ENGINE_MANAGED_OVERLAYS: readonly string[] = ['spaceWeather', ...SPACE_WEATHER_BOUNDARIES, 'naturalEvents'];

/** The Kp model's near-circle stands in for the aurora only while it is on and OVATION's could not be read (SW3). */
export function kpAuroraStandsIn(auroraOn: boolean, ovation: { drawn: boolean; error: string | null }): boolean {
  return auroraOn && !ovation.drawn && ovation.error !== null;
}

/** Whether each of Space Weather's boundaries is switched on; the bow shock follows the solar wind's switch. */
export function spaceWeatherBoundaryOn(
  settings: { showMagnetopause?: boolean; showSolarWind?: boolean; showGeomagneticIndex?: boolean },
  kpAurora: boolean,
): (overlay: string) => boolean {
  return (overlay) => (
    overlay === 'spaceWeatherMagnetopause' ? settings.showMagnetopause === true
      : overlay === 'spaceWeatherBowShock' ? settings.showSolarWind === true
        : overlay === 'spaceWeatherAurora' ? kpAurora
          : overlay === 'spaceWeatherGeomagneticIndex' ? settings.showGeomagneticIndex === true
            : false
  );
}

/** The engine overlays the active layers call for, Space Weather's boundaries where switched on. */
export function engineOverlaysFor(isActive: (layer: GlobeLayerId) => boolean, boundaryOn: (overlay: string) => boolean): string[] {
  const overlays: string[] = [];
  if (isActive('SpaceWeather')) overlays.push('spaceWeather', ...SPACE_WEATHER_BOUNDARIES.filter(boundaryOn));
  if (isActive('EcologicalDisasters')) overlays.push('naturalEvents');
  return overlays;
}
