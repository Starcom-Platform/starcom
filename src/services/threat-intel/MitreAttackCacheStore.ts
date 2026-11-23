// MitreAttackCacheStore.ts — small IndexedDB wrapper for the real, filtered MITRE ATT&CK
// reference data. Same shape as src/services/history/EcoHistoryStore.ts (open/version/
// object-store/availability-check) — this codebase's own established pattern is "no generic
// reusable IndexedDB helper exists, every consumer rolls its own small wrapper" (see that
// file's own header comment), so this follows suit rather than inventing a third pattern.
//
// Single-slot cache (one row, not a history log): the real 53MB STIX bundle is expensive to
// fetch and filter, so this exists purely to avoid re-doing that real work every session —
// not to track history the way EcoHistoryStore does for a different real dataset.
import { createLogger } from '@utils/logger';
import type { MitreReferenceData } from '../../types/MitreAttack';

const log = createLogger({ prefix: 'MitreAttackCacheStore' });

const DB_NAME = 'mitre-attack-reference';
const DB_VERSION = 1;
const STORE_NAME = 'reference';
const CACHE_KEY = 'current';

// IndexedDB isn't universally available (older browsers, some privacy/incognito modes,
// non-browser/SSR contexts, and jsdom's default test environment unless a polyfill is
// explicitly imported) — callers should treat a cache miss here the same as "need to
// re-fetch," not as an error.
export function isMitreCacheAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class MitreAttackCacheStore {
  async get(): Promise<MitreReferenceData | null> {
    if (!isMitreCacheAvailable()) return null;
    try {
      const db = await openDB();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(CACHE_KEY);
          req.onsuccess = () => resolve(req.result?.data ?? null);
          req.onerror = () => reject(req.error);
        });
      } finally {
        db.close();
      }
    } catch (error) {
      log.warn('Failed to read MITRE reference cache', error);
      return null;
    }
  }

  async set(data: MitreReferenceData): Promise<void> {
    if (!isMitreCacheAvailable()) return;
    const db = await openDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ key: CACHE_KEY, data });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      log.warn('Failed to write MITRE reference cache', error);
    } finally {
      db.close();
    }
  }

  async clear(): Promise<void> {
    if (!isMitreCacheAvailable()) return;
    const db = await openDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
}

export const mitreAttackCacheStore = new MitreAttackCacheStore();
