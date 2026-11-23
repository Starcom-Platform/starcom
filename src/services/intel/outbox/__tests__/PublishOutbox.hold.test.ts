/**
 * Holding the findings outbox (BD13): the one job the rail can hold, since it is
 * a queue that drains by itself. Held, a drain sends nothing and keeps every
 * record; resumed, the next drain sends as before.
 */
import { describe, it, expect, vi } from 'vitest';
import { PublishOutbox } from '../PublishOutbox';
import { MemoryOutboxStore } from '../OutboxStore';

describe('PublishOutbox hold', () => {
  it('sends nothing while held, and says it is held', async () => {
    const store = new MemoryOutboxStore();
    // A finding waiting, so a drain that ignored the hold would send it.
    await store.put({
      id: 'a', schemaVersion: 1, kind: 'finding', dedupeKey: 'a', payload: {} as never,
      createdAt: '2026-10-05T00:00:00.000Z', attempts: 0, lastAttemptAt: null, lastError: null, status: 'pending',
    });
    const outbox = new PublishOutbox(store);
    const heard = vi.fn();
    outbox.onChange(heard);
    outbox.hold();
    expect(outbox.isHeld()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(1);
    const publish = vi.fn(async () => ({ success: true }));
    const summary = await outbox.drain(publish);
    expect(publish).not.toHaveBeenCalled();
    expect(summary.attempted).toBe(0);
    outbox.resume();
    expect(outbox.isHeld()).toBe(false);
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
