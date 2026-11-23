/**
 * Clear this device (decision D-CS, 12 Nov 2026: the people's data register found no way in the app to remove what
 * Starcom keeps). Removes everything Starcom keeps in this browser: localStorage, sessionStorage, every IndexedDB
 * database, the service worker's caches and the worker itself. What was published stays on the relays, and a key
 * Starcom Uplink holds stays in Uplink. The caller reloads the page afterwards, so nothing held in memory survives.
 */

export interface DeviceStores {
  localStorage?: Pick<Storage, 'clear'> | null;
  sessionStorage?: Pick<Storage, 'clear'> | null;
  indexedDB?: (Pick<IDBFactory, 'deleteDatabase'> & { databases?: () => Promise<Array<{ name?: string }>> }) | null;
  caches?: Pick<CacheStorage, 'keys' | 'delete'> | null;
  serviceWorker?: { getRegistrations(): Promise<ReadonlyArray<{ unregister(): Promise<boolean> }>> } | null;
}

export interface Cleared {
  /** IndexedDB databases deleted. */
  databases: number;
  /** Whether the browser could list its databases; when it cannot, its own "clear site data" finishes the job. */
  databasesListed: boolean;
  caches: number;
  workers: number;
}

function browserStores(): DeviceStores {
  const g = globalThis as typeof globalThis & { caches?: CacheStorage };
  const read = <T>(get: () => T): T | null => { try { return get() ?? null; } catch { return null; } };
  return {
    localStorage: read(() => g.localStorage),
    sessionStorage: read(() => g.sessionStorage),
    indexedDB: read(() => g.indexedDB),
    caches: read(() => g.caches ?? null),
    serviceWorker: read(() => (typeof navigator !== 'undefined' ? navigator.serviceWorker ?? null : null)),
  };
}

/** A deletion that waits for the browser's answer, and never hangs on a database another tab holds open. */
function deleteDatabase(factory: Pick<IDBFactory, 'deleteDatabase'>, name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = factory.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearThisDevice(stores: DeviceStores = browserStores()): Promise<Cleared> {
  const cleared: Cleared = { databases: 0, databasesListed: false, caches: 0, workers: 0 };
  try { stores.localStorage?.clear(); } catch { /* storage refused: the browser's own clearing finishes it */ }
  try { stores.sessionStorage?.clear(); } catch { /* as above */ }

  const factory = stores.indexedDB;
  if (factory && typeof factory.databases === 'function') {
    try {
      const names = (await factory.databases()).map((d) => d.name).filter((n): n is string => typeof n === 'string' && n.length > 0);
      cleared.databasesListed = true;
      await Promise.all(names.map((name) => deleteDatabase(factory, name)));
      cleared.databases = names.length;
    } catch { /* listing refused */ }
  }

  if (stores.caches) {
    try {
      const keys = await stores.caches.keys();
      await Promise.all(keys.map((key) => stores.caches!.delete(key)));
      cleared.caches = keys.length;
    } catch { /* caches refused */ }
  }

  if (stores.serviceWorker) {
    try {
      const registrations = await stores.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
      cleared.workers = registrations.length;
    } catch { /* no workers to reach */ }
  }
  return cleared;
}
