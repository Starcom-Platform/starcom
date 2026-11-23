import { describe, it, expect } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { PackageComposer } from '../PackageComposer';
import { createEd25519Signer, createMLDSASigner, verifyManifestSignature } from '../signing';

// Deterministic private key for test (DO NOT USE IN PROD)
const TEST_PRIV = '1a'.repeat(32);

function composeTestManifest(overrides: Partial<Parameters<typeof PackageComposer.compose>[0]> = {}) {
  return PackageComposer.compose({
    name: 'Signed Package',
    description: 'test',
    license: 'CC0',
    author: 'tester',
    reports: [],
    intel: [],
    assets: [],
    ...overrides
  }).manifest;
}

describe('signing', () => {
  it('signs and verifies a manifest with Ed25519', async () => {
    const manifest = composeTestManifest();
    const signManifest = createEd25519Signer(TEST_PRIV);
    const signed = await signManifest(manifest);
    expect((signed.metadata as any).signature).toBeDefined();
    expect((signed.metadata as any).signature.alg).toBe('ed25519');
    const ok = await verifyManifestSignature(signed);
    expect(ok).toBe(true);
  });

  // Cycle 7: real ML-DSA-65 (FIPS 204), not a placeholder — this signs the
  // manifest payload as a second, post-quantum-safe integrity proof
  // independent of the outer Nostr event's own Schnorr signature.
  describe('ML-DSA-65 (Cycle 7)', () => {
    it('signs and verifies a manifest', async () => {
      const { secretKey } = ml_dsa65.keygen();
      const manifest = composeTestManifest();
      const signManifest = createMLDSASigner(bytesToHex(secretKey));
      const signed = await signManifest(manifest);

      expect((signed.metadata as any).signature).toBeDefined();
      expect((signed.metadata as any).signature.alg).toBe('ml-dsa-65');
      const ok = await verifyManifestSignature(signed);
      expect(ok).toBe(true);
    });

    it('rejects a signature after the manifest has been tampered with', async () => {
      const { secretKey } = ml_dsa65.keygen();
      const manifest = composeTestManifest();
      const signManifest = createMLDSASigner(bytesToHex(secretKey));
      const signed = await signManifest(manifest);

      const tampered = { ...signed, name: 'Tampered Package Name' };
      const ok = await verifyManifestSignature(tampered);
      expect(ok).toBe(false);
    });

    it('rejects a signature verified against the wrong public key', async () => {
      const { secretKey } = ml_dsa65.keygen();
      const manifest = composeTestManifest();
      const signManifest = createMLDSASigner(bytesToHex(secretKey));
      const signed = await signManifest(manifest);

      const wrongSecretKey = ml_dsa65.keygen().secretKey;
      const wrongPublicKeyHex = bytesToHex(ml_dsa65.getPublicKey(wrongSecretKey));
      const withWrongKey = {
        ...signed,
        metadata: { ...(signed.metadata as any), signature: { ...(signed.metadata as any).signature, pubkey: wrongPublicKeyHex } }
      };
      const ok = await verifyManifestSignature(withWrongKey);
      expect(ok).toBe(false);
    });

    it('rejects a real ML-DSA signature byte string mislabeled as ed25519 rather than crashing', async () => {
      const { secretKey } = ml_dsa65.keygen();
      const manifest = composeTestManifest();
      const mldsaSigned = await createMLDSASigner(bytesToHex(secretKey))(manifest);

      // Relabel a real ML-DSA-65 signature (much longer than Ed25519's
      // fixed 64 bytes) as if it were 'ed25519' — verifyManifestSignature
      // must fail closed (return false), not throw, on a format it wasn't
      // actually produced for.
      const mislabeled = {
        ...mldsaSigned,
        metadata: { ...(mldsaSigned.metadata as any), signature: { ...(mldsaSigned.metadata as any).signature, alg: 'ed25519' } }
      };
      await expect(verifyManifestSignature(mislabeled as any)).resolves.toBe(false);
    });
  });
});
