/**
 * OfflineQueue — Persists unsent messages in IndexedDB and auto-flushes on reconnection.
 *
 * - Enqueue when adapter send fails or navigator.onLine is false
 * - Auto-flush on 'online' event and adapter reconnect
 * - FIFO eviction when queue exceeds MAX_QUEUE_SIZE
 * - Exponential backoff on repeated flush failures
 */

import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'OfflineQueue' });

const DB_NAME = 'offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'messages';
const MAX_QUEUE_SIZE = 100;

export interface QueuedMessage {
  id: string;
  channelId: string;
  content: string;
  attachments?: unknown[];
  enqueuedAt: number;
  retryCount: number;
  /** The message on screen this is, so it can be marked sent once it goes (plan item 9.4). */
  messageId?: string;
}

/** Sends one queued message; `messageId` names the message on screen, when known. */
export type QueuedSend = (channelId: string, content: string, attachments?: unknown[], messageId?: string) => Promise<void>;

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

export class OfflineQueue {
  private flushInProgress = false;
  private backoffMs = 1000;
  private onlineListener: (() => void) | null = null;

  /**
   * Enqueue a message for later delivery. Enforces MAX_QUEUE_SIZE via FIFO eviction.
   */
  async enqueue(channelId: string, content: string, attachments?: unknown[], messageId?: string): Promise<void> {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Count current entries
    const countReq = store.count();
    await new Promise<void>((resolve, reject) => {
      countReq.onsuccess = () => {
        if (countReq.result >= MAX_QUEUE_SIZE) {
          // FIFO eviction — delete the oldest entry
          const cursorReq = store.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              cursor.delete();
              log.debug('Evicted oldest queued message (FIFO)');
            }
            resolve();
          };
          cursorReq.onerror = () => reject(cursorReq.error);
        } else {
          resolve();
        }
      };
      countReq.onerror = () => reject(countReq.error);
    });

    const msg: QueuedMessage = {
      id: `oq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      channelId,
      content,
      attachments,
      enqueuedAt: Date.now(),
      retryCount: 0,
      ...(messageId ? { messageId } : {}),
    };
    store.put(msg);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => { db.close(); res(); };
      tx.onerror = () => { db.close(); rej(tx.error); };
    });
    log.debug(`Enqueued message for ${channelId}`);
  }

  /**
   * Get all queued messages (oldest first).
   */
  async getAll(): Promise<QueuedMessage[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => { db.close(); resolve(req.result ?? []); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  /**
   * Remove a specific message from the queue.
   */
  async remove(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  /**
   * Flush all queued messages through the provided send function.
   * Returns the number of successfully sent messages.
   */
  async flush(sendFn: QueuedSend): Promise<number> {
    if (this.flushInProgress) return 0;
    this.flushInProgress = true;
    let sent = 0;

    try {
      const messages = await this.getAll();
      for (const msg of messages) {
        try {
          await sendFn(msg.channelId, msg.content, msg.attachments, msg.messageId);
          await this.remove(msg.id);
          sent++;
        } catch {
          // Increment retry, leave in queue
          msg.retryCount++;
          const db = await openDB();
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put(msg);
          await new Promise<void>((r, j) => { tx.oncomplete = () => { db.close(); r(); }; tx.onerror = () => { db.close(); j(tx.error); }; });
        }
      }

      if (sent > 0) {
        this.backoffMs = 1000; // Reset backoff on success
        log.debug(`Flushed ${sent}/${messages.length} queued messages`);
      }
    } finally {
      this.flushInProgress = false;
    }

    return sent;
  }

  /**
   * Start listening for online events to auto-flush.
   */
  startAutoFlush(sendFn: QueuedSend): void {
    if (typeof window === 'undefined') return;

    this.onlineListener = async () => {
      log.debug('Online detected — flushing offline queue');
      await this.flush(sendFn);
    };
    window.addEventListener('online', this.onlineListener);
  }

  /**
   * Stop auto-flush listener.
   */
  stopAutoFlush(): void {
    if (this.onlineListener && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onlineListener);
      this.onlineListener = null;
    }
  }

  /**
   * Check if device is offline.
   */
  isOffline(): boolean {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  }
}

export { MAX_QUEUE_SIZE };
