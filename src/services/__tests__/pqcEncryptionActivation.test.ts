// @vitest-environment node
/**
 * Step 3.2.1 — PQC Encryption Activation Tests
 * Verifies:
 *  - AES-256-GCM replaces XOR cipher
 *  - ML-KEM-768 key generation produces valid sizes
 *  - KEM encap/decap produces matching shared secrets
 *  - Encrypt → decrypt round-trip preserves plaintext
 *  - Wrong key fails decryption
 *  - Signing and verification work correctly
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PQCryptoService } from '../../services/crypto/PQCryptoService';

describe('Step 3.2.1 — PQC Encryption Activation', () => {
  let service: PQCryptoService;

  beforeEach(async () => {
    // Reset singleton for test isolation
    (PQCryptoService as any).instance = undefined;
    service = PQCryptoService.getInstance();
    await service.initialize();
  });

  describe('ML-KEM-768 Key Generation', () => {
    it('should generate a real ML-KEM-768 keypair with correct sizes', async () => {
      const kp = await service.generateKEMKeyPair();
      expect(kp.algorithm).toBe('ML-KEM-768');
      // ML-KEM-768: pk=1184 bytes, sk=2400 bytes
      expect(kp.publicKey.length).toBe(1184);
      expect(kp.privateKey.length).toBe(2400);
    });

    it('should generate unique keypairs each call', async () => {
      const kp1 = await service.generateKEMKeyPair();
      const kp2 = await service.generateKEMKeyPair();
      expect(Buffer.from(kp1.publicKey).equals(Buffer.from(kp2.publicKey))).toBe(false);
    });
  });

  describe('ML-KEM-768 Encap/Decap', () => {
    it('should produce matching shared secrets', async () => {
      const kp = await service.generateKEMKeyPair();
      const { ciphertext, sharedSecret: ss1 } = await service.kemEncapsulate(kp.publicKey);
      const ss2 = await service.kemDecapsulate(ciphertext, kp.privateKey);
      
      expect(ss1.length).toBe(32);
      expect(ss2.length).toBe(32);
      expect(Buffer.from(ss1).equals(Buffer.from(ss2))).toBe(true);
    });

    it('should produce different shared secrets for different encapsulations', async () => {
      const kp = await service.generateKEMKeyPair();
      const { sharedSecret: ss1 } = await service.kemEncapsulate(kp.publicKey);
      const { sharedSecret: ss2 } = await service.kemEncapsulate(kp.publicKey);
      expect(Buffer.from(ss1).equals(Buffer.from(ss2))).toBe(false);
    });
  });

  describe('AES-256-GCM encryption', () => {
    it('should encrypt→decrypt round-trip successfully', async () => {
      const plaintext = new TextEncoder().encode('Hello, quantum-resistant world!');
      const key = crypto.getRandomValues(new Uint8Array(32));
      
      const encrypted = await service.encryptData(plaintext, key);
      const decrypted = await service.decryptData(encrypted, key);
      
      expect(new TextDecoder().decode(decrypted)).toBe('Hello, quantum-resistant world!');
    });

    it('should produce ciphertext different from plaintext', async () => {
      const plaintext = new TextEncoder().encode('secret message');
      const key = crypto.getRandomValues(new Uint8Array(32));
      
      const encrypted = await service.encryptData(plaintext, key);
      // Encrypted should be longer (IV + ciphertext + auth tag)
      expect(encrypted.length).toBeGreaterThan(plaintext.length);
      // Content should differ
      expect(Buffer.from(encrypted).equals(Buffer.from(plaintext))).toBe(false);
    });

    it('should fail decryption with wrong key', async () => {
      const plaintext = new TextEncoder().encode('secret');
      const key1 = crypto.getRandomValues(new Uint8Array(32));
      const key2 = crypto.getRandomValues(new Uint8Array(32));
      
      const encrypted = await service.encryptData(plaintext, key1);
      
      await expect(service.decryptData(encrypted, key2)).rejects.toThrow();
    });

    it('should use ML-KEM shared secret as AES key for full round-trip', async () => {
      const kp = await service.generateKEMKeyPair();
      const { ciphertext: kemCt, sharedSecret } = await service.kemEncapsulate(kp.publicKey);
      
      const plaintext = new TextEncoder().encode('Quantum-secured message');
      const encrypted = await service.encryptData(plaintext, sharedSecret);
      
      // Receiver decapsulates to get the same shared secret
      const receiverSecret = await service.kemDecapsulate(kemCt, kp.privateKey);
      const decrypted = await service.decryptData(encrypted, receiverSecret);
      
      expect(new TextDecoder().decode(decrypted)).toBe('Quantum-secured message');
    });
  });

  describe('Ed25519 signing', () => {
    it('should sign and verify a message', async () => {
      const sigKp = await service.generateSignatureKeyPair();
      const message = new TextEncoder().encode('signed document');
      
      const signature = await service.signMessage(message, sigKp.privateKey);
      const valid = await service.verifySignature(signature, message, sigKp.publicKey);
      
      expect(valid).toBe(true);
    });

    it('should reject tampered message', async () => {
      const sigKp = await service.generateSignatureKeyPair();
      const message = new TextEncoder().encode('original');
      
      const signature = await service.signMessage(message, sigKp.privateKey);
      
      const tampered = new TextEncoder().encode('tampered');
      const valid = await service.verifySignature(signature, tampered, sigKp.publicKey);
      
      expect(valid).toBe(false);
    });
  });

  describe('No XOR cipher', () => {
    it('should NOT contain XOR-based encryption in source', async () => {
      // Read the source to verify no XOR patterns remain
      const fs = await import('fs');
      const path = await import('path');
      const source = fs.readFileSync(
        path.resolve(__dirname, '../../services/crypto/PQCryptoService.ts'),
        'utf-8'
      );
      // No XOR encryption pattern
      expect(source).not.toContain('data[i] ^ key[i % key.length]');
      expect(source).not.toContain('byte ^ key[i % key.length]');
      // Should use AES-GCM
      expect(source).toContain('AES-GCM');
      expect(source).toContain('MlKem768');
    });
  });

  describe('Protected data round-trip', () => {
    it('should encrypt and decrypt protected data', async () => {
      const { data: encrypted, key } = await service.encryptProtectedData(
        'Intelligence report body'
      );

      expect(encrypted.metadata.algorithm).toBe('ML-KEM-768+AES-256-GCM');

      const decrypted = await service.decryptProtectedData(encrypted, key);

      expect(decrypted).toBe('Intelligence report body');
    });

    /**
     * Replaces 'should reject wrong classification level', which encrypted at
     * Secret, asked to decrypt at Unclassified, and asserted 'Access denied'.
     *
     * The check it exercised compared a tier stored inside the envelope against
     * a tier the caller passed in — both supplied by the same caller — so it
     * gated nothing. The test passed and proved nothing about access.
     *
     * The real gate is the key, which the test below this one already asserts
     * is not bundled with the payload. This asserts the other half: holding
     * SOME key is not enough, it has to be the right one.
     */
    it('should reject a key belonging to a different payload', async () => {
      const { data: encrypted } = await service.encryptProtectedData('Secret data');
      const { key: unrelatedKey } = await service.encryptProtectedData('Other data');

      await expect(
        service.decryptProtectedData(encrypted, unrelatedKey)
      ).rejects.toThrow();
    });

    it('should not be decryptable without the separately-returned key', async () => {
      const { data: encrypted } = await service.encryptProtectedData('Sensitive payload');
      // The encrypted payload alone carries no decryption key — confirms the fix for
      // the previous design, which embedded the KEM private key in this same object.
      expect((encrypted.metadata as Record<string, unknown>).kemPrivateKey).toBeUndefined();
    });
  });
});
