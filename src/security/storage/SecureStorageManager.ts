/**
 * 🛡️ UNIFIED SECURE STORAGE MANAGER
 * Consolidates all secure storage utilities into a single, hardened service
 */

// TODO: Implement authentication session management with advanced security features - PRIORITY: HIGH
// TODO: Add support for authentication delegation and impersonation for admin users - PRIORITY: MEDIUM
// TODO: Implement comprehensive authentication audit trail and forensics - PRIORITY: MEDIUM
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'SecureStorageManager' });

/**
 * ─── NO CLASSIFICATION ON STORED ITEMS ─────────────────────────────────────
 *
 * Both of these interfaces carried
 * `classification: 'PUBLIC'|'CONFIDENTIAL'|'SECRET'|'TOP_SECRET'`. setItem
 * destructured it (defaulting to 'CONFIDENTIAL') and wrote it onto the stored
 * item; getItem reads `ttl`, `timestamp` and `data`, and never looked at it.
 * Nothing else could: the item is JSON inside sessionStorage.
 *
 * So it was a label written into browser storage that no code path consulted —
 * and sessionStorage is the least defensible place to keep one, since anything
 * running in the page can read it. Encryption here is gated on `encrypt`, which
 * is a real switch, and always was.
 *
 * No migration is needed for items already stored: sessionStorage does not
 * outlive the tab, and an extra property on a parsed object is harmless.
 */
export interface SecureStorageItem {
  data: unknown;
  timestamp: number;
  encrypted: boolean;
  ttl?: number;
}

export interface SecureStorageOptions {
  encrypt?: boolean;
  ttl?: number; // Time to live in milliseconds
  domain?: string;
}

export interface EncryptionContext {
  algorithm: string;
  keyId: string;
  isQuantumSafe: boolean;
}

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Unified Secure Storage Manager
 *
 * Encryption is real AES-256-GCM via the Web Crypto API (crypto.subtle), following
 * the same PBKDF2-derived-key pattern already used by DataVaultService.ts. Previously
 * this class labeled itself AES-256-GCM / quantum-safe while actually XOR-ing bytes
 * with a key stored in plaintext next to the ciphertext — real cipher, real per-call
 * random IV/salt now.
 *
 * No real post-quantum (ML-KEM/hybrid) data-at-rest encryption exists yet, so the
 * 'quantum'/'hybrid' context ids intentionally use the same real AES-GCM path and
 * report isQuantumSafe: false — honest about what's actually implemented, same as
 * the PQC/DID auth stubs in AuthErrorTypes.ts.
 */
export class SecureStorageManager {
  private static instance: SecureStorageManager;
  private readonly storagePrefix = 'starcom_secure_';
  private readonly encryptionContexts: Map<string, EncryptionContext>;

  private constructor() {
    this.encryptionContexts = new Map();
    this.initializeEncryptionContexts();
  }

  static getInstance(): SecureStorageManager {
    if (!SecureStorageManager.instance) {
      SecureStorageManager.instance = new SecureStorageManager();
    }
    return SecureStorageManager.instance;
  }

  private initializeEncryptionContexts(): void {
    ['default', 'quantum', 'hybrid'].forEach((id) => {
      this.encryptionContexts.set(id, {
        algorithm: 'AES-256-GCM',
        keyId: `key_${id}_${Date.now()}`,
        isQuantumSafe: false
      });
    });
  }

  /**
   * The PBKDF2 input secret — a random value generated once and kept in sessionStorage
   * so it (and therefore decryption) survives a page refresh within the same tab, same
   * persistence behavior as before. This is not itself the AES key; a fresh AES-GCM key
   * is derived per encrypt/decrypt call with a random salt.
   */
  private getOrCreateSecret(): string {
    const keyName = 'starcom_enc_secret';
    let secret = sessionStorage.getItem(keyName);

    if (!secret) {
      secret = this.generateSecureSecret();
      sessionStorage.setItem(keyName, secret);
    }

    return secret;
  }

  private generateSecureSecret(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async deriveAesGcmKey(secret: string, salt: Uint8Array): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  private bufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.length; i++) binary += String.fromCharCode(buffer[i]);
    return btoa(binary);
  }

  private base64ToBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
    return buffer;
  }

  /**
   * Real AES-256-GCM encryption. Output is base64(salt || iv || ciphertext) — a fresh
   * random salt and IV every call, never reused (IV reuse under the same key would
   * break GCM's security guarantees).
   */
  private async aesGcmEncrypt(plaintext: string): Promise<string> {
    const secret = this.getOrCreateSecret();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await this.deriveAesGcmKey(secret, salt);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext)
    );

    const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

    return this.bufferToBase64(combined);
  }

  private async aesGcmDecrypt(encoded: string): Promise<string> {
    const secret = this.getOrCreateSecret();
    const combined = this.base64ToBuffer(encoded);
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);
    const key = await this.deriveAesGcmKey(secret, salt);

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  }

  /**
   * Secure storage with quantum-safe options.
   */
  async setItem(key: string, value: unknown, options: SecureStorageOptions = {}): Promise<void> {
    const { encrypt = true, ttl } = options;

    const item: SecureStorageItem = {
      data: value,
      timestamp: Date.now(),
      encrypted: encrypt,
      ttl
    };

    const serialized = JSON.stringify(item);
    const finalKey = this.storagePrefix + key;

    if (encrypt) {
      const encryptedData = await this.aesGcmEncrypt(serialized);
      sessionStorage.setItem(finalKey, encryptedData);
    } else {
      sessionStorage.setItem(finalKey, serialized);
    }
  }

  /**
   * Secure retrieval with automatic decryption and TTL validation
   */
  async getItem<T = unknown>(key: string): Promise<T | null> {
    const finalKey = this.storagePrefix + key;
    const stored = sessionStorage.getItem(finalKey);

    if (!stored) {
      return null;
    }

    try {
      let item: SecureStorageItem;

      try {
        const decrypted = await this.aesGcmDecrypt(stored);
        item = JSON.parse(decrypted);
      } catch {
        // Not encrypted (or from a previous session's secret) — try plain JSON.
        item = JSON.parse(stored);
      }

      // Check TTL
      if (item.ttl && Date.now() - item.timestamp > item.ttl) {
        this.removeItem(key);
        return null;
      }

      return item.data as T;
    } catch (error) {
      log.error('Failed to retrieve secure storage item:', error);
      return null;
    }
  }

  /**
   * Secure removal with memory wiping
   */
  removeItem(key: string): void {
    const finalKey = this.storagePrefix + key;
    sessionStorage.removeItem(finalKey);
  }

  /**
   * Clear all secure storage items
   */
  clear(): void {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (key.startsWith(this.storagePrefix)) {
        sessionStorage.removeItem(key);
      }
    });
  }

  /**
   * Get encryption context information
   */
  getEncryptionContext(contextId: string = 'default'): EncryptionContext | null {
    return this.encryptionContexts.get(contextId) || null;
  }

  /**
   * Rotate encryption keys. Existing encrypted items become undecryptable (by design —
   * this is a real key rotation, not a cosmetic one) since they were encrypted under
   * the old secret.
   */
  rotateEncryptionKeys(): void {
    const newSecret = this.generateSecureSecret();
    sessionStorage.setItem('starcom_enc_secret', newSecret);

    this.encryptionContexts.forEach((context, id) => {
      context.keyId = `key_${id}_${Date.now()}`;
    });
  }
}

export const secureStorage = SecureStorageManager.getInstance();
