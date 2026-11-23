/**
 * The outbox tried again only at startup and when the browser came back online
 * (plan item 9.4). A relay set down while the browser stayed online was never
 * tried again until the next reload. Now, while anything is waiting, it tries
 * again after five minutes, then less often, up to every six hours.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const drainFindingsOutbox = vi.fn();
const canDrain = vi.fn(() => true);
const pending = vi.fn(async (): Promise<unknown[]> => []);
let heard: (() => void) | undefined;

vi.mock('../FindingsPublisherService', () => ({
  drainFindingsOutbox: () => drainFindingsOutbox(),
  canDrainFindingsOutbox: () => canDrain(),
}));
vi.mock('../../../../utils/hudNotifications', () => ({ hudInfo: vi.fn() }));
vi.mock('../../outbox/PublishOutbox', () => ({
  publishOutbox: {
    onChange: (listener: () => void) => { heard = listener; return () => { heard = undefined; }; },
    pending: () => pending(),
  },
}));

const { startFindingsOutboxDrain } = await import('../startOutboxDrain');

const MIN = 60_000;
const left = (stillPending: number, sent = 0) => ({ drained: true, summary: { attempted: stillPending + sent, sent, stillPending, abandoned: 0 } });

describe('startFindingsOutboxDrain — trying again while something waits', () => {
  let stop: () => void = () => {};
  beforeEach(() => {
    vi.useFakeTimers();
    drainFindingsOutbox.mockReset();
    canDrain.mockReset().mockReturnValue(true);
    pending.mockReset().mockResolvedValue([]);
  });
  afterEach(() => { stop(); vi.useRealTimers(); });

  it('tries again five minutes after a drain that left something waiting, then less often', async () => {
    drainFindingsOutbox.mockResolvedValue(left(1));
    stop = startFindingsOutboxDrain();
    await vi.advanceTimersByTimeAsync(0);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(9 * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1 * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(3);
  });

  it('never waits more than six hours', async () => {
    drainFindingsOutbox.mockResolvedValue(left(1));
    stop = startFindingsOutboxDrain();
    await vi.advanceTimersByTimeAsync(0);
    // 5, 10, 20, 40, 80, 160, 320 minutes, then capped at 360.
    await vi.advanceTimersByTimeAsync((5 + 10 + 20 + 40 + 80 + 160 + 320) * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(360 * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(9);
  });

  it('stops once nothing is waiting', async () => {
    drainFindingsOutbox.mockResolvedValueOnce(left(1)).mockResolvedValue(left(0, 1));
    stop = startFindingsOutboxDrain();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(24 * 60 * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(2);
  });

  it('goes back to five minutes after a drain that sent something', async () => {
    drainFindingsOutbox
      .mockResolvedValueOnce(left(2))        // startup
      .mockResolvedValueOnce(left(2))        // +5
      .mockResolvedValueOnce(left(1, 1))     // +10: one went
      .mockResolvedValue(left(1));
    stop = startFindingsOutboxDrain();
    await vi.advanceTimersByTimeAsync(15 * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(4);
  });

  it('tries again later a finding queued after startup', async () => {
    drainFindingsOutbox.mockResolvedValueOnce(left(0)).mockResolvedValue(left(0, 1));
    stop = startFindingsOutboxDrain();
    await vi.advanceTimersByTimeAsync(0);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(1);

    pending.mockResolvedValue([{ id: 'outbox_x' }]);
    heard?.();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(2);
  });

  it('does not try while it cannot, and stops when it is stopped', async () => {
    drainFindingsOutbox.mockResolvedValue(left(1));
    stop = startFindingsOutboxDrain();
    await vi.advanceTimersByTimeAsync(0);
    canDrain.mockReturnValue(false); // offline: the online event tries again
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(1);

    canDrain.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(24 * 60 * MIN);
    expect(drainFindingsOutbox).toHaveBeenCalledTimes(2);
  });
});
