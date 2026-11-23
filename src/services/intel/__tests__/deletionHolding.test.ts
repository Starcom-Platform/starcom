/**
 * Deletes you can take back (plan item 0.6, stories S14 and S23): a deletion
 * is held for ten seconds with Undo, and only then made final.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { holdDeletion, undoDeletion, heldDeletions, subscribeHeldDeletions, UNDO_WINDOW_MS } from '../deletionHolding';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

describe('holding a deletion', () => {
  it('lasts ten seconds, and Undo within them restores it and never makes it final', async () => {
    const undo = vi.fn(async () => {});
    const finalize = vi.fn();
    const id = holdDeletion({ label: 'Case "Newark food banks"', undo, finalize });
    expect(heldDeletions().map((h) => h.label)).toEqual(['Case "Newark food banks"']);

    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1);
    expect(await undoDeletion(id)).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(finalize).not.toHaveBeenCalled();
    expect(heldDeletions()).toEqual([]);
  });

  it('is made final when the ten seconds pass, and Undo after that does nothing', async () => {
    const undo = vi.fn(async () => {});
    const finalize = vi.fn();
    const id = holdDeletion({ label: 'Report "Newark food bank 3"', undo, finalize });

    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(await undoDeletion(id)).toBe(false);
    expect(undo).not.toHaveBeenCalled();
    expect(heldDeletions()).toEqual([]);
  });

  it('tells a listener what is held, and when it stops being held', async () => {
    const seen: string[][] = [];
    const stop = subscribeHeldDeletions((held) => seen.push(held.map((h) => h.label)));
    holdDeletion({ label: 'Mission "Newark"', undo: async () => {}, finalize: () => {} });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    stop();

    expect(seen).toEqual([[], ['Mission "Newark"'], []]);
  });
});
