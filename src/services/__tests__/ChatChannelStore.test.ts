/**
 * ChatChannelStore — new store backing SecureChatIntegrationService's
 * createChannel()/getChannels(). Same IndexedDB-per-record-store pattern
 * as PrekeyBundleStore/ManifestSigningKeyStore (see those test files).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { ChatChannelStore, type StoredChatChannel } from '../ChatChannelStore';

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('securechat-channels');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

function makeChannel(overrides: Partial<StoredChatChannel> = {}): StoredChatChannel {
  return {
    channelId: 'abc123',
    name: 'Investigation: X',
    type: 'group',
    participants: [],
    createdAt: Date.now(),
    createdBy: 'pk-alice',
    ...overrides
  };
}

describe('ChatChannelStore', () => {
  let store: ChatChannelStore;

  beforeEach(async () => {
    await deleteDb();
    store = new ChatChannelStore();
  });

  it('getAll returns empty when nothing stored yet', async () => {
    await expect(store.getAll()).resolves.toEqual([]);
  });

  it('put then get returns the exact stored record', async () => {
    const channel = makeChannel();
    await store.put(channel);
    await expect(store.get(channel.channelId)).resolves.toEqual(channel);
  });

  it('get returns undefined for an unknown channelId', async () => {
    await expect(store.get('nonexistent')).resolves.toBeUndefined();
  });

  it('put with an existing channelId overwrites (upsert), not duplicates', async () => {
    const channel = makeChannel();
    await store.put(channel);
    await store.put({ ...channel, participants: ['pk-bob'] });

    const all = await store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].participants).toEqual(['pk-bob']);
  });

  it('getAll returns every stored channel, survives a reload via a fresh instance', async () => {
    await store.put(makeChannel({ channelId: 'a', name: 'Channel A' }));
    await store.put(makeChannel({ channelId: 'b', name: 'Channel B' }));

    const reloaded = new ChatChannelStore();
    const all = await reloaded.getAll();
    expect(all.map(c => c.channelId).sort()).toEqual(['a', 'b']);
  });
});
