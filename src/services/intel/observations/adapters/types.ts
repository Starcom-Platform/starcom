import type { Observation, Source } from '../../../../types/intel/SourceObservation';

/**
 * The contract every source adapter implements.
 *
 * ADR-0003's compliance check: "A genuinely new source type maps into
 * Source/Observation rather than adding a fourth bespoke shape alongside
 * NetRunner's." This interface is what makes that checkable — a new source is
 * an implementation of this, and it must pass the shared contract suite in
 * adapterContract.ts before it is wired in.
 */
export interface SourceAdapter<TRaw = unknown> {
  readonly source: Source;

  /**
   * Map upstream records into observations.
   *
   * Records that cannot be faithfully represented are DROPPED and counted, not
   * coerced into a partial observation. A partial record entering the corpus
   * is indistinguishable from a complete one once it is in there.
   */
  toObservations(raw: TRaw[]): AdapterResult;
}

export interface AdapterResult {
  observations: Observation[];
  /**
   * Upstream records that could not be mapped, with the reason.
   *
   * Never silently discarded: a source that quietly drops 80% of its input
   * looks identical to a source with little data, and the difference is the
   * whole question of whether the corpus is trustworthy.
   */
  dropped: Array<{ nativeId?: string; reason: string }>;
}
