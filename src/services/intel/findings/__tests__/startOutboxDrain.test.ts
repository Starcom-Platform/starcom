/**
 * The outbox drains by itself at startup and on reconnect. When that sends
 * something, the person is told (plan item 0.2: nothing drains unseen).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const drainFindingsOutbox = vi.fn();
const hudInfo = vi.fn();

vi.mock('../FindingsPublisherService', () => ({
  drainFindingsOutbox: () => drainFindingsOutbox(),
  canDrainFindingsOutbox: () => true,
}));
vi.mock('../../../../utils/hudNotifications', () => ({ hudInfo: (...a: unknown[]) => hudInfo(...a) }));

const { startFindingsOutboxDrain } = await import('../startOutboxDrain');

describe('startFindingsOutboxDrain — what it sends is seen', () => {
  beforeEach(() => {
    drainFindingsOutbox.mockReset();
    hudInfo.mockReset();
  });

  it('says how many waiting findings it sent', async () => {
    drainFindingsOutbox.mockResolvedValue({ drained: true, summary: { attempted: 2, sent: 2, stillPending: 0, abandoned: 0 } });

    const stop = startFindingsOutboxDrain();
    await vi.waitFor(() => expect(hudInfo).toHaveBeenCalledTimes(1));
    stop();

    expect(hudInfo.mock.calls[0][0]).toBe('Sent 2 waiting findings');
  });

  it('says nothing when nothing was sent', async () => {
    drainFindingsOutbox.mockResolvedValue({ drained: true, summary: { attempted: 1, sent: 0, stillPending: 1, abandoned: 0 } });

    const stop = startFindingsOutboxDrain();
    await vi.waitFor(() => expect(drainFindingsOutbox).toHaveBeenCalled());
    await Promise.resolve();
    stop();

    expect(hudInfo).not.toHaveBeenCalled();
  });
});
