import { bytesToHex } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import type { Observation } from '../../../types/intel/SourceObservation';

/**
 * Input fingerprints — what makes a finding falsifiable by someone else.
 *
 * "Falsifiable" is meaningless if nobody else can attempt the falsification. A
 * consumer holding a finding today can check the signature and re-derive the
 * weight, but has no way to ask the question that actually matters: *do I hold
 * the same evidence, and does it support this?*
 *
 * A fingerprint is a hash of one contributing observation's identifying facts.
 * Publishing the set lets a third party compute fingerprints over their OWN
 * observations and see how many match — without either side revealing content
 * or source identity.
 *
 * WHAT THIS DOES NOT DO, stated plainly because the cryptography invites a
 * stronger reading than it deserves: a fingerprint is deterministic across
 * instances by necessity — that is the entire point, since a salted hash could
 * not be compared between parties. Deterministic hashing of LOW-ENTROPY inputs
 * is brute-forceable. Every input here is open data, so there is nothing to
 * protect; but a finding derived from a sensitive source should not be
 * published with fingerprints, because anyone who can guess the observation can
 * confirm it was used. This is a confirmation oracle, not an encryption.
 */

/** 128 bits. Collision-resistant for set comparison, half the payload of full SHA-256. */
const FINGERPRINT_BYTES = 16;

/**
 * Fingerprint one observation.
 *
 * Deliberately covers only the facts that make it THE SAME OBSERVATION to
 * another party: what it is about, what it claims, and when. Not the source id
 * — two instances ingesting the same UCDP event assign their own ids, and
 * including them would make identical evidence fingerprint differently, which
 * is exactly backwards.
 */
export function observationFingerprint(
  obs: Pick<Observation, 'subjectEntityRef' | 'claim' | 'timestamp'>,
): string {
  const canonical = JSON.stringify([
    obs.subjectEntityRef,
    obs.claim.attribute,
    obs.claim.value,
    obs.timestamp,
  ]);
  return bytesToHex(sha256(utf8ToBytes(canonical)).slice(0, FINGERPRINT_BYTES));
}

/** Sorted so the set is order-independent and directly comparable between parties. */
export function fingerprintSet(
  observations: Pick<Observation, 'subjectEntityRef' | 'claim' | 'timestamp'>[],
): string[] {
  return [...new Set(observations.map(observationFingerprint))].sort();
}

export interface ReproductionResult {
  /** Fingerprints present in both sets. */
  matched: number;
  /** Published fingerprints the consumer does not hold. */
  missing: number;
  /** 0..1 — how much of the claimed evidence the consumer can see. */
  coverage: number;
  /**
   * What a consumer may conclude.
   *
   * `unreproducible` explicitly does NOT mean "false". Holding none of the
   * evidence means you cannot check the claim, which is a fact about you, not
   * about the claim — treating it as refutation would let any party with no
   * data refute anything.
   */
  verdict: 'reproduced' | 'partial' | 'unreproducible';
}

/**
 * Attempt to reproduce a finding against evidence you already hold.
 *
 * This is the consumer's half of falsifiability. It answers "can I see what
 * they saw", and deliberately stops short of answering "are they right" —
 * that requires running the method, which the published parameters make
 * possible separately.
 */
export function attemptReproduction(
  publishedFingerprints: string[],
  ownFingerprints: string[],
): ReproductionResult {
  const own = new Set(ownFingerprints);
  const matched = publishedFingerprints.filter(f => own.has(f)).length;
  const missing = publishedFingerprints.length - matched;
  const coverage = publishedFingerprints.length === 0 ? 0 : matched / publishedFingerprints.length;

  return {
    matched,
    missing,
    coverage: Number(coverage.toFixed(4)),
    verdict: coverage === 1 ? 'reproduced' : coverage > 0 ? 'partial' : 'unreproducible',
  };
}
