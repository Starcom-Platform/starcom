/**
 * ChatChannelStore — IndexedDB persistence for locally-known secure-chat
 * channel metadata.
 *
 * Channel *identity* (the channelId every participant converges on) comes
 * from a deterministic hash of the channel name, computed by
 * SecureChatIntegrationService.createChannel() — this store is NOT the
 * source of truth for that and doesn't need to be synced or authoritative
 * across devices/users. It's just this device's local memory of "channels
 * I've created or looked up", so getChannels()/createChannel() have
 * something to return without a relay round-trip. Two different users
 * deriving the identical channelId from the identical name is what makes
 * them land in the same Nostr channel — this store plays no part in that.
 */

import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'ChatChannelStore' });

const DB_NAME = 'securechat-channels';
const DB_VERSION = 1;
const STORE_NAME = 'channels';

export interface StoredChatChannel {
  channelId: string;
  name: string;
  type: string;
  participants: string[];
  createdAt: number;
  createdBy?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'channelId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class ChatChannelStore {
  async put(channel: StoredChatChannel): Promise<void> {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(channel);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
    log.debug(`Stored channel ${channel.channelId} (${channel.name})`);
  }

  async get(channelId: string): Promise<StoredChatChannel | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(channelId);
      req.onsuccess = () => { db.close(); resolve(req.result as StoredChatChannel | undefined); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  async getAll(): Promise<StoredChatChannel[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => { db.close(); resolve((req.result as StoredChatChannel[]) || []); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }
}

export const chatChannelStore = new ChatChannelStore();
