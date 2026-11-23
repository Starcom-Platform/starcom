/**
 * Where Starcom keeps evidence captures (decision D-EX, E2, W8; EX14): in this browser, beside the
 * case, in Starcom's own storage, so removing Uplink loses none of it. Files by their SHA-256, which
 * is also how the custody record names them; each item's custody record by the item's id. Nothing
 * here is published.
 */
import type { KeptCustody } from './keepEvidence';

const DB = 'starcom-evidence';
const FILES = 'files';
const RECORDS = 'records';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser keeps no evidence: it has no IndexedDB.')); return; }
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
      if (!db.objectStoreNames.contains(RECORDS)) db.createObjectStore(RECORDS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = work(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const evidenceStore = {
  putFile: (sha256: string, file: Blob) => run(FILES, 'readwrite', (s) => s.put(file, sha256)).then(() => undefined),
  getFile: (sha256: string) => run<Blob | undefined>(FILES, 'readonly', (s) => s.get(sha256)),
  putRecord: (itemId: string, record: KeptCustody) => run(RECORDS, 'readwrite', (s) => s.put(record, itemId)).then(() => undefined),
  getRecord: (itemId: string) => run<KeptCustody | undefined>(RECORDS, 'readonly', (s) => s.get(itemId)),
};
