// useSolarWindData.ts — real NOAA RTSW solar wind data for the SpaceWeather
// HUD panel and telemetry (SpaceWeatherContext.tsx's `solarWind` value, and
// telemetry.modes.solarWind). Reuses fetchLiveSolarWindSnapshot()
// (services/SpaceWeatherLive.ts) — the same call already driving the
// working magnetopause/bow-shock 3D overlays in GlobeEngine.ts. Replaces
// the previous hardcoded `{ speed: 420, density: 6, bz: -2 }`, which never
// changed regardless of real conditions.
//
// Deliberately does NOT depend on useMagnetopauseData's own state: solar
// wind and magnetopause are independent toggles (showSolarWind /
// showMagnetopause) — a user can have one on without the other, so this
// hook needs its own fetch rather than reading a sibling hook's result
// that might not even be active.
import { useEffect, useState } from 'react';
import { fetchLiveSolarWindSnapshot } from '../services/SpaceWeatherLive';
import { isSolarWindStale } from '../services/SpaceWeatherModeling';

// Mirrors useGeomagneticData.ts/useAuroralOvalData.ts's identical quality
// model — see those files' comments for why 'stale' has to be a real,
// computed tier here and not just 'live' | 'fallback'.
export type SolarWindDataQuality = 'live' | 'fallback' | 'stale';

export interface SolarWindData {
  speed?: number;
  density?: number;
  bz?: number;
  quality?: SolarWindDataQuality;
  // Practically unreachable today (fetchLiveSolarWindSnapshot has its own
  // internal try/catch and always resolves) but defended explicitly — see
  // useGeomagneticData.ts's identical field for the full rationale.
  error?: string;
}

export const useSolarWindData = (active: boolean) => {
  const [data, setData] = useState<SolarWindData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!active) {
      setData(null);
      return;
    }
    let cancelled = false;

    fetchLiveSolarWindSnapshot()
      .then(({ snapshot, quality }) => {
        if (cancelled) return;
        const effectiveQuality: SolarWindDataQuality = isSolarWindStale(snapshot.timestamp) ? 'stale' : quality;
        setData({
          speed: snapshot.speedKmPerSec,
          density: snapshot.densityPerCm3,
          bz: snapshot.bz,
          quality: effectiveQuality
        });
        setLastUpdated(new Date(snapshot.timestamp));
      })
      .catch(() => {
        if (cancelled) return;
        setData({ error: 'Unable to load solar wind data' });
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return { data, lastUpdated };
};

export default useSolarWindData;
