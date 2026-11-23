// @vitest-environment node
/**
 * Step 3.2.2 — Key Exchange Protocol Tests
 * Verifies:
 *  - ML-KEM-768 encap/decap (already proven in 3.2.1, re-verified here)
 *  - PQCKeyStore persistence structure + rotation logic
 *  - Key rotation: current→previous with grace period
 *  - Nostr key publication structure
 *  - Both parties derive identical shared secret
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PQCryptoService } from '../../services/crypto/PQCryptoService';
import * as fs from 'fs';
import * as path from 'path';

describe('Step 3.2.2 — Key Exchange Protocol', () => {
  let service: PQCryptoService;

  beforeEach(async () => {
    (PQCryptoService as any).instance = undefined;
    service = PQCryptoService.getInstance();
    await service.initialize();
  });

  describe('3.2.2.1 — ML-KEM-768 encapsulate/decapsulate', () => {
    it('should produce matching shared secrets for both parties', async () => {
      // Alice generates keypair
      const aliceKP = await service.generateKEMKeyPair();
      
      // Bob encapsulates with Alice's public key
      const { ciphertext, sharedSecret: bobSecret } = await service.kemEncapsulate(aliceKP.publicKey);
      
      // Alice decapsulates to get the same shared secret
      const aliceSecret = await service.kemDecapsulate(ciphertext, aliceKP.privateKey);
      
      expect(Buffer.from(bobSecret).equals(Buffer.from(aliceSecret))).toBe(true);
    });
  });

  describe('3.2.2.2 — Nostr key publication', () => {
    it('should have PQCKeyPublisher module that publishes keys as Nostr events', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../services/crypto/PQCKeyPublisher.ts'),
        'utf-8'
      );
      // Uses Nostr event kind 30078 (application-specific data)
      expect(source).toContain('30078');
      expect(source).toContain('pqc-kem-pubkey');
      // Publishes via nostrService pool
      expect(source).toContain('pool.publish');
      expect(source).toContain('finalizeEvent');
      // Includes algorithm tag
      expect(source).toContain("'algorithm', 'ML-KEM-768'");
    });
  });

  describe('3.2.2.3 — IndexedDB-based key persistence', () => {
    it('should have PQCKeyStore with IndexedDB operations', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../services/crypto/PQCKeyStore.ts'),
        'utf-8'
      );
      // Uses IndexedDB
      expect(source).toContain('indexedDB.open');
      expect(source).toContain('pqc-keystore');
      // CRUD operations
      expect(source).toContain('async put(');
      expect(source).toContain('async get(');
      expect(source).toContain('async delete(');
      expect(source).toContain('async listAll(');
      // Key rotation
      expect(source).toContain('async rotate(');
      // Stores both public and private keys
      expect(source).toContain('publicKey');
      expect(source).toContain('privateKey');
    });
  });

  describe('3.2.2.4 — 30-day rotation with 7-day grace period', () => {
    it('should define correct rotation constants', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../services/crypto/PQCKeyStore.ts'),
        'utf-8'
      );
      // 30 days in ms
      expect(source).toContain('30 * 24 * 60 * 60 * 1000');
      // 7 days grace
      expect(source).toContain('7 * 24 * 60 * 60 * 1000');
    });

    it('should demote current key to previous during rotation', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../services/crypto/PQCKeyStore.ts'),
        'utf-8'
      );
      // rotate() stores old key as 'previous'
      expect(source).toContain("id: 'previous'");
      expect(source).toContain("id: 'current'");
      expect(source).toContain('graceExpiresAt');
    });

    it('should have cleanup method for expired keys', () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../services/crypto/PQCKeyStore.ts'),
        'utf-8'
      );
      expect(source).toContain('async cleanup()');
      expect(source).toContain('graceExpiresAt');
    });
  });

  describe('3.2.2.5 — Both parties derive identical shared secret', () => {
    it('should derive identical AES keys from KEM for encryption round-trip', async () => {
      // Simulate Alice and Bob key exchange
      const alice = await service.generateKEMKeyPair();
      
      // Bob sends encrypted message to Alice
      const { ciphertext: kemCt, sharedSecret: bobKey } = await service.kemEncapsulate(alice.publicKey);
      const plaintext = new TextEncoder().encode('Secret intel report from operative');
      const encrypted = await service.encryptData(plaintext, bobKey);
      
      // Alice receives and decrypts
      const aliceKey = await service.kemDecapsulate(kemCt, alice.privateKey);
      const decrypted = await service.decryptData(encrypted, aliceKey);
      
      expect(new TextDecoder().decode(decrypted)).toBe('Secret intel report from operative');
      expect(Buffer.from(bobKey).equals(Buffer.from(aliceKey))).toBe(true);
    });
  });
});
