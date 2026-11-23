/**
 * ChatActivityLogStore — real, persisted (IndexedDB) audit trail for chat
 * events (Phase T3.4, Teams & Chat operational-reliability roadmap).
 *
 * SecureLogger (src/security/logging/SecureLogger.ts) is what chat's
 * security events go through today — but it's in-memory only, capped at
 * 1000 entries, and lost on reload; its own flushLogBuffer() is a
 * console.debug stub, not real persistence. ActivityLogEntry<TAction>
 * (src/types/intel/Collaboration.ts) is the proven, real,
 * IndexedDB-persisted pattern already used for Mission/Case activity logs
 * — its own doc comment explicitly frames it as parameterized specifically
 * so a third domain could reuse it without forcing that domain into a
 * case-shaped action enum. This is that third domain.
 *
 * Same per-store IndexedDB pattern as ChatChannelStore.ts/PrekeyBundleStore.ts.
 */
import type { ActivityLogEntry } from '../types/intel/Collaboration';

export enum ChatActivityAction {
  MESSAGE_SENT = 'MESSAGE_SENT',
  MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
  DECRYPT_FAILED = 'DECRYPT_FAILED'
}

export type ChatActivityLogEntry = ActivityLogEntry<ChatActivityAction>;

const DB_NAME = 'securechat-activity-log';
const DB_VERSION = 1;
const STORE_NAME = 'entries';
/** Per-channel entries are read most-recent-first for a UI; capped so one noisy channel can't grow this store unbounded. */
const MAX_ENTRIES_PER_CHANNEL_READ = 200;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('entityId', 'entityId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class ChatActivityLogStore {
  /** entityId is the channelId this entry pertains to — appended as a real IndexedDB field so getForChannel doesn't need a full-table scan. */
  async append(entry: ChatActivityLogEntry): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(entry);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async getForChannel(channelId: string, limit = MAX_ENTRIES_PER_CHANNEL_READ): Promise<ChatActivityLogEntry[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('entityId');
      const req = index.getAll(channelId);
      req.onsuccess = () => {
        db.close();
        const entries = (req.result as ChatActivityLogEntry[]) || [];
        // Most-recent-first, capped.
        resolve(entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit));
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  /** Cross-channel aggregate for a real (not fabricated) activity summary — see TeamWorkspaceApplication.tsx's Admin tab. */
  async getRecentStats(sinceMs = 24 * 60 * 60 * 1000): Promise<{
    total: number; sent: number; received: number; decryptFailed: number;
  }> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        db.close();
        const cutoff = Date.now() - sinceMs;
        const recent = ((req.result as ChatActivityLogEntry[]) || [])
          .filter(e => new Date(e.timestamp).getTime() >= cutoff);
        resolve({
          total: recent.length,
          sent: recent.filter(e => e.action === ChatActivityAction.MESSAGE_SENT).length,
          received: recent.filter(e => e.action === ChatActivityAction.MESSAGE_RECEIVED).length,
          decryptFailed: recent.filter(e => e.action === ChatActivityAction.DECRYPT_FAILED).length
        });
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }
}

export const chatActivityLogStore = new ChatActivityLogStore();
