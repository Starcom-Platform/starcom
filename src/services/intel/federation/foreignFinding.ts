import type { FindingAttestation } from '../findings/attestation';
import { attemptReproduction } from '../findings/reproducibility';
import { deriveAttestationWeight } from '../findings/deriveAttestationWeight';

/**
 * A finding published by ANOTHER instance.
 *
 * The single most important thing about this type is what it is NOT: it is not
 * an observation. A foreign finding is someone else's CONCLUSION, already
 * aggregated from their own sources.
 *
 * Merging one into the local observation corpus would let it corroborate local
 * claims as though it were primary evidence — and two instances that ingested
 * the same UCDP release and reached the same conclusion would then look like
 * two independent sources agreeing. That is not corroboration. It is one piece
 * of evidence counted twice, which is precisely the failure federation is
 * meant to help with rather than manufacture.
 *
 * So foreign findings live here, separately, and are COMPARED to local ones
 * rather than mixed into them.
 */

export interface ForeignFinding {
  /** ML-DSA public key of the publishing instance. The author, in attestation terms. */
  authorPubkey: string;
  /** The `d`-tag slot it occupied — subject and attribute, normalised. */
  slot: string;
  content: FindingAttestation;
  /** When we received it. Distinct from content.publishedAt, which the author set. */
  receivedAt: string;
}

/**
 * How much a foreign finding actually adds.
 *
 * Agreement alone is not information. If another instance reached the same
 * conclusion from the same evidence, it has told us nothing we did not already
 * know — it has echoed. Independence is what makes agreement meaningful, and
 * the reproducibility envelope is what lets us measure it without either side
 * revealing sources.
 */
export type IndependenceVerdict =
  /** Different evidence, same conclusion. This is real corroboration. */
  | 'independent'
  /** Some shared inputs. Partially informative. */
  | 'partial-overlap'
  /** Every input we can see is one we already had. Agreement here is an echo. */
  | 'echo'
  /** Fingerprints missing on one side, so independence cannot be assessed. */
  | 'unknown';

export interface ForeignAssessment {
  /** Derived from their method and age — never read off their payload. */
  weight: number;
  independence: IndependenceVerdict;
  /** Fraction of their published inputs we also hold, when both sides published fingerprints. */
  evidenceOverlap: number | null;
  /**
   * What this adds to a local claim after discounting shared evidence. An echo
   * adds nothing regardless of how confident it sounds.
   */
  corroborationValue: number;
}

/**
 * Assess a foreign finding against evidence we already hold.
 *
 * `unknown` independence is treated CONSERVATIVELY — as if it might be an echo
 * — rather than optimistically. An instance publishing no fingerprints cannot
 * be checked, and rewarding that would make opacity the winning strategy:
 * publish nothing checkable, be counted as independent.
 */
export function assessForeignFinding(
  foreign: ForeignFinding,
  ownFingerprints: string[],
  now: Date = new Date(),
): ForeignAssessment {
  const weight = deriveAttestationWeight(foreign.content, { now });
  const theirs = foreign.content.method.inputFingerprints ?? [];

  if (theirs.length === 0 || ownFingerprints.length === 0) {
    return {
      weight,
      independence: 'unknown',
      evidenceOverlap: null,
      // Half credit: not dismissed, since it may be genuinely independent, but
      // not trusted as independent either, since we cannot tell.
      corroborationValue: Number((weight * 0.5).toFixed(4)),
    };
  }

  const { coverage } = attemptReproduction(theirs, ownFingerprints);
  const independence: IndependenceVerdict =
    coverage === 0 ? 'independent' : coverage >= 1 ? 'echo' : 'partial-overlap';

  // Value scales with how much of their evidence is NEW to us. An echo
  // contributes nothing no matter how well-signed it is.
  return {
    weight,
    independence,
    evidenceOverlap: Number(coverage.toFixed(4)),
    corroborationValue: Number((weight * (1 - coverage)).toFixed(4)),
  };
}
