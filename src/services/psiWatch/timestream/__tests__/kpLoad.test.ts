/**
 * Kp as a card reads it (D-PW, PW62): the Kp lane's own record, read once and kept half an hour; nothing answering
 * is not kept, so the next card asks again.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KP_FORECAST_URL } from '../kp';
import { loadKpRecord, resetKpLoadForTests } from '../kpLoad';

const FORECAST = [{ time_tag: '2026-11-01T00:00:00', kp: 5.33, observed: 'observed' }];

describe('loadKpRecord', () => {
  afterEach(() => resetKpLoadForTests());

  it('reads the products once, and keeps the record half an hour', async () => {
    const fetcher = vi.fn(async (url: string) => (url === KP_FORECAST_URL
      ? { ok: true, json: async () => FORECAST, text: async () => '' }
      : { ok: false, json: async () => null, text: async () => '' })) as unknown as typeof fetch;
    const first = await loadKpRecord(0, fetcher);
    expect(first?.kp3.length).toBeGreaterThan(0);
    expect(await loadKpRecord(60_000, fetcher)).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(4);
    await loadKpRecord(31 * 60_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(8);
  });

  it('keeps nothing when nothing answers', async () => {
    const down = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    expect(await loadKpRecord(0, down)).toBeNull();
    await Promise.resolve();
    expect(await loadKpRecord(1000, down)).toBeNull();
    expect(down).toHaveBeenCalledTimes(8);
  });
});
