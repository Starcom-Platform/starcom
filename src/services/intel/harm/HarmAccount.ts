/**
 * Harm accounting — how many, how badly, for how long, and to whom.
 *
 * This is the most dangerous module in the codebase, and the danger is not
 * technical. Putting a number on suffering does three things at once: it makes
 * harm comparable, which is necessary for choosing where to look; it makes
 * harm look measured, whether or not it was; and it decides whose suffering
 * counts, because whatever is not counted reads as zero.
 *
 * The design answers each of those:
 *
 *  - **Nothing is a point estimate.** Every quantity is an interval with a
 *    stated method, because a single number is a claim to precision that
 *    almost no harm estimate has. "Between 200 and 2,000" is honest;
 *    "1,100" is a decision disguised as a measurement.
 *
 *  - **Unknown is a first-class value and is NOT zero.** An unmeasured harm
 *    that defaults to zero is worse than no estimate at all: it enters every
 *    comparison as "nothing happened", and the people it describes disappear.
 *    `Unknown` carries a reason, so the gap is visible rather than absent.
 *
 *  - **There is no total.** Deliberately. See `weighHarm` — collapsing these
 *    four dimensions into one number requires choosing how many mildly
 *    affected people equal one death, and that is a moral judgement, not an
 *    arithmetic one. The caller must state their weights and they are recorded
 *    alongside the result.
 *
 * Method is required everywhere. An estimate whose derivation is unstated
 * cannot be checked, argued with, or improved — the same reason attestation
 * weight is derived rather than declared.
 */

/** Why a quantity could not be established. Never collapse this to zero. */
export interface UnknownQuantity {
  known: false;
  /**
   * Why not — required.
   *
   * "No data" and "we did not look" and "the sources disagree irreconcilably"
   * are different states with different remedies, and a bare `null` erases the
   * distinction.
   */
  whyNot: string;
}

/** How an estimate was arrived at. Ordered by evidential directness. */
export type EstimateBasis =
  /** Enumerated individually — a register, a roll, a body count. */
  | 'counted'
  /** Measured on a subset and extended, with the sampling method stated. */
  | 'sampled'
  /** Produced by a model over other inputs. Only as good as its assumptions. */
  | 'modelled'
  /** Taken from human reporting, uncorroborated. */
  | 'reported';

/**
 * A range, never a point.
 *
 * `low` and `high` are the bounds the stated method actually supports. They
 * may be equal ONLY where something was genuinely counted exactly — and even
 * then the basis records that it was a count rather than a guess that happened
 * to land on one number.
 */
export interface RangeQuantity {
  known: true;
  low: number;
  high: number;
  unit: string;
  basis: EstimateBasis;
  /** How this range was arrived at, in a sentence a stranger can evaluate. */
  method: string;
}

export type Quantity = RangeQuantity | UnknownQuantity;

/**
 * How severely each affected person is affected.
 *
 * An ORDINAL scale, and the values are deliberately not numbers. Numbering
 * them invites arithmetic — averaging severity across a population, or
 * multiplying it by a headcount — and neither operation means anything. Two
 * people displaced is not "one death's worth" of harm at any exchange rate
 * this module is entitled to set.
 */
export type Severity =
  | 'inconvenience'
  | 'material-loss'
  | 'injury'
  | 'lasting-injury'
  | 'death';

/**
 * Who bears the harm.
 *
 * Recorded because the same total falling on different people is not the same
 * event. Harm concentrated on a group already bearing others compounds;
 * harm borne by those who chose the risk is different from harm borne by
 * people who had no say.
 */
export interface HarmDistribution {
  /** Free text naming the bearing population, as specifically as the evidence supports. */
  bearers: string;
  /** Concentrated on an identifiable group, or spread across a population. */
  concentration: 'concentrated' | 'diffuse' | 'unknown';
  /**
   * Whether those bearing the harm had any part in the decision that caused it.
   *
   * 'unknown' is the honest default and must not be read as 'consented'.
   */
  agency: 'chose-the-risk' | 'no-say' | 'unknown';
  /** Whether these bearers are already carrying other documented harms. */
  compounding: boolean | 'unknown';
}

export interface HarmAccount {
  /** What this accounts for — an event, a policy, a pattern. */
  subject: string;
  /** How many are affected at all. */
  affectedPopulation: Quantity;
  /** The worst severity credibly established, and how many reach it. */
  magnitude: { severity: Severity | 'unknown'; atThisSeverity: Quantity };
  /** How long the harm persists. */
  duration: Quantity;
  distribution: HarmDistribution;
  /** ISO 8601 UTC. Estimates age; a five-year-old figure is not current. */
  assessedAt: string;
  /** The overall approach, distinct from each quantity's own method. */
  method: string;
  schemaVersion: 1;
}

/** True when a quantity was actually established. */
export function isKnown(q: Quantity): q is RangeQuantity {
  return q.known === true;
}

/**
 * What is missing from an account.
 *
 * Returned rather than thrown, and always inspected before an account is
 * presented: an account with three unknowns and one number reads, at a glance,
 * as an account with one number.
 */
export function gapsIn(account: HarmAccount): string[] {
  const gaps: string[] = [];
  if (!isKnown(account.affectedPopulation)) gaps.push(`affected population: ${account.affectedPopulation.whyNot}`);
  if (account.magnitude.severity === 'unknown') gaps.push('severity was never established');
  if (!isKnown(account.magnitude.atThisSeverity)) gaps.push(`how many at that severity: ${account.magnitude.atThisSeverity.whyNot}`);
  if (!isKnown(account.duration)) gaps.push(`duration: ${account.duration.whyNot}`);
  if (account.distribution.concentration === 'unknown') gaps.push('who bears it is unknown');
  if (account.distribution.agency === 'unknown') gaps.push('whether the bearers had any say is unknown');
  if (account.distribution.compounding === 'unknown') gaps.push('whether this compounds existing harm is unknown');
  return gaps;
}

/**
 * Whether two accounts can honestly be compared on a dimension.
 *
 * Refuses rather than coercing. Comparing a known range against an unknown
 * quantity silently treats the unknown as zero, which is exactly how
 * unmeasured populations come to be described as unaffected.
 */
export function comparableOn(
  a: HarmAccount, b: HarmAccount,
  dimension: 'affectedPopulation' | 'duration',
): { comparable: true } | { comparable: false; reason: string } {
  const qa = a[dimension];
  const qb = b[dimension];
  if (!isKnown(qa)) return { comparable: false, reason: `${a.subject} has no ${dimension}: ${qa.whyNot}` };
  if (!isKnown(qb)) return { comparable: false, reason: `${b.subject} has no ${dimension}: ${qb.whyNot}` };
  if (qa.unit !== qb.unit) return { comparable: false, reason: `different units: ${qa.unit} vs ${qb.unit}` };
  // Overlapping ranges cannot be ordered. Picking midpoints to break the tie
  // manufactures a distinction the evidence does not contain.
  if (qa.low <= qb.high && qb.low <= qa.high) {
    return { comparable: false, reason: `ranges overlap (${qa.low}–${qa.high} vs ${qb.low}–${qb.high}); the evidence does not separate them` };
  }
  return { comparable: true };
}

/**
 * The weights required to collapse an account into one number.
 *
 * There is no default, and there will not be one. A default would be this
 * module quietly deciding how many displaced people equal one death, on behalf
 * of everyone who ever calls it. Whoever needs a scalar must say what they
 * think the exchange rate is, and it is recorded next to the result so a
 * reader can disagree with the specific judgement rather than the number.
 */
export interface HarmWeights {
  severity: Record<Severity, number>;
  /** Multiplier applied when harm falls on people who had no say. */
  noSayMultiplier: number;
  /** Multiplier applied when it compounds harm those people already bear. */
  compoundingMultiplier: number;
  /** Who chose these weights, and on what reasoning. Required. */
  rationale: string;
}

export type WeighResult =
  | {
      weighed: true;
      /** A RANGE, because its inputs are ranges. */
      low: number;
      high: number;
      weights: HarmWeights;
      /** The gaps that were present when this was computed. */
      gaps: string[];
    }
  | { weighed: false; reason: string; gaps: string[] };

/**
 * Collapse an account to a comparable range — only when it can be done honestly.
 *
 * REFUSES when the inputs are unknown, rather than substituting zero. This is
 * the single most important behaviour in the file: a scoring function that
 * treats missing data as "no harm" will always rank well-documented harms
 * above undocumented ones, which means it ranks by how much attention a
 * population has already received. That is precisely backwards for an
 * intelligence network whose purpose is to notice what is being missed.
 */
export function weighHarm(account: HarmAccount, weights: HarmWeights): WeighResult {
  const gaps = gapsIn(account);

  if (!isKnown(account.affectedPopulation)) {
    return { weighed: false, reason: `affected population unknown: ${account.affectedPopulation.whyNot}`, gaps };
  }
  if (account.magnitude.severity === 'unknown') {
    return { weighed: false, reason: 'severity unknown — there is no scale to apply', gaps };
  }

  const severityWeight = weights.severity[account.magnitude.severity];
  if (typeof severityWeight !== 'number') {
    return { weighed: false, reason: `no weight supplied for severity "${account.magnitude.severity}"`, gaps };
  }

  let multiplier = 1;
  if (account.distribution.agency === 'no-say') multiplier *= weights.noSayMultiplier;
  if (account.distribution.compounding === true) multiplier *= weights.compoundingMultiplier;

  return {
    weighed: true,
    low: account.affectedPopulation.low * severityWeight * multiplier,
    high: account.affectedPopulation.high * severityWeight * multiplier,
    weights,
    gaps,
  };
}
