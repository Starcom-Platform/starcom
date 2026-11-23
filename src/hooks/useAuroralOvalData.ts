// useAuroralOvalData.ts — real NOAA Kp-index data for the SpaceWeather HUD
// panel and telemetry (SpaceWeatherContext.tsx's `auroralOval` value, and
// telemetry.modes.auroralOval). Reuses fetchLiveKpSnapshot()
// (services/SpaceWeatherLive.ts) — the same call already driving the
// working aurora oval globe overlay in GlobeEngine.ts, and independently
// also used by useGeomagneticData.ts's own HUD reading. NOAAGeomagneticService
// caches getCurrentConditions() for 5 minutes, so two hooks calling this
// within that window share one real network fetch rather than doubling it.
// Replaces the previous hardcoded `{ resolution: 'low' }`, which had no
// relationship to anything real.
//
// Deliberately does NOT depend on useGeomagneticData's own state: aurora
// and geomagnetic index are independent toggles (showAuroralOval /
// showGeomagneticIndex) — a user can have one on without the other, so
// this hook needs its own Kp fetch rather than reading a sibling hook's
// result that might not even be active.
import { useEffect, useState } from 'react';
import { fetchLiveKpSnapshot } from '../services/SpaceWeatherLive';
import { classifyGeomagneticActivity, isKpStale, AURORA_BLACKOUT_KP_THRESHOLD, type GeomagneticActivity } from '../services/SpaceWeatherModeling';

// Mirrors useGeomagneticData.ts's identical quality model — see that
// file's comment for why 'stale' has to be a real, computed tier here and
// not just 'live' | 'fallback'.
export type AuroralOvalDataQuality = 'live' | 'fallback' | 'stale';

export interface AuroralOvalData {
  kp?: number;
  activity?: GeomagneticActivity;
  // Whether the current Kp meets or exceeds the same threshold
  // buildAuroralPayload (SpaceWeatherModeling.ts) uses to widen the
  // blackout band on the 3D oval — the same real signal the globe is
  // already showing, surfaced as a plain yes/no in the HUD.
  blackoutRisk?: boolean;
  quality?: AuroralOvalDataQuality;
  // Practically unreachable today (fetchLiveKpSnapshot has its own
  // internal try/catch and always resolves) but defended explicitly —
  // see useGeomagneticData.ts's identical field for the full rationale.
  error?: string;
}

export const useAuroralOvalData = (active: boolean) => {
  const [data, setData] = useState<AuroralOvalData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!active) {
      setData(null);
      return;
    }
    let cancelled = false;

    fetchLiveKpSnapshot()
      .then(({ snapshot, quality }) => {
        if (cancelled) return;
        const effectiveQuality: AuroralOvalDataQuality = isKpStale(snapshot.timestamp) ? 'stale' : quality;
        setData({
          kp: snapshot.kp,
          activity: classifyGeomagneticActivity(snapshot.kp),
          blackoutRisk: snapshot.kp >= AURORA_BLACKOUT_KP_THRESHOLD,
          quality: effectiveQuality
        });
        setLastUpdated(new Date(snapshot.timestamp));
      })
      .catch(() => {
        if (cancelled) return;
        setData({ error: 'Unable to load aurora oval data' });
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return { data, lastUpdated };
};

export default useAuroralOvalData;
