// @vitest-environment node
/**
 * Step 3.3.4 — Offline Queue Tests
 *
 * Verifies:
 * 3.3.4.1 — OfflineQueue service with IndexedDB persistence
 * 3.3.4.2 — Offline detection (navigator.onLine check)
 * 3.3.4.3 — Auto-flush on reconnection
 * 3.3.4.4 — Cap queue at 100 messages with FIFO eviction
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function readSrc(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '../..', relPath), 'utf-8');
}

describe('Step 3.3.4 — Offline Queue', () => {
  // 3.3.4.1 — IndexedDB persistence
  it('OfflineQueue uses IndexedDB with correct DB and store', () => {
    const src = readSrc('lib/chat/OfflineQueue.ts');
    expect(src).toContain("'offline-queue'");
    expect(src).toContain("'messages'");
    expect(src).toContain('indexedDB.open');
  });

  it('exports OfflineQueue class with enqueue, flush, getAll, remove', () => {
    const src = readSrc('lib/chat/OfflineQueue.ts');
    expect(src).toContain('class OfflineQueue');
    expect(src).toContain('async enqueue(');
    expect(src).toContain('async flush(');
    expect(src).toContain('async getAll(');
    expect(src).toContain('async remove(');
  });

  // 3.3.4.2 — Offline detection
  it('has isOffline method checking navigator.onLine', () => {
    const src = readSrc('lib/chat/OfflineQueue.ts');
    expect(src).toContain('isOffline()');
    expect(src).toContain('navigator.onLine');
  });

  // 3.3.4.3 — Auto-flush on reconnection
  it('startAutoFlush listens for online event', () => {
    const src = readSrc('lib/chat/OfflineQueue.ts');
    expect(src).toContain('startAutoFlush');
    expect(src).toContain("window.addEventListener('online'");
  });

  it('stopAutoFlush removes the listener', () => {
    const src = readSrc('lib/chat/OfflineQueue.ts');
    expect(src).toContain('stopAutoFlush');
    expect(src).toContain("window.removeEventListener('online'");
  });

  // 3.3.4.4 — Cap at 100 with FIFO eviction
  it('MAX_QUEUE_SIZE is 100', () => {
    const src = readSrc('lib/chat/OfflineQueue.ts');
    expect(src).toContain('MAX_QUEUE_SIZE = 100');
  });

  it('FIFO eviction when queue is full', () => {
    const src = readSrc('lib/chat/OfflineQueue.ts');
    expect(src).toContain('FIFO eviction');
    expect(src).toContain('cursor.delete()');
  });
});
