/**
 * Which intel-like markers the globe should draw.
 *
 * Extracted from an inline useMemo in Globe.tsx so it can be tested at all.
 * The rule it replaced was an EXCLUSIVE chain — first active layer with data
 * wins — which silently defeated useGlobeLayerControl for the two layers that
 * share the 3D marker pipeline: a pinned RLSH layer was not merely
 * un-clickable, it was never drawn.
 */
import type { IntelReportOverlayMarker } from '../../interfaces/IntelReportOverlay';

export interface CombineResult {
  reports: IntelReportOverlayMarker[];
  /** How many were dropped by the ceiling. Zero when nothing was truncated. */
  dropped: number;
  /** What was asked for, before the ceiling. */
  requested: number;
}

/**
 * @param ceiling the most individually-animated markers the globe will carry.
 *
 * The per-layer caps do NOT compose: intel allows 500 cached markers and RLSH
 * 120 at high detail, so a naive concatenation could put 620 animated models on
 * the globe — and 120 is the tuned figure for that cost, not an arbitrary one.
 *
 * Truncation is REPORTED rather than silent. A globe quietly showing 300 of 620
 * markers is a map that lies about how much it is showing, and the operator has
 * no way to tell from looking.
 */
export function combineActiveIntelLikeReports(
  layers: Array<{ active: boolean; reports: readonly IntelReportOverlayMarker[] }>,
  ceiling: number,
): CombineResult {
  const combined: IntelReportOverlayMarker[] = [];
  for (const layer of layers) {
    if (layer.active) combined.push(...layer.reports);
  }
  if (combined.length <= ceiling) {
    return { reports: combined, dropped: 0, requested: combined.length };
  }
  return {
    reports: combined.slice(0, ceiling),
    dropped: combined.length - ceiling,
    requested: combined.length,
  };
}
