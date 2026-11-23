/**
 * useCameraDetailTier — camera altitude -> coarse detail tier, shared infrastructure
 * for any Globe layer that needs to thin out geometry/content when zoomed out (real
 * upcoming need: GDACS cyclone-track/cone-of-uncertainty polygon detail and the
 * ~1,200-point volcano catalog, neither of which is usable at global zoom without
 * this). Deliberately generic — no territory/hazard-type coupling — so it's reusable
 * across features the way GeometryFactory and groupFade.ts already are.
 *
 * Reuses globeCameraTelemetry (GlobeCameraTelemetry.ts), the real pub/sub Globe.tsx
 * already publishes camera lat/lng/altitude to on every frame during interaction
 * (rAF-coalesced there) — rather than adding a second rAF polling loop against
 * camera.position.length() the way useNationalTerritories3D.ts's own LOD watcher
 * does. altitude here is react-globe.gl's own unit: globe radii above the surface
 * (see Globe.tsx's MIN_ALTITUDE=0.5 and DEFAULT_POV altitude=2.5).
 */
import { useEffect, useRef, useState } from 'react';
import { globeCameraTelemetry } from '../../../services/globe/GlobeCameraTelemetry';

export type DetailTier = 0 | 1 | 2;

export interface DetailTierThresholds {
  /** Below this altitude: tier 2 (full detail). */
  highMax: number;
  /** Below this altitude (and at/above highMax): tier 1 (reduced). At/above: tier 0 (minimal). */
  mediumMax: number;
}

// Centered on Globe.tsx's own DEFAULT_POV altitude (2.5) sitting inside the medium
// band, not the highest-detail one — a freshly-loaded view shouldn't default to
// maximum geometry load.
export const DEFAULT_DETAIL_TIER_THRESHOLDS: DetailTierThresholds = { highMax: 1.5, mediumMax: 5 };

// Used only before the first real telemetry publish (e.g. hook mounts before Globe.tsx's
// camera has emitted anything yet) — matches Globe.tsx's own DEFAULT_POV altitude.
const FALLBACK_ALTITUDE = 2.5;

// Relative, not absolute (unlike useNationalTerritories3D's fixed-unit hysteresis
// margin) — this hook's thresholds are in altitude-radii, a much smaller absolute
// range (0.5-499) than that hook's scene-unit distances, so a fixed margin would
// either be meaningless at the low end or useless at the high end.
const HYSTERESIS_FRACTION = 0.15;

/**
 * Pure tier decision, exported for direct unit testing. `current` (the tier picked
 * last time) is used to apply hysteresis around each boundary so a camera hovering
 * exactly on a threshold doesn't flap between tiers every publish.
 */
export function pickDetailTier(
  altitude: number,
  thresholds: DetailTierThresholds = DEFAULT_DETAIL_TIER_THRESHOLDS,
  current: DetailTier | null = null
): DetailTier {
  const { highMax, mediumMax } = thresholds;
  const highMargin = highMax * HYSTERESIS_FRACTION;
  const mediumMargin = mediumMax * HYSTERESIS_FRACTION;

  if (current === 2 && altitude < highMax + highMargin) return 2;
  if (current === 1 && altitude >= highMax - highMargin && altitude < mediumMax + mediumMargin) return 1;
  if (current === 0 && altitude >= mediumMax - mediumMargin) return 0;

  if (altitude < highMax) return 2;
  if (altitude < mediumMax) return 1;
  return 0;
}

/**
 * Live detail tier, re-rendering the calling component only when the tier itself
 * changes (not on every camera-telemetry publish, which fires far more often during
 * a drag). Pass `enabled: false` while the owning layer is inactive to skip
 * subscribing entirely.
 */
export function useCameraDetailTier(
  thresholds: DetailTierThresholds = DEFAULT_DETAIL_TIER_THRESHOLDS,
  enabled: boolean = true
): DetailTier {
  const initialAltitude = globeCameraTelemetry.getCurrent()?.altitude ?? FALLBACK_ALTITUDE;
  const [tier, setTier] = useState<DetailTier>(() => pickDetailTier(initialAltitude, thresholds, null));
  const tierRef = useRef(tier);
  tierRef.current = tier;

  useEffect(() => {
    if (!enabled) return;
    return globeCameraTelemetry.subscribe((orientation) => {
      const next = pickDetailTier(orientation.altitude, thresholds, tierRef.current);
      if (next !== tierRef.current) {
        tierRef.current = next;
        setTier(next);
      }
    });
    // thresholds itself deliberately excluded: callers that pass an inline object
    // literal (e.g. useCameraDetailTier({ highMax: 2, mediumMax: 6 })) would give a
    // new reference every render, resubscribing every render — the individual scalar
    // values are what actually matter, so those are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, thresholds.highMax, thresholds.mediumMax]);

  return tier;
}
