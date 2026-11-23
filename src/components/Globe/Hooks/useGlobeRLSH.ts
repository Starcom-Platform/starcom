/**
 * useGlobeRLSH — Real Life Super Hero marker data pipeline for the Globe.
 *
 * Extracted from Globe.tsx RLSH PLACEHOLDER INTEGRATION section. Loads RLSH
 * markers via RLSHVisualizationService and feeds them into the shared Intel
 * marker pipeline.
 */

import { useEffect, useState } from 'react';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import { RLSH_MARKER_CAPS, rlshVisualizationService } from '../../../services/RLSHVisualizationService';
import { rlshTelemetryService } from '../../../services/RLSHTelemetryService';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'Globe:RLSH' });
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * One marker per LOCATION, not one per person.
 *
 * The globe draws a 3D model per report at its coordinates, and the RLSH source
 * geocodes to a city centroid — so 197 markers occupy 107 distinct coordinates
 * and 121 people sit exactly underneath somebody else. San Diego was fourteen
 * models in the same place, Seattle thirteen, Portland nine. Exactly one of
 * each stack could ever be hovered or clicked; the rest were unreachable and
 * invisible, while still costing a model, a raycast target and a draw call.
 *
 * Collapsing is safe here because RLSHPopupPortal loads the full marker set
 * itself and already ranks a clicked marker's group first — so the people
 * behind the pin stay reachable through the popup that was built to page
 * through them. `groupSize` rides along so the tooltip can say they exist,
 * which is the part nobody could previously have guessed.
 *
 * The representative prefers an ACTIVE member. A city's pin standing for a
 * retired member while an active one hides behind it would misreport the thing
 * a reader most wants to know.
 */
export function collapseCoLocated(markers: IntelReportOverlayMarker[]): IntelReportOverlayMarker[] {
  const isActive = (m: IntelReportOverlayMarker) =>
    m.tags.some((t) => t === 'Active' || t === 'Semi-Active');

  const chosen = new Map<string, IntelReportOverlayMarker>();
  for (const marker of markers) {
    // An ungrouped marker is its own group of one.
    const key = marker.groupId ?? `solo:${marker.pubkey}`;
    const held = chosen.get(key);
    if (!held) {
      chosen.set(key, marker);
      continue;
    }
    // Active wins; ties break on title so the same pin is chosen every load.
    const better = isActive(marker) !== isActive(held)
      ? isActive(marker)
      : marker.title.localeCompare(held.title) < 0;
    if (better) chosen.set(key, marker);
  }
  return [...chosen.values()];
}

interface UseGlobeRLSHOptions {
  isLayerActive: (id: string) => boolean;
  isMobileDevice: boolean;
}

/** One fetch-and-collapse, so no caller can forget the collapse half. */
async function fetchDrawnMarkers(limit: number): Promise<IntelReportOverlayMarker[]> {
  return collapseCoLocated(await rlshVisualizationService.getIntelCompatibleMarkers({ limit }));
}

/**
 * When the registry on display was last verified: the OLDEST record's time
 * (decision D-F, step 12). The layer is only as current as its least-recently
 * verified entry — the rule Cyber Threats follows for its blocklists.
 *
 * Read from the markers BEFORE collapseCoLocated, which merges people sharing a
 * coordinate and would keep only one of their times. Null when no record's time
 * can be read, so a caller says "untimed" rather than inventing "now".
 *
 * Every record in the shipped dataset was verified at one moment,
 * 2026-03-02T15:15Z — so the key now says the layer is some months old, where it
 * used to say nothing at all.
 */
export function rlshSourceAsOf(markers: readonly IntelReportOverlayMarker[]): number | null {
  let oldest: number | null = null;
  for (const marker of markers) {
    const at = marker.timestamp;
    if (typeof at !== 'number' || !Number.isFinite(at)) continue;
    if (oldest === null || at < oldest) oldest = at;
  }
  return oldest;
}

export function useGlobeRLSH({ isLayerActive, isMobileDevice }: UseGlobeRLSHOptions) {
  const [reports, setReports] = useState<IntelReportOverlayMarker[]>([]);
  const [loading, setLoading] = useState(false);
  /*
   * This hook returned only { reports, loading }, so the layer's feed was
   * `unreported` and a failure — swallowed below — looked exactly like an empty
   * registry. It reports its health now, the same shape Satellites does.
   */
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [untimed, setUntimed] = useState(false);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;
    const isActive = isLayerActive('RLSH');
    const limit = isMobileDevice
      ? Math.min(60, RLSH_MARKER_CAPS.highDetail)
      : RLSH_MARKER_CAPS.highDetail;

    if (isActive) {
      setLoading(true);
      rlshTelemetryService.emit('rlsh_mode_switch', { result: 'success' });

      const syncMarkers = async () => {
        try {
          const markers = await rlshVisualizationService.getIntelCompatibleMarkers({ limit });
          if (!mounted) return;

          const drawn = collapseCoLocated(markers);
          setReports(drawn);
          // As of the least-recently verified profile; with none submitted yet, as of when the list was read,
          // so the key says it loaded with nothing to draw (RS49).
          const asOf = markers.length === 0 ? Date.now() : rlshSourceAsOf(markers);
          setLastLoadedAt(asOf);
          setUntimed(asOf === null && markers.length > 0);
          setError(null);

          const geoConfidenceMix = markers.reduce(
            (acc, marker) => {
              const tag = marker.tags
                .find((t) => ['EXACT', 'CITY', 'REGION', 'COUNTRY', 'UNKNOWN'].includes(t))
                ?.toLowerCase() as 'exact' | 'city' | 'region' | 'country' | 'unknown' | undefined;
              if (tag) acc[tag] += 1;
              return acc;
            },
            { exact: 0, city: 0, region: 0, country: 0, unknown: 0 },
          );

          rlshTelemetryService.emit('rlsh_markers_loaded', {
            markerCount: drawn.length,
            geoConfidenceMix,
            sourceProvider: markers[0]?.author,
            result: 'success',
          });

          if (isDevelopment) {
            log.debug(
              `🦸 RLSH MODE - ${markers.length} markers over ${drawn.length} locations `
              + `(${markers.length - drawn.length} were stacked out of reach)`,
            );
            log.debug('🦸 Debug stats:', rlshVisualizationService.getDebugStats());
          }
        } catch (error) {
          if (!mounted) return;
          log.error('🦸 Failed to load RLSH markers:', error);
          setReports([]);
          // Said, not swallowed: without it a failure reads as an empty registry.
          setError(error instanceof Error ? error.message : String(error));
          setLastLoadedAt(null);
          rlshTelemetryService.emit('rlsh_markers_loaded', {
            markerCount: 0,
            result: 'failure',
            reason: 'pipeline',
          });
        } finally {
          if (mounted) setLoading(false);
        }
      };

      /*
       * Collapsed here too, which it was not.
       *
       * The initial load collapsed co-located markers and this callback did
       * not, so the first thing that notified the service — flipping the role
       * filter, or the status filter — re-stacked all 43 hidden people and
       * silently undid the fix. It was invisible because the log that proves
       * the collapse works is emitted on the path that HAS it.
       *
       * Both paths now go through fetchDrawnMarkers, so they cannot disagree
       * again. Two call sites doing the same thing slightly differently is how
       * this happened.
       */
      unsubscribe = rlshVisualizationService.subscribe(async () => {
        const drawn = await fetchDrawnMarkers(limit);
        if (mounted) setReports(drawn);
      });

      void syncMarkers();

      return () => {
        mounted = false;
        unsubscribe?.();
      };
    }

    setReports([]);
    setLoading(false);

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [isLayerActive, isMobileDevice]);

  return { reports, loading, error, lastLoadedAt, untimed };
}
