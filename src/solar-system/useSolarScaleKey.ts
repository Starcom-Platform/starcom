/**
 * The scale in force, written in the key (critique-2026-11-01, OR9: "the scale in force is written on screen and on
 * cards"): published while any of the solar system is drawn, withdrawn when none is. A card leaves it out of its key,
 * as its caveat line says it (shareCardProvenance.ts).
 */
import { useEffect } from 'react';
import { publishLegend } from '../services/globe/globeLegendStore';
import { SOLAR_SCALE_LEGEND_ID, scaleDistanceMeans, useSolarScale, useSolarSystemShown } from './solarScale';
import { useSkyLook } from './sky/skyLook';

/** A place as the key names it: 51.5°N 0.1°W. */
const placeWords = (lat: number, lng: number) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`;

export function useSolarScaleKey(): void {
  const shown = useSolarSystemShown();
  const scale = useSolarScale();
  const look = useSkyLook();
  useEffect(() => {
    publishLegend(SOLAR_SCALE_LEGEND_ID, shown
      ? {
        layerId: SOLAR_SCALE_LEGEND_ID,
        layer: scale === 'sky' && look ? `Sky from ${placeWords(look.lat, look.lng)}`
          : scale === 'true' ? 'Solar system, True 1:1' : scale === 'diagram' ? 'Solar system, Diagram (not to scale)' : 'Solar system, Compact',
        distanceMeans: scaleDistanceMeans(scale),
        swatches: [],
      }
      : null);
  }, [shown, scale, look?.lat, look?.lng]);
  useEffect(() => () => publishLegend(SOLAR_SCALE_LEGEND_ID, null), []);
}
