/**
 * ClassifiedDataKeyStore — IndexedDB persistence for the KEM private keys
 * produced by PQCryptoService.encryptClassifiedData (Cycle 7).
 *
 * encryptClassifiedData's own doc comment is explicit: the returned
 * ClassifiedDataKey "MUST be stored separately from the ClassifiedData
 * itself ... bundling both together ... means anyone who obtains the
 * 'encrypted' payload can decrypt it." That method already existed, real
 * and tested, with zero call sites anywhere near intel storage — this is
 * the missing separate-storage half that makes it safe to actually wire
 * in. Unlike PQCKeyStore/PrekeyBundleStore/ManifestSigningKeyStore (one
 * persisted keypair per device), this needs one key PER encrypted record
 * — encryptClassifiedData generates a fresh ephemeral KEM keypair on every
 * call — so it's keyed by report/case id, not a single 'current'/'local'
 * slot.
 */

import type { ClassifiedDataKey } from './PQCryptoService';

const DB_NAME = 'classified-data-keys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

interface StoredKey {
  id: string;
  kemPrivateKey: number[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class ClassifiedDataKeyStore {
  async put(id: string, key: ClassifiedDataKey): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id, kemPrivateKey: Array.from(key.kemPrivateKey) } as StoredKey);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async get(id: string): Promise<ClassifiedDataKey | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => {
        db.close();
        const raw = req.result as StoredKey | undefined;
        resolve(raw ? { kemPrivateKey: new Uint8Array(raw.kemPrivateKey) } : undefined);
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  async delete(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
}

export const classifiedDataKeyStore = new ClassifiedDataKeyStore();
