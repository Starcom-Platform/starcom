/**
 * The last time we looked at a target, kept so the next look can be compared.
 *
 * Deliberately separate from the evidence store, and deliberately not dependent
 * on the desktop host. The evidence store PROVES what was seen — content
 * addressed, hashed, signed against. This only needs to remember it, so
 * comparison works in a browser, for an analyst with no desktop host and no
 * money, which is the tier that has to work.
 *
 * One snapshot per target: the previous observation, replaced each time. A full
 * history would be more powerful and is a different, larger thing — this is the
 * smallest store that turns a state into a movement.
 */
import type { ReconSnapshot } from './reconDiff';

const DB_NAME = 'starcom-recon-snapshots';
const DB_VERSION = 1;
const STORE = 'snapshots';

export function isReconSnapshotStoreAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'target' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('could not open the snapshot store'));
  });
}

export class ReconSnapshotStore {
  /**
   * The previous observation, or null.
   *
   * Null covers three different situations — never looked, storage
   * unavailable, read failed — and the caller must not treat any of them as
   * "nothing changed". A first look has nothing to compare against, which is
   * not the same as a look that found no movement.
   */
  async previous(target: string): Promise<ReconSnapshot | null> {
    if (!isReconSnapshotStoreAvailable()) return null;
    try {
      const db = await open();
      return await new Promise<ReconSnapshot | null>((resolve) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(target.toLowerCase());
        request.onsuccess = () => resolve((request.result as ReconSnapshot | undefined) ?? null);
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /** Replace what we remember about this target. */
  async remember(snapshot: ReconSnapshot): Promise<boolean> {
    if (!isReconSnapshotStoreAvailable()) return false;
    try {
      const db = await open();
      return await new Promise<boolean>((resolve) => {
        const request = db
          .transaction(STORE, 'readwrite')
          .objectStore(STORE)
          .put({ ...snapshot, target: snapshot.target.toLowerCase() });
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }
}

export const reconSnapshotStore = new ReconSnapshotStore();
