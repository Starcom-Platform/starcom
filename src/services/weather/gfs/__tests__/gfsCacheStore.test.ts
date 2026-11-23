/**
 * The browser's copy of GFS fields and run listings (decision D-W, WX1: "kept
 * an hour in the browser"; a run's fields never change, so they are kept
 * until they are two days old).
 */
import { describe, it, expect } from 'vitest';
import { gfsCacheStore } from '../gfsCacheStore';

const DAY = 24 * 3600e3;

/** Every key the store's database holds, read directly. */
function storedKeys(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('gfs-weather');
    open.onsuccess = () => {
      const req = open.result.transaction('entries', 'readonly').objectStore('entries').getAllKeys();
      req.onsuccess = () => { open.result.close(); resolve((req.result as string[]).sort()); };
      req.onerror = () => reject(req.error);
    };
    open.onerror = () => reject(open.error);
  });
}

describe('gfsCacheStore', () => {
  it('keeps a field across page loads, typed arrays and dates intact', async () => {
    const field = { field: 'tmp2m', run: new Date('2026-10-05T18:00:00Z'), values: new Float32Array([1.5, 2.5]) };
    await gfsCacheStore({ now: () => 0 }).put('aws:2026100518:f003:tmp2m', field);
    const back = (await gfsCacheStore({ now: () => 1 }).get('aws:2026100518:f003:tmp2m')) as typeof field;
    // By type tag: the test's IndexedDB clones into another realm, where instanceof fails.
    expect(Object.prototype.toString.call(back.values)).toBe('[object Float32Array]');
    expect(Array.from(back.values)).toEqual([1.5, 2.5]);
    expect(Object.prototype.toString.call(back.run)).toBe('[object Date]');
    expect(back.run.toISOString()).toBe('2026-10-05T18:00:00.000Z');
  });

  it('answers nothing for what it does not hold', async () => {
    expect(await gfsCacheStore({ now: () => 0 }).get('aws:nothing')).toBeNull();
  });

  it('lets go of what is two days old when it stores something new', async () => {
    const t0 = Date.parse('2026-10-05T00:00:00Z');
    await gfsCacheStore({ now: () => t0 }).put('old', { a: 1 });
    await gfsCacheStore({ now: () => t0 + DAY }).put('recent', { b: 2 });
    await gfsCacheStore({ now: () => t0 + 2 * DAY + 1 }).put('new', { c: 3 });
    const store = gfsCacheStore({ now: () => t0 + 2 * DAY + 2 });
    expect(await store.get('old')).toBeNull();
    expect(await store.get('recent')).toEqual({ b: 2 });
    expect(await store.get('new')).toEqual({ c: 3 });
    // Gone from the disk, not only unread.
    expect(await storedKeys()).toEqual(['new', 'recent']);
  });

  it('does not hand back what is past keeping, even before anything new is stored', async () => {
    const t0 = Date.parse('2026-10-05T00:00:00Z');
    await gfsCacheStore({ now: () => t0 }).put('aging', { a: 1 });
    expect(await gfsCacheStore({ now: () => t0 + 2 * DAY }).get('aging')).toEqual({ a: 1 });
    expect(await gfsCacheStore({ now: () => t0 + 2 * DAY + 1 }).get('aging')).toBeNull();
  });

  it('acts as an empty cache, never an error, where the browser keeps nothing', async () => {
    const saved = globalThis.indexedDB;
    try {
      (globalThis as { indexedDB?: unknown }).indexedDB = undefined;
      const store = gfsCacheStore({ now: () => 0 });
      await expect(store.put('k', { a: 1 })).resolves.toBeUndefined();
      expect(await store.get('k')).toBeNull();
      (globalThis as { indexedDB?: unknown }).indexedDB = { open: () => { throw new Error('denied'); } };
      await expect(store.put('k', { a: 1 })).resolves.toBeUndefined();
      expect(await store.get('k')).toBeNull();
    } finally {
      (globalThis as { indexedDB?: unknown }).indexedDB = saved;
    }
  });
});
