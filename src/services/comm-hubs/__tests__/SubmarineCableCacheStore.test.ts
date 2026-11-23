// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { SubmarineCableCacheStore } from '../SubmarineCableCacheStore';
import type { SubmarineCableData } from '../../../types/CommHubs';

const makeData = (fetchedAt: number = Date.now()): SubmarineCableData => ({
  cables: [{ id: 'x', name: 'X', color: '#000', paths: [], isPlanned: false, landingPoints: [] }],
  landingPoints: [],
  fetchedAt,
  datasetCableCount: 1
});

describe('SubmarineCableCacheStore', () => {
  let store: SubmarineCableCacheStore;

  beforeEach(async () => {
    store = new SubmarineCableCacheStore();
    await store.clear();
  });

  it('returns null when nothing has been cached yet', async () => {
    expect(await store.get()).toBeNull();
  });

  it('persists and retrieves the real merged dataset', async () => {
    const data = makeData();
    await store.set(data);
    expect(await store.get()).toEqual(data);
  });

  it('is a single-slot cache: a second set() replaces the first', async () => {
    await store.set(makeData(1000));
    await store.set(makeData(2000));
    expect((await store.get())?.fetchedAt).toBe(2000);
  });

  it('clear() removes the cached data', async () => {
    await store.set(makeData());
    await store.clear();
    expect(await store.get()).toBeNull();
  });

  it('treats a malformed cached shape as a cache miss rather than returning broken data', async () => {
    // Simulates a future schema change or externally corrupted row — bypasses set() to
    // write a shape get() should reject. DB/store/key names are this module's private
    // constants, duplicated here since the module doesn't export them.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('submarine-cable-data', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('cables')) db.createObjectStore('cables', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('cables', 'readwrite');
        tx.objectStore('cables').put({ key: 'current', data: { garbage: true } });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    expect(await store.get()).toBeNull();
  });

  it('set() does not throw when the underlying IndexedDB open fails, matching get()\'s resilience', async () => {
    const original = indexedDB.open;
    indexedDB.open = () => { throw new Error('simulated IndexedDB failure'); };
    try {
      await expect(store.set(makeData())).resolves.toBeUndefined();
    } finally {
      indexedDB.open = original;
    }
  });

  it('clear() does not throw when the underlying IndexedDB open fails', async () => {
    const original = indexedDB.open;
    indexedDB.open = () => { throw new Error('simulated IndexedDB failure'); };
    try {
      await expect(store.clear()).resolves.toBeUndefined();
    } finally {
      indexedDB.open = original;
    }
  });
});
