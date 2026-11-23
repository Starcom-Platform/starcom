/**
 * While the share handle is in use, the globe's detail holds steady (D-GV GV0.2): a session's cards must match.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { noticedWhenUsed, shareActive, noteShareActivity, whileSharing, resetShareActivity, SHARE_ACTIVE_HOLD_MS, drawnAtFullDetail } from '../shareActivity';

describe('share activity', () => {
  beforeEach(() => resetShareActivity());

  it('is not in use until the handle is called', () => {
    expect(shareActive()).toBe(false);
  });

  it('counts a call as in use for a minute after it', () => {
    noteShareActivity(1_000);
    expect(shareActive(1_000 + SHARE_ACTIVE_HOLD_MS - 1)).toBe(true);
    expect(shareActive(1_000 + SHARE_ACTIVE_HOLD_MS)).toBe(false);
  });

  it('counts a capture as in use for as long as it runs, however long', async () => {
    let release!: () => void;
    const running = whileSharing(() => new Promise<void>((resolve) => { release = resolve; }));
    expect(shareActive(Date.now() + 10 * SHARE_ACTIVE_HOLD_MS)).toBe(true);
    release();
    await running;
    expect(shareActive(Date.now() + 2 * SHARE_ACTIVE_HOLD_MS)).toBe(false);
  });

  it('installs the handle with the same keys and values, every method noting its call', async () => {
    const handle = { version: 49, getView: () => ({ lat: 1 }), compose: async (scale: number) => ({ scale }) };
    const installed = noticedWhenUsed(handle);
    expect(Object.keys(installed)).toEqual(Object.keys(handle));
    expect(installed.version).toBe(49);
    expect(installed.getView()).toEqual({ lat: 1 });
    expect(shareActive()).toBe(true);
    resetShareActivity();
    await expect(installed.compose(2)).resolves.toEqual({ scale: 2 });
    expect(shareActive()).toBe(true);
  });

  it('passes a method\'s failure through unchanged', async () => {
    const installed = noticedWhenUsed({ renderShot: async () => { throw new Error('no globe'); } });
    await expect(installed.renderShot()).rejects.toThrow('no globe');
  });
});

describe('a card drawn at full detail', () => {
  it('holds full detail while the card is made, after waiting for its look, and lets go after', async () => {
    const order: string[] = [];
    let settledAfter = 3;
    const result = await drawnAtFullDetail(async () => { order.push('work'); return 7; }, {
      hold: () => { order.push('hold'); return () => order.push('release'); },
      settled: () => { settledAfter -= 1; return settledAfter <= 0; },
    });
    expect(result).toBe(7);
    expect(order).toEqual(['hold', 'work', 'release']);
    expect(settledAfter).toBeLessThanOrEqual(0);
  });

  it('makes the card anyway once its wait is up, so a look that never arrives is stated, not waited on for ever', async () => {
    const result = await drawnAtFullDetail(async () => 'made', { hold: () => () => {}, settled: () => false, waitMs: 50 });
    expect(result).toBe('made');
  });

  it('lets go when the card fails', async () => {
    let released = false;
    await expect(drawnAtFullDetail(async () => { throw new Error('no globe'); }, { hold: () => () => { released = true; }, settled: () => true }))
      .rejects.toThrow('no globe');
    expect(released).toBe(true);
  });
});
