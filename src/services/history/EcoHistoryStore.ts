// EcoHistoryStore.ts
// Lightweight IndexedDB snapshot store, decoupled from rendering — appends a
// timestamped copy of each real successful GeoEvents fetch. Exists purely so a future
// time-scrubbing feature has real captured history to replay instead of an empty
// buffer: GeoEventsDataProvider's own cache is single-slot most-recent-only, so
// without this, "replay the last 7 days" would have nothing real to show. No read UI
// yet — this only writes.
//
// No generic reusable IndexedDB helper exists in this codebase (checked: the one
// IndexedDB adapter, src/core/intel/storage/indexedDBAdapter.ts, is tightly coupled to
// the Intel entity model) — every other consumer (e.g. src/lib/chat/OfflineQueue.ts)
// rolls its own small wrapper the same way this does.

import { createLogger } from '@utils/logger';
import type { NaturalEvent } from '../GeoEventsService';

const log = createLogger({ prefix: 'EcoHistoryStore' });

const DB_NAME = 'eco-history';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';
// 7 days at a real-world refresh cadence (this app's own default fetch interval is a
// few minutes) comfortably fits well under a few thousand rows — capped generously
// above that so this never grows unbounded if refresh cadence changes.
const MAX_SNAPSHOTS = 4000;

export interface EcoHistorySnapshot {
  timestamp: number;
  eventCount: number;
  data: NaturalEvent[];
}

// IndexedDB isn't universally available (older browsers, some privacy/incognito
// modes, non-browser/SSR contexts, and — relevantly — jsdom's default test
// environment unless a polyfill is explicitly imported). appendSnapshot no-ops rather
// than throwing in these environments, since this store is explicitly best-effort
// infrastructure that must never affect the real data-fetch path it observes.
export function isHistoryStoreAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'timestamp' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class EcoHistoryStore {
  // Configurable (default MAX_SNAPSHOTS) so tests can exercise real FIFO eviction with
  // a handful of rows instead of needing thousands of real writes.
  constructor(private readonly maxSnapshots: number = MAX_SNAPSHOTS) {}

  /**
   * Append a real snapshot. Fire-and-forget by design from the caller's side (a
   * storage failure here must never affect the actual data-fetch path it's
   * piggybacking on) — this method itself still surfaces errors to its own caller/tests.
   * No-ops (does not throw) when IndexedDB isn't available in the current environment.
   */
  async appendSnapshot(data: NaturalEvent[]): Promise<void> {
    if (!isHistoryStoreAvailable()) return;
    const db = await openDB();
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const snapshot: EcoHistorySnapshot = {
        timestamp: Date.now(),
        eventCount: data.length,
        data
      };
      store.put(snapshot);

      const countReq = store.count();
      await new Promise<void>((resolve, reject) => {
        countReq.onsuccess = () => {
          const overBy = countReq.result - this.maxSnapshots;
          if (overBy > 0) {
            // FIFO eviction — oldest snapshots first (keyPath is timestamp, so a
            // plain cursor walks oldest-to-newest by default).
            const cursorReq = store.openCursor();
            let deleted = 0;
            cursorReq.onsuccess = () => {
              const cursor = cursorReq.result;
              if (cursor && deleted < overBy) {
                cursor.delete();
                deleted++;
                cursor.continue();
              } else {
                resolve();
              }
            };
            cursorReq.onerror = () => reject(cursorReq.error);
          } else {
            resolve();
          }
        };
        countReq.onerror = () => reject(countReq.error);
      });

      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      log.warn('Failed to append history snapshot', error);
      throw error;
    } finally {
      db.close();
    }
  }

  /** Real captured snapshots at or after sinceMs, oldest first. */
  async getSnapshotsSince(sinceMs: number): Promise<EcoHistorySnapshot[]> {
    const db = await openDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const range = IDBKeyRange.lowerBound(sinceMs);
        const req = store.getAll(range);
        req.onsuccess = () => resolve(req.result ?? []);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  /** Drop every snapshot older than olderThanMs (a cutoff timestamp, not a duration). */
  async pruneOlderThan(olderThanMs: number): Promise<void> {
    const db = await openDB();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const range = IDBKeyRange.upperBound(olderThanMs, true);
        const cursorReq = store.openCursor(range);
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
        cursorReq.onerror = () => reject(cursorReq.error);
      });
    } finally {
      db.close();
    }
  }

  async clear(): Promise<void> {
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

export const ecoHistoryStore = new EcoHistoryStore();
