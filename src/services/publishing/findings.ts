/**
 * Finding paths through the publish review (plan item 0.1): a corroborated
 * finding, a structural attestation, a case's position, a refutation, and the
 * withdrawal of one of your own claims.
 *
 * The gates run first. A publish refused by the publication policy, held for
 * the publisher's acknowledgement, or with nothing to say (a case with no
 * position, a claim never published) never opens a review; it comes back in
 * the shape the panels already handle. What is reviewed is the content the
 * ML-DSA signature will cover, fingerprinted by the same contentDigest.
 *
 * Each returns the domain result, or null when the person cancels.
 */
import { bytesToHex } from '@noble/hashes/utils';
import { nip19 } from 'nostr-tools';
import { requestReview, type ReviewContent } from './publishReview';
import { destinationsFor } from './destinations';
import {
  prepareFinding, prepareAttestation, prepareCaseAdjudication, prepareRefuteWithFinding, prepareRetraction,
  publishPreparedAttestation, publishPreparedRefutation, publishPreparedRetraction,
  type PreparedFindingPublish, type PrepareOutcome, type PublishFindingResult, type RetractFindingResult,
} from '../intel/findings/FindingsPublisherService';
import { contentDigest, type SignableFindingContent } from '../intel/findings/signFinding';
import type { PublicationPolicyOptions } from '../intel/findings/publicationPolicy';
import type { FindingAttestation } from '../intel/findings/attestation';
import type { FindingRefutation, RefutationGround } from '../intel/findings/refutation';
import type { RetractionReason } from '../intel/findings/retraction';
import type { CaseAdjudicationOptions, AdjudicatedCase } from '../intel/findings/caseAdjudication';
import type { CorroboratedFinding } from '../../applications/intelanalyzer/state/correlationUtils';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { caseRestsOnSample, onceLoaded } from '../intel/sampleRecords';

const shortKey = (hex: string) => {
  try {
    const npub = nip19.npubEncode(hex);
    return `${npub.slice(0, 14)}…${npub.slice(-6)}`;
  } catch {
    return hex;
  }
};

const valueText = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

/** A finding-family payload as a person reads it, and exactly as it is sent. */
export function showFindingContent(prepared: Readonly<PreparedFindingPublish>): ReviewContent {
  const raw = JSON.stringify(prepared.content, null, 2);
  if (prepared.kind === 'attestation') {
    const { claim, method, publishedAt } = prepared.content;
    return {
      title: `${claim.subjectRef} — ${claim.attribute}`,
      body: valueText(claim.value),
      fields: [
        { label: 'About', value: String(claim.subjectKind) },
        { label: 'Reached by', value: `${method.algorithm}, version ${method.algorithmVersion}` },
        ...(method.weakBacking.length ? [{ label: 'Weak backing', value: method.weakBacking.join('; ') }] : []),
        { label: 'Published at', value: publishedAt },
      ],
      raw,
    };
  }
  if (prepared.kind === 'refutation') {
    const { refutes, ground } = prepared.content;
    return {
      title: `Refuting a claim: ${refutes.subjectRef} — ${refutes.attribute}`,
      body: `Ground: ${String(ground)}`,
      fields: [
        { label: 'Whose claim', value: shortKey(refutes.authorPubkey) },
        { label: 'Their claim published', value: refutes.publishedAt },
      ],
      raw,
    };
  }
  const { retracts, reason, note, retractedAt } = prepared.content;
  return {
    title: `Withdraw your claim: ${retracts.subjectRef} — ${retracts.attribute}`,
    body: `Reason: ${String(reason)}${note ? `. ${note}` : ''}`,
    fields: [{ label: 'Withdrawn at', value: retractedAt }],
    raw,
  };
}

async function review<P extends PreparedFindingPublish, R>(
  act: string,
  ready: PrepareOutcome<P, R>,
  send: (prepared: P) => Promise<R>,
  sample = false,
): Promise<R | null> {
  if ('refused' in ready) return ready.refused;
  const outcome = await requestReview<P, R>({
    act,
    sample,
    payload: ready.prepared,
    show: (p) => showFindingContent(p),
    // Where it goes, decided when it was prepared (plan item 0.4).
    destinations: destinationsFor(ready.prepared.relays),
    digest: (p) => bytesToHex(contentDigest(p.content as SignableFindingContent)),
    signer: await nostrIdentityService.refreshSigner(),
    send: (p) => send(p as P),
  });
  return outcome.status === 'sent' ? outcome.result : null;
}

export function reviewFinding(finding: CorroboratedFinding, policy?: PublicationPolicyOptions): Promise<PublishFindingResult | null> {
  return review('Publish finding', prepareFinding(finding, policy), publishPreparedAttestation);
}

export function reviewAttestation(content: FindingAttestation, policy?: PublicationPolicyOptions, label?: string): Promise<PublishFindingResult | null> {
  return review('Publish finding', prepareAttestation(content, policy, label), publishPreparedAttestation);
}

export async function reviewCaseAdjudication(
  caseRecord: AdjudicatedCase,
  options: CaseAdjudicationOptions,
  policy?: PublicationPolicyOptions,
): Promise<PublishFindingResult | null> {
  // A sample case, or one resting on sample evidence, is never published (plan item 0.9).
  const sample = await onceLoaded(() => caseRestsOnSample(caseRecord));
  return review('Publish case position', prepareCaseAdjudication(caseRecord, options, policy), publishPreparedAttestation, sample);
}

export function reviewRefutation(
  refutes: FindingRefutation['refutes'],
  ground: RefutationGround,
  evidence: CorroboratedFinding,
  subjectKind: FindingAttestation['claim']['subjectKind'],
  policy?: PublicationPolicyOptions,
): Promise<PublishFindingResult | null> {
  return review('Publish refutation', prepareRefuteWithFinding(refutes, ground, evidence, subjectKind, policy), publishPreparedRefutation);
}

export function reviewRetraction(slot: string, reason: RetractionReason, note?: string): Promise<RetractFindingResult | null> {
  return review('Publish withdrawal', prepareRetraction(slot, reason, note), publishPreparedRetraction);
}
