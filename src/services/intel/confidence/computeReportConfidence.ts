import type { IntelReliability } from '../../../types/intel/IntelItemUI';
import { RELIABILITY_WEIGHT as SHARED_RELIABILITY_WEIGHT } from './reliabilityWeight';

/**
 * Bumped whenever the weighting formula below changes. Stored alongside
 * every derived value (see confidenceBasis on IntelReportData/IntelReportUI)
 * so a future formula refinement doesn't silently reinterpret old scores as
 * if they'd been computed the new way — a version-tagged 0.72 from
 * algorithm 1 stays honestly attributable to algorithm 1 even after
 * algorithm 2 ships.
 */
export const CONFIDENCE_ALGORITHM_VERSION = 1;

// Admiralty-style source-reliability grade -> a plain weight in [0,1].
// Deliberately NOT a plain average of these when multiple sources are
// linked — see computeReportConfidence's doc comment for why.
//
// Values unchanged; moved to reliabilityWeight.ts so the observation-weight
// derivation shares one table rather than inventing a second one whose
// numbers silently disagree with the scores already persisted here.
export { RELIABILITY_WEIGHT } from './reliabilityWeight';

export interface DerivedConfidence {
  value: number; // 0..1
  basis: 'derived';
  algorithmVersion: number;
  sourceCount: number;
}

/**
 * Derives a report's confidence from the reliability grades of the Intel
 * items it actually cites (sourceIntelIds), instead of trusting whatever
 * number an analyst typed into a form — those two values previously had no
 * relationship to each other at all.
 *
 * The corroboration bonus is additive and capped, never a multiplier or a
 * replacement for the base score: a single linked source's confidence
 * equals that source's own reliability weight, full stop. One credible
 * source is often the entire point of ground-truth reporting, and a
 * scoring scheme that dilutes single-source confidence toward zero for
 * "lacking corroboration" would misrepresent legitimate HUMINT as
 * inherently untrustworthy. Corroboration from additional independent
 * sources only ever raises the score, by a bounded amount.
 *
 * Returns null when there's nothing to derive from (no linked sources, or
 * none of them resolve to a real Intel item) — callers should fall back to
 * whatever the author entered in that case, not force a value.
 */
export function computeReportConfidence(
  sourceIntelIds: string[] | undefined,
  getReliability: (intelId: string) => IntelReliability | undefined
): DerivedConfidence | null {
  if (!sourceIntelIds || sourceIntelIds.length === 0) return null;

  const weights = sourceIntelIds
    .map(getReliability)
    .filter((grade): grade is IntelReliability => grade !== undefined)
    .map(grade => SHARED_RELIABILITY_WEIGHT[grade]);

  if (weights.length === 0) return null;

  const baseConfidence = Math.max(...weights);
  // Up to +0.15, at +0.05 per additional independent source beyond the
  // first — bounded so a pile of weak sources can't manufacture false
  // certainty the way an unbounded additive bonus could.
  const corroborationBonus = weights.length > 1
    ? Math.min(0.15, 0.05 * (weights.length - 1))
    : 0;

  return {
    value: Math.min(1, baseConfidence + corroborationBonus),
    basis: 'derived',
    algorithmVersion: CONFIDENCE_ALGORITHM_VERSION,
    sourceCount: weights.length
  };
}
