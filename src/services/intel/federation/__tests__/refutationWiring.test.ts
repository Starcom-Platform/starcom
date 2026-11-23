/**
 * The wiring itself, against the real singleton rather than a mock.
 *
 * PeerClaimsPanel's own tests mock CorrelationContext, and CorrelationContext
 * reaches federationIngestService.refutations directly. Between those two lies
 * a gap a mock cannot cover: whether that property exists at runtime and
 * answers the calls made of it. A browser check does not close it either — the
 * contested path only executes once there is relay data to iterate, so a fresh
 * app renders the panel as silent whether the wiring is sound or absent.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { federationIngestService } from '../FederationIngestService';
import { RefutationStore } from '../RefutationStore';

const REFUTES = {
  subjectRef: 'John Smith',
  attribute: 'location',
  authorPubkey: 'a'.repeat(64),
  publishedAt: '2026-08-17T00:00:00.000Z',
};

describe('refutation wiring on the shared service', () => {
  it('exposes a refutation store beside the finding store', () => {
    expect(federationIngestService.refutations).toBeInstanceOf(RefutationStore);
    expect(federationIngestService.store).not.toBe(federationIngestService.refutations);
  });

  it('answers forClaim for a claim nobody has argued with', () => {
    // The exact call CorrelationContext makes per claim. An undefined store or
    // a renamed method fails here rather than inside a render.
    expect(federationIngestService.refutations.forClaim(REFUTES)).toEqual([]);
  });

  it('says uncontested when nobody has argued, without weighing anything', () => {
    const claim = { method: {}, publishedAt: REFUTES.publishedAt };
    // Returns before the derivation — no refutations held, nothing to compare.
    expect(federationIngestService.refutations.contestedFor(claim, REFUTES)).toBe('uncontested');
  });

  it('fails toward DISCLOSURE when a held refutation cannot be weighed', async () => {
    /**
     * The case the previous version of this test claimed to cover and did not.
     *
     * It passed `method: {}` with an EMPTY store, so contestedFor returned at
     * `held.length === 0` and the guarded derivation never ran — the assertion
     * held whether or not the guard worked, and it recorded 'uncontested' as
     * the contract when the store's own comment says the fallback is
     * 'contested'. With a refutation actually on file, the unweighable claim
     * takes the branch that matters.
     *
     * Reporting 'uncontested' there would hide real disagreement behind an
     * internal error, which is the one failure this whole mechanism exists to
     * prevent: an interface that can only show who agrees reports consensus
     * whether or not consensus exists.
     */
    const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');
    const { buildRefutation } = await import('../../findings/refutation');
    const { signFinding } = await import('../../findings/signFinding');
    const { buildFindingAttestation } = await import('../../findings/FindingContent');

    const method = buildFindingAttestation(
      { entityRef: REFUTES.subjectRef, attribute: REFUTES.attribute, value: {}, confidence: 0.9,
        sourceCount: 4, algorithmVersion: 2 } as never,
      { modality: 'primary_record', weakBacking: [] },
      () => new Date('2026-09-01T00:00:00.000Z'),
    ).method;
    const content = buildRefutation(REFUTES, 'contradicting-evidence', method,
      () => new Date('2026-09-01T00:00:00.000Z'));
    const accepted = federationIngestService.refutations.accept(
      signFinding(content, ml_dsa65.keygen().secretKey));
    expect(accepted.accepted).toBe(true);

    const unweighable = { method: {}, publishedAt: REFUTES.publishedAt };
    expect(federationIngestService.refutations.contestedFor(unweighable, REFUTES)).toBe('contested');
  });

  it('counts refutations in its own metric, not among accepted claims', () => {
    // `refutations` exists on the metrics shape so disagreement is visible as
    // its own signal rather than folded into a total that only grows.
    // No optional-call fallback: `?.() ?? {...}` would pass whether or not the
    // accessor exists, which is an assertion about the test, not the service.
    expect(federationIngestService.getMetrics().refutations).toBe(0);
  });
});
