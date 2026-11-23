// useGeomagneticData.ts — real NOAA Kp-index data for the SpaceWeather HUD
// panel and telemetry (SpaceWeatherContext.tsx's `geomagnetic` value, and
// telemetry.modes.geomagnetic). Reuses fetchLiveKpSnapshot()
// (services/SpaceWeatherLive.ts) — the same call already driving the
// geomagnetic-index globe overlay in GlobeEngine.ts — so the HUD's Kp
// reading stays consistent with what the 3D shell is actually showing,
// instead of one being real and the other a hardcoded `{ kp: 3 }`.
//
// Also fetches the 3-day forecast and disruption-risk assessment — both
// were already fully implemented on NOAAGeomagneticService with zero
// callers anywhere in the app before this. All three fetches run in
// parallel; a failure in one doesn't block the others (Promise.allSettled,
// not Promise.all) — a forecast outage shouldn't also blank out the
// current Kp reading.
import { useEffect, useState } from 'react';
import { fetchLiveKpSnapshot, fetchGeomagneticForecast, fetchGeomagneticDisruptionRisk } from '../services/SpaceWeatherLive';
import { classifyGeomagneticActivity, isKpStale, type GeomagneticActivity } from '../services/SpaceWeatherModeling';

export type GeomagneticTrend = 'rising' | 'falling' | 'steady';
// Mirrors the 'live' | 'fallback' | 'stale' quality already used by
// GeomagneticIndexPayload/AuroraPayload etc. (SpaceWeatherModeling.ts,
// GlobeEngine.ts) — this hook used to only know about 'live' | 'fallback',
// with no staleness concept at all, so a Kp reading that was successfully
// fetched but hours old would show as confidently "live" in the HUD panel
// while the 3D shell (which did have staleness handling) correctly dimmed
// itself. Same three-tier model now, computed the same way, in both places.
export type GeomagneticDataQuality = 'live' | 'fallback' | 'stale';

// Below this difference between current Kp and the nearest forecast day's
// predicted Kp, the trend reads as "steady" rather than a false-precision
// rising/falling call on noise-level movement.
const TREND_THRESHOLD_KP = 0.5;

export interface GeomagneticData {
  kp?: number;
  activity?: GeomagneticActivity;
  quality?: GeomagneticDataQuality;
  trend?: GeomagneticTrend;
  riskLevel?: 'low' | 'medium' | 'high';
  riskDescription?: string;
  // Set only on the (practically unreachable, since fetchLiveKpSnapshot
  // has its own internal try/catch and always resolves) path where the Kp
  // fetch's own promise rejects — defense in depth so a future change that
  // breaks that invariant fails loudly in the UI instead of leaving the
  // panel silently stuck showing nothing, or stale data with no signal
  // that it stopped updating.
  error?: string;
}

function computeTrend(currentKp: number, nearestForecastKp: number | undefined): GeomagneticTrend | undefined {
  if (nearestForecastKp === undefined) return undefined;
  const delta = nearestForecastKp - currentKp;
  if (Math.abs(delta) < TREND_THRESHOLD_KP) return 'steady';
  return delta > 0 ? 'rising' : 'falling';
}

export const useGeomagneticData = (active: boolean) => {
  const [data, setData] = useState<GeomagneticData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (!active) {
      setData(null);
      return;
    }
    let cancelled = false;

    Promise.allSettled([
      fetchLiveKpSnapshot(),
      fetchGeomagneticForecast(),
      fetchGeomagneticDisruptionRisk()
    ]).then(([kpResult, forecastResult, riskResult]) => {
      if (cancelled) return;

      if (kpResult.status !== 'fulfilled') {
        setData({ error: 'Unable to load geomagnetic data' });
        return;
      }

      const { snapshot, quality } = kpResult.value;
      const forecast = forecastResult.status === 'fulfilled' ? forecastResult.value.forecast : [];
      const risk = riskResult.status === 'fulfilled' ? riskResult.value.risk : null;
      const effectiveQuality: GeomagneticDataQuality = isKpStale(snapshot.timestamp) ? 'stale' : quality;

      setData({
        kp: snapshot.kp,
        activity: classifyGeomagneticActivity(snapshot.kp),
        quality: effectiveQuality,
        trend: computeTrend(snapshot.kp, forecast[0]?.predictedKp),
        riskLevel: risk?.level,
        riskDescription: risk?.description
      });
      setLastUpdated(new Date(snapshot.timestamp));
    });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return { data, lastUpdated };
};

export default useGeomagneticData;
