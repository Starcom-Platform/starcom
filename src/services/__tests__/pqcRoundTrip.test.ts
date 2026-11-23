// @vitest-environment node
/**
 * 3.4.3.3 — PQC Encrypt/Decrypt Round-Trip with Deterministic Validation
 *
 * Uses the actual ML-KEM-768 implementation (mlkem package) and AES-256-GCM
 * via Web Crypto to verify end-to-end encrypt→decrypt round-trips.
 *
 * Note: NIST ACVP test vectors for ML-KEM are 100+ KB each. Instead we use
 * the library's own self-consistency: same shared secret from encap/decap,
 * same plaintext after AES-GCM encrypt→decrypt, and verify byte lengths
 * match the FIPS 203 specification.
 */
import { describe, it, expect } from 'vitest';
import { MlKem768 } from 'mlkem';

// FIPS 203 ML-KEM-768 constants
const ML_KEM_768_PK_BYTES = 1184;
const ML_KEM_768_SK_BYTES = 2400;
const ML_KEM_768_CT_BYTES = 1088;
const ML_KEM_768_SS_BYTES = 32;

describe('PQC encrypt/decrypt round-trip — ML-KEM-768 + AES-256-GCM', () => {
  const kem = new MlKem768();

  // -----------------------------------------------
  // 1. Key generation produces correct byte lengths
  // -----------------------------------------------
  it('generates keypair with FIPS 203 ML-KEM-768 spec lengths', async () => {
    const [pk, sk] = await kem.generateKeyPair();
    expect(pk.byteLength).toBe(ML_KEM_768_PK_BYTES);
    expect(sk.byteLength).toBe(ML_KEM_768_SK_BYTES);
  });

  // -----------------------------------------------
  // 2. Encapsulation produces correct lengths
  // -----------------------------------------------
  it('encap produces ciphertext (1088 B) and shared secret (32 B)', async () => {
    const [pk] = await kem.generateKeyPair();
    const [ct, ss] = await kem.encap(pk);
    expect(ct.byteLength).toBe(ML_KEM_768_CT_BYTES);
    expect(ss.byteLength).toBe(ML_KEM_768_SS_BYTES);
  });

  // -----------------------------------------------
  // 3. Decapsulation recovers identical shared secret
  // -----------------------------------------------
  it('decap recovers identical shared secret', async () => {
    const [pk, sk] = await kem.generateKeyPair();
    const [ct, ssEncap] = await kem.encap(pk);
    const ssDecap = await kem.decap(ct, sk);
    expect(Buffer.from(ssDecap)).toEqual(Buffer.from(ssEncap));
  });

  // -----------------------------------------------
  // 4. Wrong secret key produces different shared secret
  // -----------------------------------------------
  it('wrong SK produces different shared secret', async () => {
    const [pk1, _sk1] = await kem.generateKeyPair();
    const [_pk2, sk2] = await kem.generateKeyPair();
    const [ct, ssCorrect] = await kem.encap(pk1);
    const ssWrong = await kem.decap(ct, sk2);
    // ML-KEM implicit rejection: returns a pseudorandom SS, not the same one
    expect(Buffer.from(ssWrong)).not.toEqual(Buffer.from(ssCorrect));
  });

  // -----------------------------------------------
  // 5. Two encapsulations of same PK produce different SS
  // -----------------------------------------------
  it('two encaps of same PK produce different shared secrets (randomized)', async () => {
    const [pk] = await kem.generateKeyPair();
    const [, ss1] = await kem.encap(pk);
    const [, ss2] = await kem.encap(pk);
    expect(Buffer.from(ss1)).not.toEqual(Buffer.from(ss2));
  });

  // -----------------------------------------------
  // 6. AES-256-GCM round-trip with ML-KEM shared secret
  // -----------------------------------------------
  it('AES-256-GCM encrypt→decrypt round-trip using ML-KEM shared secret', async () => {
    const [pk, sk] = await kem.generateKeyPair();
    const [ct, ssEncap] = await kem.encap(pk);
    const ssDecap = await kem.decap(ct, sk);

    // Import shared secret as AES-256-GCM key
    const key = await crypto.subtle.importKey(
      'raw', ssEncap, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('CLASSIFIED: eyes only');

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, plaintext
    );

    // Decrypt with the decap shared secret (should be identical)
    const decKey = await crypto.subtle.importKey(
      'raw', ssDecap, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, decKey, ciphertext
    );

    expect(new TextDecoder().decode(decrypted)).toBe('CLASSIFIED: eyes only');
  });

  // -----------------------------------------------
  // 7. Tampered ciphertext fails AES-GCM integrity check
  // -----------------------------------------------
  it('tampered AES-GCM ciphertext throws on decrypt', async () => {
    const [pk, sk] = await kem.generateKeyPair();
    const [ct, ss] = await kem.encap(pk);
    const ssD = await kem.decap(ct, sk);

    const key = await crypto.subtle.importKey(
      'raw', ss, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('test'))
    );

    // Tamper with ciphertext
    encrypted[0] ^= 0xff;

    const decKey = await crypto.subtle.importKey(
      'raw', ssD, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
    );
    await expect(
      crypto.subtle.decrypt({ name: 'AES-GCM', iv }, decKey, encrypted)
    ).rejects.toThrow();
  });

  // -----------------------------------------------
  // 8. Multiple sequential round-trips all succeed
  // -----------------------------------------------
  it('5 sequential round-trips all produce correct decryption', async () => {
    for (let i = 0; i < 5; i++) {
      const [pk, sk] = await kem.generateKeyPair();
      const [ct, ss] = await kem.encap(pk);
      const ssD = await kem.decap(ct, sk);
      expect(Buffer.from(ssD)).toEqual(Buffer.from(ss));
    }
  });
});
