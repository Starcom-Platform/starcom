// Post-Quantum Cryptography Service
//
// Until 2026-09-09 this file, its class, and its log prefix were all named
// after a US combatant command. The affiliation was asserted by the FILENAME,
// which is why 19 of the 25 files naming that command named it only by
// importing this one. Starcom is not governmental and no such body uses it.
//
// The command is not named here on purpose: guard-no-institutional-claims.mjs
// does not strip comments, precisely because a comment in an open-source
// repository is published text. It caught this note on the first attempt.
//
// What the file can honestly say is below and unchanged: ML-KEM-768 (FIPS 203)
// for key encapsulation, AES-256-GCM for encryption. Those are checkable from
// the source, which is the difference between a standard and an affiliation.
// Uses ML-KEM-768 (FIPS 203) for key encapsulation + AES-256-GCM for encryption

import { createLogger } from '@utils/logger';
import { MlKem768 } from 'mlkem';
import * as ed25519 from '@noble/ed25519';
const log = createLogger({ prefix: 'PQCryptoService' });

/*
 * ─── A ClassificationLevel ENUM STOOD HERE ──────────────────────────────────
 *
 * Unclassified / Confidential / Secret / TopSecret. It did exactly two things:
 * it parameterised encryptProtectedData, and it was written into the ciphertext
 * envelope so that decryptProtectedData could compare it against itself. Both
 * uses are gone. See the note on decryptProtectedData for why the comparison
 * was worse than useless.
 *
 * The remaining type names below keep the word "Protected" rather than
 * "Classified": what these describe is content encrypted at rest because
 * publishing it could cost somebody something, which is a property of the
 * content and not a clearance anybody holds.
 */

export interface ProtectedData {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  metadata: {
    timestamp: number;
    algorithm: string;
    /** KEM encapsulation — safe to store/transmit alongside the ciphertext. */
    kemCiphertext: number[];
    /**
     * Legacy. Records encrypted before the classification purge carry a tier
     * string here. ACCEPTED ON READ so anything already sitting in a local
     * store stays decryptable; never written, and never consulted for any
     * decision.
     */
    classification?: string;
  };
}

/** @deprecated Renamed to ProtectedData. Kept so existing imports compile. */
export type ClassifiedData = ProtectedData;

/**
 * Decryption key for a ProtectedData payload. MUST be stored separately from the
 * ProtectedData itself (different storage, transport, and access control) — anyone
 * who obtains both the payload and this key can decrypt, so shipping them together
 * defeats the encryption entirely. See encryptProtectedData/decryptProtectedData.
 *
 * This — possession of `kemPrivateKey` — is the access control. It always was;
 * the tier check that used to sit alongside it added nothing.
 */
export interface ProtectedDataKey {
  kemPrivateKey: Uint8Array;
}

/** @deprecated Renamed to ProtectedDataKey. Kept so existing imports compile. */
export type ClassifiedDataKey = ProtectedDataKey;

export interface QuantumKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  algorithm: string;
}

export interface QuantumSignatureKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  algorithm: string;
}

export interface QuantumSignature {
  signature: Uint8Array;
  algorithm: string;
  timestamp: number;
}

/** AES-256-GCM encrypted payload: iv (12 bytes) prepended to ciphertext */
const IV_LENGTH = 12;

/**
 * Post-Quantum Cryptography Service
 * - Key encapsulation: ML-KEM-768 (FIPS 203) via mlkem
 * - Symmetric encryption: AES-256-GCM via Web Crypto API
 * - Signing: Ed25519 (real asymmetric signatures — classical, not post-quantum; no
 *   vetted ML-DSA-65 implementation is available as a project dependency yet. This
 *   replaces the previous HMAC-SHA-256 scheme, whose "public" and "private" keys were
 *   the same raw bytes — anyone who could verify a signature could also forge one.
 *   Swap this for a real ML-DSA implementation when one is adopted.)
 */
export class PQCryptoService {
  private static instance: PQCryptoService;
  private kem: MlKem768 = new MlKem768();
  
  public static getInstance(): PQCryptoService {
    if (!PQCryptoService.instance) {
      PQCryptoService.instance = new PQCryptoService();
    }
    return PQCryptoService.instance;
  }

  async initialize(): Promise<void> {
    log.debug('PQC Service initialized (ML-KEM-768 + AES-256-GCM)');
  }

  /**
   * Generate a real ML-KEM-768 keypair (FIPS 203).
   * Public key: 1184 bytes, Secret key: 2400 bytes.
   */
  async generateKEMKeyPair(): Promise<QuantumKeyPair> {
    const [publicKey, privateKey] = await this.kem.generateKeyPair();
    return { publicKey, privateKey, algorithm: 'ML-KEM-768' };
  }

  /**
   * Generate a real Ed25519 signing keypair. publicKey and privateKey are genuinely
   * distinct — the public key can be freely distributed without enabling forgery.
   */
  async generateSignatureKeyPair(): Promise<QuantumSignatureKeyPair> {
    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = await ed25519.getPublicKeyAsync(privateKey);
    return { publicKey, privateKey, algorithm: 'Ed25519' };
  }

  /**
   * ML-KEM-768 encapsulation: produces ciphertext + 32-byte shared secret.
   */
  async kemEncapsulate(publicKey: Uint8Array): Promise<{ciphertext: Uint8Array, sharedSecret: Uint8Array}> {
    const [ciphertext, sharedSecret] = await this.kem.encap(publicKey);
    return { ciphertext, sharedSecret };
  }

  /**
   * ML-KEM-768 decapsulation: recovers shared secret from ciphertext.
   */
  async kemDecapsulate(ciphertext: Uint8Array, privateKey: Uint8Array): Promise<Uint8Array> {
    return await this.kem.decap(ciphertext, privateKey);
  }

  /**
   * Sign a message with Ed25519. Deterministic per RFC 8032 — signing the same
   * message with the same key always yields the same signature.
   */
  async signMessage(message: Uint8Array, privateKey: Uint8Array): Promise<QuantumSignature> {
    const signature = await ed25519.signAsync(message, privateKey);
    return {
      signature,
      algorithm: 'Ed25519',
      timestamp: Date.now()
    };
  }

  /**
   * Verify an Ed25519 signature. Unlike the previous HMAC scheme, knowing the public
   * key used here does not let an attacker forge new signatures.
   */
  async verifySignature(signature: QuantumSignature, message: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
    return ed25519.verifyAsync(signature.signature, message, publicKey);
  }

  /**
   * Encrypt data with AES-256-GCM. Key must be 32 bytes (e.g. from KEM shared secret).
   * Returns iv (12 bytes) + ciphertext concatenated.
   */
  async encryptData(data: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const aesKey = await crypto.subtle.importKey(
      'raw', key, { name: 'AES-GCM' }, false, ['encrypt']
    );
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      data
    );
    // Prepend IV to ciphertext
    const result = new Uint8Array(IV_LENGTH + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), IV_LENGTH);
    return result;
  }

  /**
   * Decrypt AES-256-GCM data. Input = iv (12 bytes) + ciphertext.
   */
  async decryptData(encryptedData: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    const iv = encryptedData.slice(0, IV_LENGTH);
    const ciphertext = encryptedData.slice(IV_LENGTH);
    const aesKey = await crypto.subtle.importKey(
      'raw', key, { name: 'AES-GCM' }, false, ['decrypt']
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext
    );
    return new Uint8Array(decrypted);
  }

  /**
   * Encrypt protected data with ML-KEM-768 + AES-256-GCM.
   *
   * Generates an ephemeral KEM keypair, uses the shared secret as the AES key. The
   * returned `data.metadata` (ciphertext + KEM encapsulation) is safe to store or
   * transmit alongside the ciphertext, but `key.kemPrivateKey` is the only thing that
   * can decrypt it and MUST be stored separately (e.g. a local keystore, not the same
   * object/document/channel as `data`) — bundling both together, as this method
   * previously did, means anyone who obtains the "encrypted" payload can decrypt it.
   *
   * Took a `level: ClassificationLevel` second argument, stamped into the
   * envelope purely so the decrypt path could compare it with itself.
   */
  async encryptProtectedData(
    data: string
  ): Promise<{ data: ProtectedData; key: ProtectedDataKey }> {
    const dataBytes = new TextEncoder().encode(data);
    const keyPair = await this.generateKEMKeyPair();
    const { ciphertext: kemCt, sharedSecret } = await this.kemEncapsulate(keyPair.publicKey);
    const encrypted = await this.encryptData(dataBytes, sharedSecret);

    return {
      data: {
        ciphertext: encrypted,
        iv: encrypted.slice(0, IV_LENGTH),
        metadata: {
          timestamp: Date.now(),
          algorithm: 'ML-KEM-768+AES-256-GCM',
          kemCiphertext: Array.from(kemCt),
        }
      },
      key: { kemPrivateKey: keyPair.privateKey }
    };
  }

  /**
   * Decrypt using KEM decapsulation + AES-256-GCM. Requires the
   * ProtectedDataKey returned separately by encryptProtectedData.
   *
   * ─── THE CLEARANCE CHECK THAT USED TO OPEN THIS METHOD ───────────────────
   *
   *   if (encryptedData.metadata.classification !== requiredLevel) {
   *     throw new Error('Access denied: insufficient clearance level. ...');
   *   }
   *
   * It compared a label stored INSIDE the envelope being decrypted against a
   * label the caller passed in. The caller supplied both sides, and possession
   * of `key.kemPrivateKey` was the only thing that ever actually gated
   * anything — so the check granted nothing and denied nothing, while phrasing
   * its failure as an access-control decision.
   *
   * Its one real effect was breaking legitimate reads. Because it demanded an
   * EXACT match, changing a record's level made every subsequent read fail
   * with "Access denied" against data the operator owned and held the key for.
   * IntelWorkspaceManager still carries the comment describing that.
   *
   * Removed rather than relaxed: anything layered on top of key possession
   * inside the same envelope is decoration.
   */
  async decryptProtectedData(
    encryptedData: ProtectedData,
    key: ProtectedDataKey
  ): Promise<string> {
    const kemCt = new Uint8Array(encryptedData.metadata.kemCiphertext);
    const sharedSecret = await this.kemDecapsulate(kemCt, key.kemPrivateKey);
    const decrypted = await this.decryptData(encryptedData.ciphertext, sharedSecret);
    return new TextDecoder().decode(decrypted);
  }
}

// Export singleton instance
export const pqCryptoService = PQCryptoService.getInstance();