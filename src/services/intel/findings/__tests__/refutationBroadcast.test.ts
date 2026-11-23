/**
 * Refutation publishing — the dispatch inside FindingsBroadcastService.
 *
 * One signing path serves four content shapes, which is deliberate. The risk
 * that buys is that a shape reaches the wrong branch, and for refutations the
 * failure is not a malformed event: it is a refutation landing in a real
 * claim's replaceable slot and deleting the claim it disagrees with.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { FindingsBroadcastService, FINDING_KIND } from '../FindingsBroadcastService';
import { buildFindingAttestation, findingIdentifier } from '../FindingContent';
import { buildRefutation, REFUTATION_KIND, refutationIdentifier } from '../refutation';
import { signFinding } from '../signFinding';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';

const REFUTES = {
  subjectRef: 'John Smith',
  attribute: 'location',
  authorPubkey: 'a'.repeat(64),
  publishedAt: '2026-08-17T00:00:00.000Z',
};

function method() {
  const finding: CorroboratedFinding = {
    entityRef: REFUTES.subjectRef,
    attribute: REFUTES.attribute,
    value: { lat: 51.5, lon: -0.12 },
    confidence: 0.9,
    sourceCount: 4,
    algorithmVersion: 2,
  };
  return buildFindingAttestation(finding, { modality: 'primary_record', weakBacking: [] },
    () => new Date('2026-09-01T00:00:00.000Z')).method;
}

function signedRefutation() {
  const content = buildRefutation(REFUTES, 'contradicting-evidence', method(),
    () => new Date('2026-09-01T00:00:00.000Z'));
  const { secretKey } = ml_dsa65.keygen();
  return signFinding(content, secretKey);
}

function signedClaim() {
  const finding: CorroboratedFinding = {
    entityRef: REFUTES.subjectRef,
    attribute: REFUTES.attribute,
    value: { lat: 40.7, lon: -74.0 },
    confidence: 0.8,
    sourceCount: 3,
    algorithmVersion: 2,
  };
  const content = buildFindingAttestation(finding, { modality: 'inference', weakBacking: [] },
    () => new Date('2026-08-17T00:00:00.000Z'));
  const { secretKey } = ml_dsa65.keygen();
  return signFinding(content, secretKey);
}

describe('refutation publishing', () => {
  const svc = new FindingsBroadcastService();

  it('publishes a refutation at 30083, not at the claim kind', () => {
    expect(svc.buildUnsignedEvent(signedRefutation()).kind).toBe(REFUTATION_KIND);
    expect(REFUTATION_KIND).not.toBe(FINDING_KIND);
  });

  it('addresses a refutation by the claim it refutes, never by its own subject', () => {
    const tags = svc.buildUnsignedEvent(signedRefutation()).tags as string[][];
    const d = tags.find((t) => t[0] === 'd')?.[1];
    expect(d).toBe(refutationIdentifier(REFUTES));
    // Four percent-encoded components, per the NIP's Addressing section.
    expect(d?.split(':')).toHaveLength(4);
  });

  it('NEVER lands in the replaceable slot of the claim it disagrees with', () => {
    const claim = svc.buildUnsignedEvent(signedClaim());
    const refutation = svc.buildUnsignedEvent(signedRefutation());
    const dOf = (e: Record<string, unknown>) =>
      (e.tags as string[][]).find((t) => t[0] === 'd')?.[1];

    // Same subject, same attribute — the case where a shared derivation would
    // collide. Relays replace on (pubkey, kind, d), so either half differing is
    // enough; both differ, and that is the invariant worth stating outright.
    expect(dOf(refutation)).not.toBe(dOf(claim));
    expect(refutation.kind).not.toBe(claim.kind);
    expect(dOf(claim)).toBe(findingIdentifier(signedClaim()));
  });

  it('carries the attested-claim tag, so disagreement is discoverable', () => {
    const tags = svc.buildUnsignedEvent(signedRefutation()).tags as string[][];
    expect(tags).toContainEqual(['t', 'attested-claim']);
  });

  it('still publishes ordinary claims at 30082', () => {
    expect(svc.buildUnsignedEvent(signedClaim()).kind).toBe(FINDING_KIND);
  });
});
