import { describe, it, expect } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { bytesToHex } from '@noble/hashes/utils';
import { signFinding, verifyFindingSignature } from '../signFinding';
import { buildFindingAttestation } from '../FindingContent';
import type { CorroboratedFinding } from '../../../../applications/intelanalyzer/state/correlationUtils';

function makeFinding(): CorroboratedFinding {
  return {
    entityRef: 'John Smith',
    attribute: 'location',
    value: { lat: 40.7128, lon: -74.006 },
    confidence: 0.81,
    sourceCount: 3,
    algorithmVersion: 2
  };
}

describe('signFinding (ML-DSA-65)', () => {
  it('signs and verifies a finding', () => {
    const { secretKey } = ml_dsa65.keygen();
    const content = buildFindingAttestation(makeFinding(), { modality: 'inference', weakBacking: [] }, () => new Date('2026-08-17T00:00:00.000Z'));
    const signed = signFinding(content, secretKey);

    expect(signed.signature.alg).toBe('ml-dsa-65');
    expect(signed.signature.pubkey).toBe(bytesToHex(ml_dsa65.getPublicKey(secretKey)));
    expect(verifyFindingSignature(signed)).toBe(true);
  });

  it('rejects a signature after the content has been tampered with', () => {
    const { secretKey } = ml_dsa65.keygen();
    const content = buildFindingAttestation(makeFinding(), { modality: 'inference', weakBacking: [],});
    const signed = signFinding(content, secretKey);

    const tampered = { ...signed, content: { ...signed.content, confidence: 0.99 } };
    expect(verifyFindingSignature(tampered)).toBe(false);
  });

  it('rejects a signature verified against the wrong public key', () => {
    const { secretKey } = ml_dsa65.keygen();
    const content = buildFindingAttestation(makeFinding(), { modality: 'inference', weakBacking: [],});
    const signed = signFinding(content, secretKey);

    const wrongPubkey = bytesToHex(ml_dsa65.getPublicKey(ml_dsa65.keygen().secretKey));
    const withWrongKey = { ...signed, signature: { ...signed.signature, pubkey: wrongPubkey } };
    expect(verifyFindingSignature(withWrongKey)).toBe(false);
  });

  it('fails closed (returns false, does not throw) on a malformed signature block', () => {
    const { secretKey } = ml_dsa65.keygen();
    const content = buildFindingAttestation(makeFinding(), { modality: 'inference', weakBacking: [],});
    const signed = signFinding(content, secretKey);

    const malformed = { ...signed, signature: { ...signed.signature, sig: 'not-hex-!!' } };
    expect(() => verifyFindingSignature(malformed)).not.toThrow();
    expect(verifyFindingSignature(malformed)).toBe(false);
  });
});
