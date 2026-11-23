/**
 * A claim it cannot check is not a claim it can refute.
 *
 * The specification says an implementation meeting a signature algorithm it does
 * not implement must treat the claim as "unverified rather than as invalid, and
 * MUST NOT discard it". All three verifiers in this repository — peer.mjs,
 * conformance.mjs and verify-finding.mjs — called ml_dsa65.verify
 * unconditionally, ignoring `signature.alg`. So a claim signed with any other
 * primitive read as INVALID: a verdict delivered on evidence never examined.
 *
 * A rule stated in our own document, unimplemented in our own reference code.
 * These assert the three states so it cannot quietly return to two.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { bytesToHex } from '@noble/hashes/utils';
// @ts-expect-error — peer.mjs is untyped by design: it imports no app code, so
// that it can stand as an independent implementation of the published spec.
import * as peer from '../peer/peer.mjs';

const content = {
  schemaVersion: 2,
  claim: { subjectRef: 'gb:1', subjectKind: 'organization', attribute: 'a', value: 'v' },
  method: {
    algorithm: 'attribute-corroboration', algorithmVersion: 1, criteria: 'c',
    sourceCount: 3, observedFrom: '2026-01-01T00:00:00.000Z', observedTo: '2026-01-01T00:00:00.000Z',
    timePrecisionMs: 86400000, parameters: {}, modality: 'record-linkage', weakBacking: [],
  },
  publishedAt: '2026-01-02T00:00:00.000Z',
};

const signed = () => {
  const keys = ml_dsa65.keygen(new Uint8Array(32).fill(7));
  return peer.signClaim(content, keys.secretKey);
};

describe('verifySignature — three states, not two', () => {
  it('valid: checked, and it holds', () => {
    const s = peer.verifySignature(signed());
    expect(s.state).toBe('valid');
    expect(s.alg).toBe('ml-dsa-65');
  });

  it('invalid: checked, and it does not hold', () => {
    const s = signed();
    s.content = { ...content, claim: { ...content.claim, value: 'tampered' } };
    expect(peer.verifySignature(s).state).toBe('invalid');
  });

  it('UNVERIFIED for an algorithm this implementation does not implement', () => {
    // The case the spec is about, and the one that used to read as "invalid".
    const s = signed();
    s.signature = { ...s.signature, alg: 'ed25519' };
    const r = peer.verifySignature(s);
    expect(r.state).toBe('unverified');
    expect(r.alg).toBe('ed25519');
    expect(r.detail).toContain('not thereby false');
  });

  it('invalid when no algorithm is declared at all', () => {
    // Distinct from the case above: an absent algorithm is a malformed
    // signature block, not an unfamiliar primitive.
    const s = signed();
    s.signature = { ...s.signature, alg: undefined };
    expect(peer.verifySignature(s).state).toBe('invalid');
  });

  it('invalid, not thrown, on malformed signature material', () => {
    const s = signed();
    s.signature = { ...s.signature, sig: 'not-hex' };
    expect(() => peer.verifySignature(s)).not.toThrow();
    expect(peer.verifySignature(s).state).toBe('invalid');
  });

  it('the boolean form keeps its old conservative meaning', () => {
    /*
     * verifyClaim has four callers deciding whether to ACCEPT. For them,
     * anything not positively verified must answer false — including the
     * unverified case. The spec's rule is about not REPORTING a claim as
     * refuted, which only a caller that reports to a human can get wrong.
     */
    expect(peer.verifyClaim(signed())).toBe(true);
    const unknown = signed();
    unknown.signature = { ...unknown.signature, alg: 'ed25519' };
    expect(peer.verifyClaim(unknown)).toBe(false);
  });
});
