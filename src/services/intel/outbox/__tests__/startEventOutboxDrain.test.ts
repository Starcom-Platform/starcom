/**
 * Kept notes go at startup, when the connection returns, and on a timer while any wait; never while offline, and
 * nothing is signed to send them (W1).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';
import { EventOutbox } from '../EventOutbox';
import { MemoryOutboxStore } from '../OutboxStore';
import { startEventOutboxDrain } from '../startEventOutboxDrain';

const recordKeptDispatch = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../MissionService', () => ({ missionService: { recordKeptDispatch } }));

const secret = generateSecretKey();
const note = (d: string) => finalizeEvent({ kind: 30023, tags: [['d', d]], content: 'Trucks queued.', created_at: 100 }, secret);
const settle = () => new Promise((r) => setTimeout(r, 0));
const online = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('startEventOutboxDrain', () => {
  it('sends what an earlier visit kept as soon as it starts', async () => {
    const outbox = new EventOutbox(new MemoryOutboxStore());
    await outbox.keep(note('r1'), ['wss://one.example']);
    const resend = vi.fn(async () => 1);
    const stop = startEventOutboxDrain(outbox, resend);
    await vi.waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
    expect(await outbox.waiting()).toEqual([]);
    stop();
  });

  it('waits while offline, and sends when the connection returns', async () => {
    const outbox = new EventOutbox(new MemoryOutboxStore());
    await outbox.keep(note('r1'), ['wss://one.example']);
    online(false);
    const resend = vi.fn(async () => 1);
    const stop = startEventOutboxDrain(outbox, resend);
    await settle();
    expect(resend).not.toHaveBeenCalled();
    online(true);
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(resend).toHaveBeenCalledTimes(1));
    stop();
  });

  it('tries again after five minutes while a note still waits', async () => {
    vi.useFakeTimers();
    const outbox = new EventOutbox(new MemoryOutboxStore());
    const resend = vi.fn(async () => { throw new Error('No relay took it.'); });
    const stop = startEventOutboxDrain(outbox, resend);
    await vi.advanceTimersByTimeAsync(0);
    await outbox.keep(note('r1'), ['wss://one.example']);
    await vi.advanceTimersByTimeAsync(0);
    expect(resend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(resend).toHaveBeenCalledTimes(1);
    expect((await outbox.pending())[0]).toMatchObject({ attempts: 1 });
    stop();
  });

  it('dispatches a mission once its kept package goes (W1c)', async () => {
    const outbox = new EventOutbox(new MemoryOutboxStore());
    const kept = finalizeEvent({ kind: 30079, tags: [['d', 'starcom_mission_package_m1']], content: '{}', created_at: 100 }, secret);
    await outbox.keep(kept, ['wss://one.example', 'wss://two.example'], { after: { dispatched: { mission: 'm1' } } });
    const stop = startEventOutboxDrain(outbox, vi.fn(async () => 2));
    await vi.waitFor(() => expect(recordKeptDispatch).toHaveBeenCalledWith('m1', expect.objectContaining({ id: kept.id }), 2, 2));
    stop();
  });
});
