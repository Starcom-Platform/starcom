import type { IntelReliability } from '../../../types/intel/IntelItemUI';
import type { Observation, ObservationMethod } from '../../../types/intel/SourceObservation';
import { reliabilityWeight } from '../confidence/reliabilityWeight';

/**
 * Weight, derived — never declared.
 *
 * This is the Starcom-side implementation of the ecosystem principle stated in
 * navcom-app/docs/attestation.md: "Weight is derived from method and age,
 * never asserted by the author. An author cannot tell you how much to trust
 * them."
 *
 * It matters here, at ingest, and not only later at publication. If an adapter
 * could stamp its own confidence onto an observation, every downstream
 * derivation inherits an assertion, and the federation problem — an instance
 * claiming 1.0 for itself — would already exist inside a single instance.
 *
 * Three inputs, all of them facts about provenance rather than opinions:
 *   - the source's trust baseline (Admiralty A–F, assigned when the source is
 *     registered, not by the source itself)
 *   - the method (how the thing came to be known)
 *   - age (how long ago)
 */

/**
 * Bumped whenever the formula below changes — the same discipline
 * computeReportConfidence already applies with CONFIDENCE_ALGORITHM_VERSION,
 * and for the same reason: a version-tagged 0.72 stays honestly attributable
 * to the algorithm that produced it after a later formula ships.
 */
export const OBSERVATION_WEIGHT_ALGORITHM_VERSION = 1;

// Admiralty grade weighting comes from the shared table in
// confidence/reliabilityWeight.ts. This file originally declared its own,
// with different values (B 0.85 rather than 0.8), which would have meant a
// B-graded observation and a B-graded report carrying numbers that are not
// comparable — while being compared, inside computeLocationConflicts, with
// nothing about the result looking wrong.

/**
 * Method multiplier, ordered by evidential directness. An instrument reading
 * is worth more than a model output over other people's instrument readings,
 * and both are worth more than a curated summary of human reporting — not
 * because reporting is bad, but because each hop adds an interpretation that
 * cannot be re-checked from the record alone.
 */
const METHOD_WEIGHT: Record<ObservationMethod, number> = {
  measured: 1.0,
  observed: 0.9,
  collected: 0.8,
  reported: 0.7,
  derived: 0.6,

  /*
   * Field methods, from Navcom kind-1911 observations. Values argued for
   * rather than assigned, because a multiplier is doctrine and a number
   * nobody defended is a number nobody can dispute.
   *
   * `saw` — 0.85. First-person direct observation with no instrument and no
   * intermediary. Directness puts it above `collected`; the absence of a
   * calibrated instrument or remote-sensing platform keeps it below
   * `observed`. It is NOT lowered here for the observer being unvetted: that
   * doubt belongs to `trustBaseline`, which floors for a key nobody can
   * vouch for, and charging it twice would double-count one uncertainty in
   * two terms of the same product.
   *
   * `told` — 0.45. Well below `reported` 0.7, and the gap is the point.
   * `reported` means a dataset somebody curates and stands behind. `told` is
   * one person repeating another, and Navcom's anchor rule forbids naming a
   * person — so a `told` observation CANNOT identify who told them. It is
   * irreducibly unverifiable by construction, not merely unverified, and no
   * later work can promote it.
   *
   * `inferred` — 0.40. Below `derived` 0.6, which describes a model whose
   * inputs a reader can inspect and re-run. An operator's inference carries
   * its conclusion without its reasoning, so there is nothing to re-check.
   */
  saw: 0.85,
  told: 0.45,
  inferred: 0.40,
};

/**
 * Half-life for observation age, in days.
 *
 * 180 days is a deliberate, stated guess rather than a measured constant, and
 * it is the number most likely to be wrong in this file. It is exposed as a
 * parameter so a caller with a domain reason to disagree can say so explicitly
 * instead of forking the function. An earthquake's location does not decay;
 * an entity's whereabouts does. Per-attribute half-lives are the obvious next
 * refinement and are deliberately not guessed at here.
 */
export const DEFAULT_HALF_LIFE_DAYS = 180;

export interface DeriveWeightOptions {
  now?: Date;
  halfLifeDays?: number;
}

/**
 * Returns 0..1. Deterministic: the same observation, source, and instant
 * always produce the same weight — which is what makes it checkable by a third
 * party who was not in the room.
 */
export function deriveObservationWeight(
  observation: Pick<Observation, 'timestamp' | 'method'>,
  sourceTrust: IntelReliability,
  options: DeriveWeightOptions = {},
): number {
  const now = options.now ?? new Date();
  const halfLifeDays = options.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;

  const trust = reliabilityWeight(sourceTrust);
  const method = METHOD_WEIGHT[observation.method] ?? METHOD_WEIGHT.derived;

  const ageMs = now.getTime() - new Date(observation.timestamp).getTime();
  // A future-dated observation is not more trustworthy than a current one.
  // Clamp rather than reward clock skew or a source with a bad timezone.
  const ageDays = Math.max(0, ageMs / 86_400_000);
  const decay = Math.pow(0.5, ageDays / halfLifeDays);

  return Number((trust * method * decay).toFixed(4));
}

/**
 * The explanation of a derived weight, for the method block of a published
 * attestation and for the UI's "why does this rank here" answer. A weight a
 * consumer cannot decompose is indistinguishable from one that was asserted.
 */
export interface WeightExplanation {
  weight: number;
  /**
   * Always 'derived'. Mirrors DerivedConfidence.basis on the report side, so a
   * consumer holding a number can always tell whether it was computed from
   * provenance or typed in by a person — the distinction this codebase
   * already records via IntelReportUI.confidenceBasis.
   */
  basis: 'derived';
  algorithmVersion: number;
  trust: number;
  method: number;
  decay: number;
  ageDays: number;
  halfLifeDays: number;
}

export function explainWeight(
  observation: Pick<Observation, 'timestamp' | 'method'>,
  sourceTrust: IntelReliability,
  options: DeriveWeightOptions = {},
): WeightExplanation {
  const now = options.now ?? new Date();
  const halfLifeDays = options.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
  const ageDays = Math.max(0, (now.getTime() - new Date(observation.timestamp).getTime()) / 86_400_000);

  return {
    weight: deriveObservationWeight(observation, sourceTrust, options),
    basis: 'derived',
    algorithmVersion: OBSERVATION_WEIGHT_ALGORITHM_VERSION,
    trust: reliabilityWeight(sourceTrust),
    method: METHOD_WEIGHT[observation.method] ?? METHOD_WEIGHT.derived,
    decay: Number(Math.pow(0.5, ageDays / halfLifeDays).toFixed(4)),
    ageDays: Number(ageDays.toFixed(2)),
    halfLifeDays,
  };
}
