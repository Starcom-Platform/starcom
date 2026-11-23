import type { OutboxRecord } from './OutboxTypes';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'OutboxStore' });

const IDB_VERSION = 1;

/** Where a queue is kept: its IndexedDB database and store, and its localStorage mirror. */
export interface OutboxStoreNames {
  db: string;
  store: string;
  localKey: string;
}

/** The findings outbox's, as they always were. */
const FINDINGS_STORE: OutboxStoreNames = { db: 'starcom-outbox', store: 'publish-queue', localKey: 'starcom_publish_outbox_v1' };

/**
 * Storage behind the outbox, injectable so the queue logic is testable
 * without a browser. Same IndexedDB-primary / localStorage-fallback shape
 * IntelWorkspaceManager already uses, for the same reason: IndexedDB is the
 * real store, localStorage is what survives when it is unavailable.
 */
export interface OutboxStore<R extends { id: string } = OutboxRecord> {
  all(): Promise<R[]>;
  put(record: R): Promise<void>;
  remove(id: string): Promise<void>;
}

/** In-memory store. Used by tests, and as the last-resort fallback when neither browser store is available. */
export class MemoryOutboxStore<R extends { id: string } = OutboxRecord> implements OutboxStore<R> {
  private records = new Map<string, R>();

  async all(): Promise<R[]> {
    return [...this.records.values()];
  }

  async put(record: R): Promise<void> {
    this.records.set(record.id, record);
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }
}

export class BrowserOutboxStore<R extends { id: string } = OutboxRecord> implements OutboxStore<R> {
  constructor(private readonly names: OutboxStoreNames = FINDINGS_STORE) {}

  private openIDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(this.names.db, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.names.store)) db.createObjectStore(this.names.store, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async all(): Promise<R[]> {
    try {
      const db = await this.openIDB();
      return await new Promise<R[]>((resolve) => {
        const tx = db.transaction(this.names.store, 'readonly');
        const req = tx.objectStore(this.names.store).getAll();
        req.onsuccess = () => resolve((req.result as R[]) ?? []);
        req.onerror = () => resolve([]);
        tx.oncomplete = () => db.close();
      });
    } catch {
      return this.readLocalStorage();
    }
  }

  async put(record: R): Promise<void> {
    let idbOk = false;
    try {
      const db = await this.openIDB();
      idbOk = await new Promise<boolean>((resolve) => {
        const tx = db.transaction(this.names.store, 'readwrite');
        tx.objectStore(this.names.store).put(record);
        tx.oncomplete = () => { db.close(); resolve(true); };
        tx.onerror = () => { db.close(); resolve(false); };
      });
    } catch {
      idbOk = false;
    }
    // Mirror to localStorage whether or not IndexedDB took it. A queued
    // finding that exists in only one of the two stores is a finding that
    // disappears the moment that store is cleared, which is the exact
    // failure this whole service exists to prevent.
    if (!idbOk) log.warn('IndexedDB write failed; relying on localStorage mirror');
    this.writeLocalStorage(record);
  }

  async remove(id: string): Promise<void> {
    try {
      const db = await this.openIDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(this.names.store, 'readwrite');
        tx.objectStore(this.names.store).delete(id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
      });
    } catch {
      // fall through to the mirror
    }
    const mirrored = this.readLocalStorage().filter(r => r.id !== id);
    this.setLocalStorage(mirrored);
  }

  private readLocalStorage(): R[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.names.localKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed as R[] : [];
    } catch {
      return [];
    }
  }

  private writeLocalStorage(record: R): void {
    const existing = this.readLocalStorage().filter(r => r.id !== record.id);
    this.setLocalStorage([...existing, record]);
  }

  private setLocalStorage(records: R[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.names.localKey, JSON.stringify(records));
    } catch (err) {
      log.warn('localStorage mirror write failed:', err instanceof Error ? err.message : String(err));
    }
  }
}

export function createDefaultOutboxStore<R extends { id: string } = OutboxRecord>(names: OutboxStoreNames = FINDINGS_STORE): OutboxStore<R> {
  if (typeof indexedDB === 'undefined' && typeof localStorage === 'undefined') return new MemoryOutboxStore<R>();
  return new BrowserOutboxStore<R>(names);
}
