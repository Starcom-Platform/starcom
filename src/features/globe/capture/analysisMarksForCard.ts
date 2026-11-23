import type { GlobeIntelLayer } from '../../../services/intel/globe/globeIntelLayer';
import type { MarkProvenance } from './shareCardProvenance';

export interface AnalysisMarksForCardInput {
  /** The Intel Reports layer is on: the only time analysis marks are drawn. */
  layerDrawn: boolean;
  /** The analysis marks drawn. Only how many there are matters here. */
  markers: readonly unknown[];
  layers: readonly Pick<GlobeIntelLayer, 'integrity' | 'emptyReason'>[];
}

/**
 * The analysis marks a card states, or null when the card shows none (decision D-F,
 * step 2).
 *
 * Analysis marks are drawn only while the Intel Reports layer is on
 * (useGlobeIntelMarkPoints), and a card's analysis caveats come from what this
 * returns. It was built in Globe.tsx and handed to every card whatever layer the card
 * showed, so a submarine cable card said the working set held nothing to analyse, and
 * so did every clip. Null says the card has no analysis layer, and the card and clip
 * builders then say nothing about analysis. Out of Globe.tsx because nothing renders
 * Globe.tsx in a test, so a rule left there could not be checked.
 *
 * ─── WHAT THE ANALYSIS MARKS IN A PUBLISHED IMAGE ESTABLISH ──────────────
 *
 * `fabricated` is null unless EVERY layer contributing marks measured it. Not a sum
 * over the ones that did: a card reporting "1 fabricated" while a second layer never
 * looked would be a number standing where a partial answer belongs, and a number
 * reads as complete. This is the same reason GlobeIntelLayer.integrity is nullable
 * rather than zeroed — see the note there, and the one on MarkProvenance.
 */
export function analysisMarksForCard({ layerDrawn, markers, layers }: AnalysisMarksForCardInput): MarkProvenance | null {
  if (!layerDrawn) return null;
  const anyUnmeasured = layers.some((l) => l.integrity === null);
  const measured = !anyUnmeasured && layers.length > 0;
  return {
    shown: markers.length,
    fabricated: measured
      ? layers.reduce((n, l) => n + (l.integrity?.mockCount ?? 0), 0)
      : null,
    totalObservations: measured
      ? layers.reduce((n, l) => n + (l.integrity?.totalObservations ?? 0), 0)
      : null,
    // Only meaningful when there is nothing drawn to explain.
    emptyReason: markers.length === 0
      ? (layers.find((l) => l.emptyReason)?.emptyReason ?? null)
      : null,
  };
}
