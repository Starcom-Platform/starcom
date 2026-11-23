/**
 * What happens when the localStorage copy will not fit.
 *
 * IndexedDB is the primary store; localStorage is a backward-compatibility
 * copy of the WHOLE workspace under one key, so it meets the ~5MB origin limit
 * long before IndexedDB is troubled. Its setItem was unguarded, so past that
 * point every flush threw QuotaExceededError — after the primary write had
 * already succeeded — and the dirty flag never cleared.
 *
 * Driven through the real save path rather than by calling the private
 * flusher: a test that reaches past the public surface would keep passing if
 * the guard moved somewhere that no longer runs.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { intelWorkspaceManager } from '../IntelWorkspaceManager';

const QUOTA = 'QuotaExceededError';

/** Saves are debounced by 300ms; the flush is what touches localStorage. */
const afterFlush = () => new Promise((resolve) => setTimeout(resolve, 400));

describe('IntelWorkspaceManager — the localStorage copy is full', () => {
  let setItem: typeof Storage.prototype.setItem;

  beforeEach(async () => {
    setItem = Storage.prototype.setItem;
    await intelWorkspaceManager.ensureInitialized();
  });

  afterEach(() => {
    Storage.prototype.setItem = setItem;
  });

  it('keeps saving when the fallback copy cannot be written', async () => {
    Storage.prototype.setItem = vi.fn(() => {
      const error = new Error('exceeded the quota');
      error.name = QUOTA;
      throw error;
    });

    // The assertion is that this resolves at all: before the guard, the throw
    // came back out of the save and took the caller with it.
    await expect(Promise.resolve(intelWorkspaceManager.addIntelItem({
      title: 'Written against a full store', type: 'OSINT', source: 's',
      reliability: 'A', confidence: 0.5, tags: [], categories: [], content: 'x',
    } as never))).resolves.toBeTruthy();

    await afterFlush();
    expect(intelWorkspaceManager.getPersistenceStats().fallbackWriteFailed).toBe(true);
  });

  it('says the copy is current again once it can be written', async () => {
    Storage.prototype.setItem = vi.fn(() => {
      const error = new Error('exceeded the quota');
      error.name = QUOTA;
      throw error;
    });
    intelWorkspaceManager.addIntelItem({
      title: 'First', type: 'OSINT', source: 's', reliability: 'A',
      confidence: 0.5, tags: [], categories: [], content: 'x',
    } as never);
    await afterFlush();
    expect(intelWorkspaceManager.getPersistenceStats().fallbackWriteFailed).toBe(true);

    // A workspace that recovered room must not keep reporting a stale copy:
    // the flag is the state of the LAST write, not a latch.
    Storage.prototype.setItem = setItem;
    intelWorkspaceManager.addIntelItem({
      title: 'Second', type: 'OSINT', source: 's', reliability: 'A',
      confidence: 0.5, tags: [], categories: [], content: 'x',
    } as never);
    await afterFlush();
    expect(intelWorkspaceManager.getPersistenceStats().fallbackWriteFailed).toBe(false);
  });
});
