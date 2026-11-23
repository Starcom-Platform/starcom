/**
 * The offline queue carries which message it holds (plan item 9.4), so that
 * once it is sent the message can be marked sent. It went out with its status
 * still failed.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { OfflineQueue } from '../OfflineQueue';

describe('OfflineQueue', () => {
  it('hands the send the id of the message it held, and forgets it once sent', async () => {
    const queue = new OfflineQueue();
    await queue.enqueue('dm-abc', 'hello', undefined, 'msg-1');
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await queue.flush(send)).toBe(1);
    expect(send).toHaveBeenCalledWith('dm-abc', 'hello', undefined, 'msg-1');
    expect(await queue.flush(send)).toBe(0);
  });
});
