import { useEffect, useMemo } from 'react';
import { env } from '../../../config/env';
import { useCorrelation } from '../../../applications/intelanalyzer/state/CorrelationContext';
import { buildIntelLayer, type GlobeIntelLayer } from './globeIntelLayer';
import { globeIntelLayerStore } from './globeIntelLayerStore';

/**
 * Correlation output, shaped for the globe.
 *
 * Sits on the intel side of the boundary on purpose: it reads
 * CorrelationContext and emits plain layer data. Nothing renderer-shaped
 * crosses in either direction, so the globe can change how it draws a mark
 * without touching analysis, and analysis can change what it concludes without
 * touching the renderer.
 *
 * Returns null when the feature flag is off, rather than an empty layer. An
 * empty layer means "analysis ran and found nothing"; a disabled feature means
 * "analysis was never shown here". Those must not be the same value — the
 * whole reason this layer exists is that a quiet globe has been indistinguishable
 * from an uninformed one.
 */
export function useGlobeIntelLayer(): GlobeIntelLayer | null {
  const { corroboratedFindings, locationConflicts, correlationStale, positionOf } = useCorrelation();

  const layer = useMemo(() => {
    if (!env.globeIntelLayer) return null;
    // While a recompute is outstanding the previous answer is still shown by
    // CorrelationContext; the layer inherits that and reports it through
    // `degraded` rather than silently presenting stale marks as current.
    // buildIntelLayer, not buildFindingsLayer: contradictions ship alongside
    // corroborations. A globe that shows only agreement is what every
    // intelligence tool already ships, because agreement demos well — and the
    // contradiction rendering was built, tested, and then never called, so it
    // had never once appeared.
    const layer = buildIntelLayer(corroboratedFindings, locationConflicts, positionOf, {
      // Integrity is deliberately not supplied yet: CorrelationContext works
      // from Events, which do not carry the observation-level isMock flag.
      // Passing a zeroed summary would render as "0% real" — a worse claim
      // than "unmeasured" — so it stays null until the observation pipeline
      // reaches this context.
      hadNoObservations: corroboratedFindings.length === 0 && locationConflicts.length === 0,
    });
    return correlationStale ? { ...layer, degraded: true } : layer;
  }, [corroboratedFindings, locationConflicts, positionOf, correlationStale]);

  // Publish across the tree boundary, and deliberately DO NOT withdraw on
  // unmount.
  //
  // My first version withdrew, reasoning that a globe showing a layer after the
  // analyzer went away presents a stale claim as current. That reasoning was
  // right for an architecture where both are mounted together — and this app is
  // not one. ApplicationRenderer mounts exactly one application at a time, so
  // cybercommand (the globe) and intelanalyzer are mutually exclusive.
  // Withdrawing on unmount would have blanked the layer at precisely the moment
  // it became visible, and the feature would have shipped never working.
  //
  // The honest answer to staleness is not withdrawal, it is age. The layer
  // carries provenance.computedAt, and the globe reports how old the analysis
  // is and expires it outright past a stated limit — see useGlobeIntelMarkers.
  useEffect(() => {
    globeIntelLayerStore.publish(layer);
  }, [layer]);

  return layer;
}
