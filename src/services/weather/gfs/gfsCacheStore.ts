/**
 * The browser's copy of GFS fields and run listings, behind the client's
 * GfsCache (decision D-W, WX1). The same shape as SubmarineCableCacheStore:
 * this codebase gives each consumer its own small IndexedDB wrapper.
 *
 * A run's fields never change once NOAA writes them, so they are kept until
 * they are two days old and then let go, when something new is stored. Where
 * IndexedDB is missing or refuses (a private window, a full disk), it acts as
 * an empty cache: the layer fetches again, and never fails for want of a copy.
 */
import { createLogger } from '@utils/logger';
import type { GfsCache } from './gfsClient';

const log = createLogger({ prefix: 'GfsCacheStore' });

const DB_NAME = 'gfs-weather';
const DB_VERSION = 1;
const STORE = 'entries';
const KEEP_MS = 2 * 24 * 3600e3;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'key' });
      store.createIndex('storedAt', 'storedAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withDB<T>(fallback: T, run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  if (typeof indexedDB === 'undefined' || !indexedDB) return fallback;
  try {
    const db = await openDB();
    try {
      return await run(db);
    } finally {
      db.close();
    }
  } catch (error) {
    log.warn('The weather cache could not be used', error);
    return fallback;
  }
}

export function gfsCacheStore(deps: { now: () => number } = { now: Date.now }): GfsCache {
  return {
    get: (key) => withDB<unknown>(null, (db) => new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => {
        const row = req.result as { storedAt: number; value: unknown } | undefined;
        resolve(row && deps.now() - row.storedAt <= KEEP_MS ? row.value : null);
      };
      req.onerror = () => reject(req.error);
    })),
    put: (key, value) => withDB<void>(undefined, (db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const now = deps.now();
      store.put({ key, storedAt: now, value });
      // Let go of whatever is past keeping, oldest first, in the same transaction.
      const oldest = store.index('storedAt').openCursor();
      oldest.onsuccess = () => {
        const cursor = oldest.result;
        if (cursor && (cursor.value as { storedAt: number }).storedAt < now - KEEP_MS) {
          cursor.delete();
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    })),
  };
}
