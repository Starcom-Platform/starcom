/**
 * The rolling pool that fetches cable details: order kept, never more than the limit open,
 * and a slow item does not hold the others back — which is the whole reason it replaced
 * fixed batches.
 */
import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '../SubmarineCableService';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mapWithConcurrency', () => {
  it('returns results in input order whatever order they finish in', async () => {
    const out = await mapWithConcurrency([30, 5, 20, 1], 2, async (ms, i) => { await delay(ms); return i; });
    expect(out).toEqual([0, 1, 2, 3]);
  });

  it('never has more than the limit in flight', async () => {
    let open = 0, peak = 0;
    await mapWithConcurrency(Array.from({ length: 25 }, (_, i) => i), 4, async () => {
      open++; peak = Math.max(peak, open);
      await delay(2);
      open--;
    });
    expect(peak).toBe(4);
  });

  it('starts the next item when any one finishes, not when a whole batch does', async () => {
    // One slow item and many fast ones, two slots. Fixed batches of two would pair each
    // fast item with a wait; a rolling pool runs the fast ones through the free slot.
    const started: number[] = [];
    const t0 = Date.now();
    await mapWithConcurrency([200, 1, 1, 1, 1, 1], 2, async (ms, i) => { started.push(Date.now() - t0); await delay(ms); return i; });
    // Every fast item started long before the slow one finished.
    expect(Math.max(...started.slice(1))).toBeLessThan(150);
  });

  it('handles an empty list and a limit larger than the list', async () => {
    expect(await mapWithConcurrency([], 10, async (x) => x)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 10, async (x) => x * 2)).toEqual([2, 4]);
  });

  it('refuses a limit that would run nothing', async () => {
    await expect(mapWithConcurrency([1], 0, async (x) => x)).rejects.toThrow(/at least 1/);
  });
});
