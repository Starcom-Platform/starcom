/**
 * PQCKeyStore — IndexedDB-based persistence for ML-KEM-768 key material.
 *
 * Stores:
 *  - KEM keypairs (publicKey + privateKey)
 *  - Key metadata (createdAt, expiresAt, rotatedAt)
 *  - Nostr event IDs for published public keys
 *
 * Rotation policy: 30-day expiry, 7-day grace period for decryption overlap.
 */

import { logger } from '../../utils';

const DB_NAME = 'pqc-keystore';
const DB_VERSION = 1;
const STORE_NAME = 'kem-keys';

/** 30 days in ms */
const KEY_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
/** 7-day grace period for old keys */
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredKEMKey {
  id: string; // 'current' | 'previous' | custom
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  algorithm: string;
  createdAt: number;
  expiresAt: number;
  graceExpiresAt: number; // expiresAt + 7 days (for decryption)
  nostrEventId?: string; // Nostr event ID where public key was published
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class PQCKeyStore {
  /**
   * Store a KEM key record.
   */
  async put(key: StoredKEMKey): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        ...key,
        publicKey: Array.from(key.publicKey),
        privateKey: Array.from(key.privateKey),
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  /**
   * Get a KEM key by ID ('current', 'previous', etc.).
   */
  async get(id: string): Promise<StoredKEMKey | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => {
        db.close();
        const raw = req.result;
        if (!raw) return resolve(undefined);
        resolve({
          ...raw,
          publicKey: new Uint8Array(raw.publicKey),
          privateKey: new Uint8Array(raw.privateKey),
        });
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  /**
   * Delete a key record.
   */
  async delete(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  /**
   * List all stored keys.
   */
  async listAll(): Promise<StoredKEMKey[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result || []).map((raw: any) => ({
          ...raw,
          publicKey: new Uint8Array(raw.publicKey),
          privateKey: new Uint8Array(raw.privateKey),
        })));
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  /**
   * Check if the current key needs rotation (past 30-day expiry).
   */
  async needsRotation(): Promise<boolean> {
    const current = await this.get('current');
    if (!current) return true;
    return Date.now() >= current.expiresAt;
  }

  /**
   * Rotate keys: current → previous (grace period), generate new current.
   * Returns the new current key (caller must generate the keypair and pass it).
   */
  async rotate(newPublicKey: Uint8Array, newPrivateKey: Uint8Array): Promise<StoredKEMKey> {
    const now = Date.now();
    const current = await this.get('current');
    
    // Demote current → previous (keeps private key for grace-period decryption)
    if (current) {
      const previous: StoredKEMKey = {
        ...current,
        id: 'previous',
        graceExpiresAt: now + GRACE_PERIOD_MS,
      };
      await this.put(previous);
      logger.info('[PQCKeyStore] Previous key stored for grace period');
    }
    
    // Store new current
    const newKey: StoredKEMKey = {
      id: 'current',
      publicKey: newPublicKey,
      privateKey: newPrivateKey,
      algorithm: 'ML-KEM-768',
      createdAt: now,
      expiresAt: now + KEY_LIFETIME_MS,
      graceExpiresAt: now + KEY_LIFETIME_MS + GRACE_PERIOD_MS,
    };
    await this.put(newKey);
    logger.info('[PQCKeyStore] New current key stored');
    
    return newKey;
  }

  /**
   * Clean up keys past their grace period.
   */
  async cleanup(): Promise<void> {
    const all = await this.listAll();
    const now = Date.now();
    for (const key of all) {
      if (key.id !== 'current' && now >= key.graceExpiresAt) {
        await this.delete(key.id);
        logger.info(`[PQCKeyStore] Cleaned up expired key: ${key.id}`);
      }
    }
  }
}

export const KEY_LIFETIME_MS_EXPORT = KEY_LIFETIME_MS;
export const GRACE_PERIOD_MS_EXPORT = GRACE_PERIOD_MS;
