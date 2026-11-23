import type { FindingAttestation } from './attestation';

/**
 * Derive what a Finding is worth, from its method and its age.
 *
 * This is the function a CONSUMER runs. It takes only what travels on the wire,
 * so an unaffiliated party — a different Starcom instance, a journalist's
 * script, anything that can parse JSON — computes the same number we would,
 * without asking us and without trusting us.
 *
 * That property is the whole point of removing `confidence` from the payload.
 * A number the publisher asserts is worth exactly as much as the publisher's
 * honesty; a number both sides compute from stated facts is worth what the
 * facts are worth.
 *
 * Deterministic: same attestation, same instant, same answer. Anything else
 * would make it uncheckable.
 */

/** Independent-source contribution, saturating. */
const CORROBORATION_CEILING = 4;

/** Halving interval for age, mirroring the observation-side decay. */
export const ATTESTATION_HALF_LIFE_DAYS = 180;

/**
 * What an extra source is worth when it shares a delivery path with the others.
 *
 * Not zero: the evidence is real. Not one: it does not add an independent way
 * for the claim to be wrong. Half, stated as the judgement it is.
 */
export const RELAY_DISCOUNT = 0.5;

export interface WeightBreakdown {
  weight: number;
  basis: 'derived';
  /** 0..1 — how many independent sources agreed, saturating at CORROBORATION_CEILING. */
  corroboration: number;
  /** 0..1 — penalty when the finding's timing is coarser than the window it claims. */
  precision: number;
  /** 0..1 — exponential decay from publishedAt. */
  recency: number;
  ageDays: number;
}

export interface DeriveOptions {
  now?: Date;
  halfLifeDays?: number;
}

/**
 * Explains the weight in its parts.
 *
 * A weight a consumer cannot decompose is indistinguishable from one that was
 * asserted — so the breakdown is the primary function and the scalar is derived
 * from it, not the other way round.
 */
export function explainAttestationWeight(
  attestation: Pick<FindingAttestation, 'method' | 'publishedAt'>,
  options: DeriveOptions = {},
): WeightBreakdown {
  const now = options.now ?? new Date();
  const halfLifeDays = options.halfLifeDays ?? ATTESTATION_HALF_LIFE_DAYS;
  const { method } = attestation;

  /**
   * Two independent sources is the bar; more helps, with diminishing returns.
   * Linear growth would let a source-spamming instance manufacture weight.
   *
   * RELAY DISCOUNT. Sources that all reached the publisher through a single
   * aggregator are distinct observers sharing one delivery path, and that path
   * is a single point of failure the source count cannot see: one editor
   * asserting a value with five citations is indistinguishable, downstream,
   * from five registries independently agreeing.
   *
   * So additional sources arriving through the same relay count HALF. The
   * first still counts fully — the evidence is real, and discounting it to
   * nothing would throw away every claim any aggregator carries, which is most
   * open data. Sources observed directly are undiscounted.
   *
   * Half is a judgement, and it is stated as one rather than dressed up: it
   * says an extra citation through the same editorial path is worth something
   * but less than an independent path. A consumer who disagrees can recompute
   * from `relayedVia`, which is published for exactly that reason.
   */
  /**
   * An ENUMERATION claim is weighed on a different axis, and this is the point
   * of the distinction rather than a special case bolted on.
   *
   * Corroboration measures independence: how many separate observers agreed.
   * A census has no observers to agree — it counts entries in the authority's
   * own record. Running `sourceCount: 1` through the corroboration term would
   * score a complete national register at a quarter, and inflating the count
   * to compensate would be inventing sources.
   *
   * What can go wrong with a count is different: the boundary might not be
   * stated, in which case nobody can re-run it. So completeness replaces
   * corroboration, and it is binary — a stated boundary earns full support, an
   * unstated one earns none. Same rule as unmeasured provenance elsewhere:
   * absence is refusal, not a default.
   *
   * Note what the claim then IS. A register records what was FILED, not what
   * is true; a company can file an address it has never occupied. So the claim
   * is about the filing, and about a dated snapshot — which makes it durably
   * correct, with only its usefulness decaying. That decay is exactly what the
   * recency term already models.
   */
  if (method.parameters.matchedBy === 'enumeration') {
    const completeness = method.enumeratedBoundary?.trim() ? 1 : 0;
    /**
     * Age runs from the SNAPSHOT, not from publication.
     *
     * Everywhere else `publishedAt` is a fair proxy for how old the evidence
     * is, because a corroborated finding is published about when it is
     * observed. A census breaks that: the register instant and the decision to
     * publish are independent, so measuring from `publishedAt` would score a
     * five-year-old register republished this morning as perfectly fresh —
     * and `publishedAt` is a value the publisher chooses. Found by running the
     * real Companies House register through this: a three-week-old snapshot
     * derived recency 1.000.
     *
     * `observedTo` is on the wire and is the instant the register describes,
     * so this still depends only on published facts.
     */
    const observedAt = Date.parse(method.observedTo);
    const enumBasis = Number.isFinite(observedAt) ? observedAt : Date.parse(attestation.publishedAt);
    const ageDaysEnum = Math.max(0, (now.getTime() - enumBasis) / 86_400_000);
    const recencyEnum = Math.pow(0.5, ageDaysEnum / halfLifeDays);
    // Unrounded, for the reason given at the other return.
    return {
      corroboration: completeness,
      precision: 1,
      recency: recencyEnum,
      ageDays: ageDaysEnum,
      weight: completeness * recencyEnum,
      basis: 'derived',
    };
  }

  const relayCount = method.relayedVia?.length ?? 0;
  const effectiveSources = relayCount > 0
    // Capped BELOW saturation, not merely discounted.
    //
    // The discount alone still let a relayed claim reach full corroboration
    // given enough sources — measured: 3 of 187 real findings hit 1.0. That is
    // wrong on the principle, because the relay's failure mode does not weaken
    // as sources accumulate: one editor can cite eleven registries as easily as
    // five. A claim delivered entirely through a single aggregator can never be
    // as strong as the same claim received independently, however many
    // citations it carries.
    ? Math.min(1 + (method.sourceCount - 1) * RELAY_DISCOUNT, CORROBORATION_CEILING - 1)
    : method.sourceCount;
  const corroboration = Math.min(effectiveSources, CORROBORATION_CEILING) / CORROBORATION_CEILING;

  /**
   * A finding whose inputs are timed to the day cannot support a 24-hour claim
   * as strongly as one timed to the minute. Ratio of window to precision,
   * capped at 1 — being MORE precise than required earns nothing extra.
   *
   * INAPPLICABLE to an equality-matched finding, and that distinction is not
   * cosmetic. Those publish `windowHours: 0` because no time window was used,
   * and running them through this ratio yields precision 0 and therefore a
   * weight of 0 for every such claim — silently discarding them rather than
   * weighing them. Timing precision does not bear on whether two registries
   * name the same identifier; it is not a weak signal there, it is not a
   * signal at all.
   */
  const windowMs = method.parameters.windowHours * 3_600_000;
  const precision = method.parameters.matchedBy === 'equality'
    ? 1
    : method.timePrecisionMs > 0
      ? Math.min(windowMs / method.timePrecisionMs, 1)
      : 1;

  const ageDays = Math.max(0, (now.getTime() - Date.parse(attestation.publishedAt)) / 86_400_000);
  const recency = Math.pow(0.5, ageDays / halfLifeDays);

  /**
   * UNROUNDED. Rounding here is presentational data leaking into arithmetic.
   *
   * These values were rounded to four decimals, and the rounded numbers are
   * what callers compare: the structural panel ORDERS by weight, and
   * decayedFindingProducer tests it against a revisit THRESHOLD. Two claims
   * whose true weights are 0.99584 and 0.99581 both became 0.9958 — a tie
   * resolved by whichever happened to be first in the array, which is not a
   * property of the evidence. Near the threshold, rounding decides which side
   * a standing claim falls on.
   *
   * It also put the reference implementation outside its own specification.
   * The NIP says presentational rounding must not feed back into ordering or
   * comparison, and that a conforming consumer compares within 1e-6 — while
   * this rounding produced disagreements of up to 4.5e-5 against an
   * independent implementation, measured across the real findings.
   *
   * Callers that display a weight format it at the point of display, which is
   * where a presentational decision belongs.
   */
  return {
    weight: corroboration * precision * recency,
    basis: 'derived',
    corroboration,
    precision,
    recency,
    ageDays,
  };
}

export function deriveAttestationWeight(
  attestation: Pick<FindingAttestation, 'method' | 'publishedAt'>,
  options: DeriveOptions = {},
): number {
  return explainAttestationWeight(attestation, options).weight;
}
