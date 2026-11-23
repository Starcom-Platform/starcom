// useMagnetopauseData.ts — real magnetopause stand-off distance for the
// SpaceWeather HUD panel and telemetry (SpaceWeatherContext.tsx's
// `magnetopause` value, and telemetry.modes.magnetopause). Reuses
// fetchLiveSolarWindSnapshot() plus buildMagnetopausePayload() — the exact
// same solar-wind-pressure-to-stand-off derivation already driving the
// working magnetopause 3D shell in GlobeEngine.ts — so the HUD's number can
// never drift from what the globe is actually showing. Replaces the
// previous hardcoded `{ standoffRe: 10.5 }`, which had no relationship to
// any input.
//
// Deliberately does NOT depend on useSolarWindData's own state: solar wind
// and magnetopause are independent toggles (showSolarWind /
// showMagnetopause) — a user can have one on without the other, so this
// hook needs its own fetch rather than reading a sibling hook's result
// that might not even be active.
import { useEffect, useState } from 'react';
import { fetchLiveSolarWindSnapshot } from '../services/SpaceWeatherLive';
import { buildMagnetopausePayload, isSolarWindStale } from '../services/SpaceWeatherModeling';

// Mirrors useSolarWindData.ts's identical quality model.
export type MagnetopauseDataQuality = 'live' | 'fallback' | 'stale';

export interface MagnetopauseData {
  standoffRe?: number;
  quality?: MagnetopauseDataQuality;
  // buildMagnetopausePayload already computes whether the raw physics
  // result had to be clamped to the model's sane [5, 25] Re range — a
  // real, already-computed "extreme value" signal that was previously
  // discarded before reaching the HUD. Surfaced here rather than
  // recomputed.
  clamped?: boolean;
  // Practically unreachable today (fetchLiveSolarWindSnapshot has its own
  // internal try/catch and always resolves) but defended explicitly — see
  // useGeomagneticData.ts's identical field for the full rationale.
  error?: string;
}

export const useMagnetopauseData = (active: boolean) => {
  const [data, setData] = useState<MagnetopauseData | null>(null);
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
        const effectiveQuality: MagnetopauseDataQuality = isSolarWindStale(snapshot.timestamp) ? 'stale' : quality;
        const payload = buildMagnetopausePayload(snapshot, quality);
        setData({
          standoffRe: payload.standoffRe,
          clamped: payload.clamped,
          quality: effectiveQuality
        });
        setLastUpdated(new Date(snapshot.timestamp));
      })
      .catch(() => {
        if (cancelled) return;
        setData({ error: 'Unable to load magnetopause data' });
      });

    return () => {
      cancelled = true;
    };
  }, [active]);

  return { data, lastUpdated };
};

export default useMagnetopauseData;
