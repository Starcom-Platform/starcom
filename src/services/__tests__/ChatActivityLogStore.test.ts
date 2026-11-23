/**
 * ChatActivityLogStore (Phase T3.4) — real persisted audit trail for chat
 * events, replacing reliance on SecureLogger's in-memory-only buffer. Same
 * IndexedDB-per-record-store pattern as PrekeyBundleStore/ChatChannelStore
 * (see those test files).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { ChatActivityLogStore, ChatActivityAction, type ChatActivityLogEntry } from '../ChatActivityLogStore';

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('securechat-activity-log');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

function makeEntry(overrides: Partial<ChatActivityLogEntry> = {}): ChatActivityLogEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    action: ChatActivityAction.MESSAGE_SENT,
    timestamp: new Date().toISOString(),
    userId: 'pk-alice',
    entityId: 'chan-1',
    details: {},
    ...overrides
  };
}

describe('ChatActivityLogStore', () => {
  let store: ChatActivityLogStore;

  beforeEach(async () => {
    await deleteDb();
    store = new ChatActivityLogStore();
  });

  it('getForChannel returns empty when nothing stored yet', async () => {
    await expect(store.getForChannel('chan-1')).resolves.toEqual([]);
  });

  it('append then getForChannel returns the entry', async () => {
    const entry = makeEntry();
    await store.append(entry);
    const results = await store.getForChannel('chan-1');
    expect(results).toEqual([entry]);
  });

  it('getForChannel only returns entries for that channel, not others', async () => {
    await store.append(makeEntry({ id: 'e1', entityId: 'chan-1' }));
    await store.append(makeEntry({ id: 'e2', entityId: 'chan-2' }));

    const chan1Results = await store.getForChannel('chan-1');
    expect(chan1Results.map(e => e.id)).toEqual(['e1']);
  });

  it('getForChannel returns most-recent-first', async () => {
    await store.append(makeEntry({ id: 'older', timestamp: '2026-01-01T00:00:00.000Z' }));
    await store.append(makeEntry({ id: 'newer', timestamp: '2026-01-02T00:00:00.000Z' }));

    const results = await store.getForChannel('chan-1');
    expect(results.map(e => e.id)).toEqual(['newer', 'older']);
  });

  it('survives a reload — a fresh store instance reads the same persisted entries', async () => {
    await store.append(makeEntry({ id: 'persisted' }));
    const reloaded = new ChatActivityLogStore();
    const results = await reloaded.getForChannel('chan-1');
    expect(results.map(e => e.id)).toEqual(['persisted']);
  });

  describe('getRecentStats (Phase T6 — real analytics)', () => {
    it('counts entries across channels, split by action, within the window', async () => {
      await store.append(makeEntry({ id: 'a', entityId: 'chan-1', action: ChatActivityAction.MESSAGE_SENT }));
      await store.append(makeEntry({ id: 'b', entityId: 'chan-2', action: ChatActivityAction.MESSAGE_SENT }));
      await store.append(makeEntry({ id: 'c', entityId: 'chan-1', action: ChatActivityAction.MESSAGE_RECEIVED }));
      await store.append(makeEntry({ id: 'd', entityId: 'chan-2', action: ChatActivityAction.DECRYPT_FAILED }));

      const stats = await store.getRecentStats();
      expect(stats).toEqual({ total: 4, sent: 2, received: 1, decryptFailed: 1 });
    });

    it('excludes entries older than the requested window', async () => {
      const oldTimestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      await store.append(makeEntry({ id: 'old', timestamp: oldTimestamp }));
      await store.append(makeEntry({ id: 'recent', timestamp: new Date().toISOString() }));

      const stats = await store.getRecentStats(24 * 60 * 60 * 1000);
      expect(stats).toEqual({ total: 1, sent: 1, received: 0, decryptFailed: 0 });
    });

    it('returns all zeros when nothing is stored', async () => {
      await expect(store.getRecentStats()).resolves.toEqual({ total: 0, sent: 0, received: 0, decryptFailed: 0 });
    });
  });
});
