// CelesTrakCacheStore.ts — the last successful CelesTrak GP download, per group.
// Same shape as SubmarineCableCacheStore.ts: this codebase's pattern is a small
// per-consumer IndexedDB wrapper rather than a generic helper.
//
// ─── WHY A SATELLITE CATALOGUE NEEDS A CACHE THAT SURVIVES A RELOAD ────────
//
// CelesTrak updates its GP data every two hours and refuses to serve it again
// in between. Re-download a group before it has changed and the answer is
// HTTP 403, with the body:
//
//   GP data has not updated since your last successful download of
//   GROUP=active at 2026-09-11 15:13:59 UTC. Data is updated once every 2 hours.
//
// The app held its satellite data only in memory, with a one-hour lifetime. So
// any reload within two hours of a good download refetched, got the 403, and
// the whole Satellites layer failed — and on a shared IP (an office, a campus, a
// carrier NAT) one person's download refused everyone else behind it, including
// people who had never downloaded at all.
//
// This keeps the last good copy of each group, and the time CelesTrak actually
// served it. It is not stale-data-served-as-current, which the service worker
// rightly refuses for cross-origin sources: within the update window CelesTrak
// itself says nothing has changed, and positions are propagated live from the
// orbital elements rather than read from the cache.
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'CelesTrakCacheStore' });

const DB_NAME = 'celestrak-gp-data';
const DB_VERSION = 1;
const STORE_NAME = 'groups';

export interface CachedGpGroup<T = unknown> {
  /** The CelesTrak GROUP this is a copy of. */
  group: string;
  /** Epoch ms at which CelesTrak served it — the data's real age, not the read time. */
  fetchedAt: number;
  data: T[];
}

/** What the provider needs from a cache, so a test can supply one without IndexedDB. */
export interface GpCache {
  get<T>(group: string): Promise<CachedGpGroup<T> | null>;
  set<T>(group: string, data: T[], fetchedAt: number): Promise<void>;
}

export function isCelesTrakCacheAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** A row that is not recognisably a cached group is a miss, not data to hand on. */
function isValid(value: unknown): value is CachedGpGroup {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<CachedGpGroup>;
  return typeof row.group === 'string' && typeof row.fetchedAt === 'number' && Array.isArray(row.data);
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'group' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class CelesTrakCacheStore implements GpCache {
  async get<T>(group: string): Promise<CachedGpGroup<T> | null> {
    if (!isCelesTrakCacheAvailable()) return null;
    try {
      const db = await openDB();
      try {
        const raw = await new Promise<unknown>((resolve, reject) => {
          const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(group);
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => reject(req.error);
        });
        return isValid(raw) ? (raw as CachedGpGroup<T>) : null;
      } finally {
        db.close();
      }
    } catch (error) {
      log.warn(`Failed to read cached CelesTrak group ${group}`, error);
      return null;
    }
  }

  async set<T>(group: string, data: T[], fetchedAt: number): Promise<void> {
    if (!isCelesTrakCacheAvailable()) return;
    // A failed write must not fail the load that just succeeded — at worst the
    // group is fetched again next time, exactly as it was before this existed.
    try {
      const db = await openDB();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put({ group, fetchedAt, data } satisfies CachedGpGroup<T>);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    } catch (error) {
      log.warn(`Failed to cache CelesTrak group ${group}`, error);
    }
  }
}

export const celesTrakCacheStore = new CelesTrakCacheStore();
