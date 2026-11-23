import { describe, it, expect, vi } from 'vitest';
import { clearThisDevice, type DeviceStores } from '../clearThisDevice';

function fakeFactory(names: string[], listable = true) {
  const deleted: string[] = [];
  const factory = {
    deleteDatabase: vi.fn((name: string) => {
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => { deleted.push(name); request.onsuccess?.(new Event('success')); });
      return request;
    }),
    ...(listable ? { databases: async () => names.map((name) => ({ name })) } : {}),
  };
  return { factory, deleted };
}

describe('clearThisDevice', () => {
  it('clears both storages, every database, every cache and every worker', async () => {
    const { factory, deleted } = fakeFactory(['starcom-intel', 'chat-history']);
    const cacheKeys = ['starcom-v84', 'tiles'];
    const stores: DeviceStores = {
      localStorage: { clear: vi.fn() },
      sessionStorage: { clear: vi.fn() },
      indexedDB: factory as unknown as DeviceStores['indexedDB'],
      caches: { keys: async () => cacheKeys, delete: vi.fn(async () => true) } as unknown as DeviceStores['caches'],
      serviceWorker: { getRegistrations: async () => [{ unregister: vi.fn(async () => true) }] },
    };
    const cleared = await clearThisDevice(stores);
    expect(stores.localStorage!.clear).toHaveBeenCalled();
    expect(stores.sessionStorage!.clear).toHaveBeenCalled();
    expect(deleted.sort()).toEqual(['chat-history', 'starcom-intel']);
    expect(cleared).toEqual({ databases: 2, databasesListed: true, caches: 2, workers: 1 });
  });

  it('says when the browser cannot list its databases, so its own clearing can finish the job', async () => {
    const { factory } = fakeFactory(['x'], false);
    const cleared = await clearThisDevice({ indexedDB: factory as unknown as DeviceStores['indexedDB'] });
    expect(cleared.databasesListed).toBe(false);
    expect(cleared.databases).toBe(0);
  });

  it('goes on when a store refuses', async () => {
    const stores: DeviceStores = {
      localStorage: { clear: () => { throw new Error('denied'); } },
      sessionStorage: { clear: vi.fn() },
    };
    await expect(clearThisDevice(stores)).resolves.toMatchObject({ databases: 0 });
    expect(stores.sessionStorage!.clear).toHaveBeenCalled();
  });
});
