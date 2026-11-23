// SubmarineCableCacheStore.ts — small IndexedDB wrapper for the real, merged submarine
// cable dataset. Same shape as MitreAttackCacheStore.ts/EcoHistoryStore.ts — this
// codebase's established pattern is "no generic reusable IndexedDB helper exists, every
// consumer rolls its own small wrapper."
//
// Single-slot cache (one row, not a history log): exists to avoid re-fetching two real geo
// files plus 521 real per-cable detail files every session, not to track history.
import { createLogger } from '@utils/logger';
import type { SubmarineCableData } from '../../types/CommHubs';

const log = createLogger({ prefix: 'SubmarineCableCacheStore' });

const DB_NAME = 'submarine-cable-data';
const DB_VERSION = 1;
const STORE_NAME = 'cables';
const CACHE_KEY = 'current';

export function isSubmarineCableCacheAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Defends against a future schema change (or externally corrupted IndexedDB row)
 * leaving a stale shape behind — treat anything that isn't recognizably real
 * SubmarineCableData as a cache miss rather than handing malformed data to callers that
 * assume `cables`/`landingPoints` are real arrays. */
function isValidCachedData(value: unknown): value is SubmarineCableData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<SubmarineCableData>;
  return Array.isArray(data.cables) && Array.isArray(data.landingPoints) && typeof data.fetchedAt === 'number';
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

export class SubmarineCableCacheStore {
  async get(): Promise<SubmarineCableData | null> {
    if (!isSubmarineCableCacheAvailable()) return null;
    try {
      const db = await openDB();
      try {
        const raw = await new Promise<unknown>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(CACHE_KEY);
          req.onsuccess = () => resolve(req.result?.data ?? null);
          req.onerror = () => reject(req.error);
        });
        return isValidCachedData(raw) ? raw : null;
      } finally {
        db.close();
      }
    } catch (error) {
      log.warn('Failed to read submarine cable cache', error);
      return null;
    }
  }

  async set(data: SubmarineCableData): Promise<void> {
    if (!isSubmarineCableCacheAvailable()) return;
    // Matches get()'s try/catch around openDB(): a caller that just successfully fetched
    // real data shouldn't have that whole pipeline fail just because persisting a local
    // cache copy of it hit a quota/private-browsing/corruption issue — worst case, the
    // real data is simply refetched next time.
    try {
      const db = await openDB();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put({ key: CACHE_KEY, data });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    } catch (error) {
      log.warn('Failed to write submarine cable cache', error);
    }
  }

  async clear(): Promise<void> {
    if (!isSubmarineCableCacheAvailable()) return;
    try {
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
    } catch (error) {
      log.warn('Failed to clear submarine cable cache', error);
    }
  }
}

export const submarineCableCacheStore = new SubmarineCableCacheStore();
