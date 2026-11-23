import type { IntelReliability } from '../../../types/intel/IntelItemUI';

/**
 * The single Admiralty-grade → weight table for this codebase.
 *
 * Extracted because two of them briefly existed: computeReportConfidence's
 * (A 1.0 / B 0.8 / C 0.6 ...) and a second, independently invented one in the
 * observation-weight derivation (A 1.0 / B 0.85 / C 0.7 ...). Both produce
 * numbers that end up compared against each other inside
 * computeLocationConflicts, where a B-graded report scoring 0.8 and a
 * B-graded observation scoring 0.85 are not measuring the same thing — and
 * nothing about the resulting comparison would look wrong.
 *
 * These values are the incumbent ones, kept deliberately. They are persisted:
 * IntelReportUI.confidenceBasis records derived scores computed with this
 * table under a stated algorithm version, so changing the numbers silently
 * reinterprets every stored score. A change here is a version bump and a
 * migration, not an edit.
 */
export const RELIABILITY_WEIGHT: Record<IntelReliability, number> = {
  A: 1.0,  // completely reliable
  B: 0.8,  // usually reliable
  C: 0.6,  // fairly reliable
  D: 0.4,  // not usually reliable
  E: 0.2,  // unreliable
  F: 0.1,  // reliability cannot be judged
};

/** F ("cannot be judged") is the safe default — never treat an unknown grade as trustworthy. */
export function reliabilityWeight(grade: IntelReliability | undefined): number {
  return grade ? RELIABILITY_WEIGHT[grade] ?? RELIABILITY_WEIGHT.F : RELIABILITY_WEIGHT.F;
}
