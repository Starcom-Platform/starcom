/**
 * RefutationStore — receiving disagreement.
 *
 * The invariant worth the most here is that weight decides, never count. A
 * protocol that counted refutations would be a voting system, and a voting
 * system on an open network is won by whoever can run the most instances.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { RefutationStore } from '../RefutationStore';
import { buildRefutation } from '../../findings/refutation';
import { buildFindingAttestation } from '../../findings/FindingContent';
import { signFinding } from '../../findings/signFinding';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';

const REFUTES = {
  subjectRef: 'John Smith',
  attribute: 'location',
  authorPubkey: 'a'.repeat(64),
  publishedAt: '2026-08-17T00:00:00.000Z',
};

function methodWith(sourceCount: number, publishedAt = '2026-09-01T00:00:00.000Z') {
  const finding: CorroboratedFinding = {
    entityRef: REFUTES.subjectRef,
    attribute: REFUTES.attribute,
    value: { lat: 51.5, lon: -0.12 },
    confidence: 0.9,
    sourceCount,
    algorithmVersion: 2,
  };
  return buildFindingAttestation(finding, { modality: 'primary_record', weakBacking: [] },
    () => new Date(publishedAt));
}

function signRefutation(sourceCount: number, refutes = REFUTES) {
  const content = buildRefutation(refutes, 'contradicting-evidence',
    methodWith(sourceCount).method, () => new Date('2026-09-01T00:00:00.000Z'));
  const { secretKey } = ml_dsa65.keygen();
  return signFinding(content, secretKey);
}

describe('RefutationStore', () => {
  let store: RefutationStore;
  beforeEach(() => { store = new RefutationStore(); });

  it('keeps a well-evidenced refutation', () => {
    expect(store.accept(signRefutation(4)).accepted).toBe(true);
    expect(store.forClaim(REFUTES)).toHaveLength(1);
  });

  it('refuses a refutation carrying no method at all', () => {
    const signed = signRefutation(4);
    delete (signed.content as Record<string, unknown>).method;
    const resigned = signFinding(signed.content, ml_dsa65.keygen().secretKey);
    // Caught by the shared gate now, one step earlier than the weight
    // derivation and for a more specific reason: a payload with no method is
    // not a conforming payload, whatever else is true of it.
    expect(store.accept(resigned)).toEqual({ accepted: false, reason: 'unsupported-schema' });
  });

  it('refuses a refutation whose method is present but yields no number', () => {
    const signed = signRefutation(4);
    // Structurally conforming — passes every gate — and still worthless: a
    // zero source count derives no weight, so it has no standing to contest
    // anything. The cheapest possible message must not outweigh real evidence.
    (signed.content as { method: Record<string, unknown> }).method.sourceCount = 0;
    const resigned = signFinding(signed.content, ml_dsa65.keygen().secretKey);
    expect(store.accept(resigned)).toEqual({ accepted: false, reason: 'underivable-weight' });
  });

  it('refuses a ground outside the registered vocabulary', () => {
    const signed = signRefutation(4);
    // Accepting it would turn a publisher's error into a weaker-but-accepted
    // contest, with no way to report what was wrong.
    (signed.content as Record<string, unknown>).ground = 'i-just-disagree';
    const resigned = signFinding(signed.content, ml_dsa65.keygen().secretKey);
    expect(store.accept(resigned)).toEqual({ accepted: false, reason: 'unknown-ground' });
  });

  it('refuses a refutation that declares its own confidence', () => {
    const signed = signRefutation(4);
    // The reference peer rejects this and this store used to store it — the
    // exact assertion the derived-weight design exists to refuse, arriving
    // through the door that was left open.
    (signed.content as Record<string, unknown>).confidence = 0.99;
    const resigned = signFinding(signed.content, ml_dsa65.keygen().secretKey);
    expect(store.accept(resigned)).toEqual({ accepted: false, reason: 'declared-weight' });
  });

  it('refuses a refutation that will not say which claim it contests', () => {
    const content = buildRefutation(
      { ...REFUTES, publishedAt: '' }, 'source-defect',
      methodWith(3).method, () => new Date('2026-09-01T00:00:00.000Z'));
    const signed = signFinding(content, ml_dsa65.keygen().secretKey);
    expect(store.accept(signed)).toEqual({ accepted: false, reason: 'unaddressed' });
  });

  it('refuses a payload whose signature does not verify', () => {
    const signed = signRefutation(4);
    signed.signature.sig = 'ff'.repeat(signed.signature.sig.length / 2);
    expect(store.accept(signed)).toEqual({ accepted: false, reason: 'invalid-signature' });
  });

  it('replaces rather than accumulates when one author republishes', () => {
    const { secretKey } = ml_dsa65.keygen();
    const once = signFinding(buildRefutation(REFUTES, 'contradicting-evidence',
      methodWith(2).method, () => new Date('2026-09-01T00:00:00.000Z')), secretKey);
    const again = signFinding(buildRefutation(REFUTES, 'contradicting-evidence',
      methodWith(4).method, () => new Date('2026-09-02T00:00:00.000Z')), secretKey);
    store.accept(once);
    store.accept(again);
    // Otherwise an author manufactures weight by republishing.
    expect(store.forClaim(REFUTES)).toHaveLength(1);
  });

  it('files a refutation under the claim it contests, not under its own subject', () => {
    store.accept(signRefutation(4));
    const otherVersion = { ...REFUTES, publishedAt: '2026-08-18T00:00:00.000Z' };
    // A refutation is about a claim as it was made, not about a subject forever.
    expect(store.forClaim(otherVersion)).toHaveLength(0);
    expect(store.forClaim(REFUTES)).toHaveLength(1);
  });

  describe('contestedFor', () => {
    const claim = (sourceCount: number) => {
      const a = methodWith(sourceCount, '2026-09-01T00:00:00.000Z');
      return { method: a.method, publishedAt: a.publishedAt };
    };

    it('reports uncontested when nothing disagrees', () => {
      expect(store.contestedFor(claim(4), REFUTES)).toBe('uncontested');
    });

    it('lets one well-evidenced refutation outweigh many weak ones', () => {
      const weakStore = new RefutationStore();
      for (let i = 0; i < 10; i++) weakStore.accept(signRefutation(1));
      const strongStore = new RefutationStore();
      strongStore.accept(signRefutation(4));

      // Ten weak refutations must not beat what one strong one achieves. If
      // count decided, the ten would win; weight decides, so they do not.
      expect(weakStore.forClaim(REFUTES).length).toBeGreaterThan(
        strongStore.forClaim(REFUTES).length);
      const weakest = Math.max(...weakStore.forClaim(REFUTES).map((r) => r.weight));
      const strongest = Math.max(...strongStore.forClaim(REFUTES).map((r) => r.weight));
      expect(strongest).toBeGreaterThan(weakest);
    });

    it('marks a claim refuted only on a decisive margin', () => {
      store.accept(signRefutation(4));
      // Overturning a published claim should need clearly better evidence, not
      // marginally better: a like-for-like refutation contests, never refutes.
      expect(store.contestedFor(claim(4), REFUTES)).toBe('contested');
    });
  });
});
