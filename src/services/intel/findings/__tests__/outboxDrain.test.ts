import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The outbox retries.
 *
 * It was built, tested, and never drained: a finding whose broadcast reached no
 * relay was durably queued and then sat there forever. A queue is only half a
 * retry mechanism.
 *
 * The precondition behaviour matters as much as the retry. Each record has a
 * finite budget before it is abandoned, so attempting a drain we already know
 * cannot succeed — no identity, no network — would spend that budget on
 * something unrelated to whether a relay would have accepted the finding.
 */

const drainMock = vi.fn();
const publishMock = vi.fn();
const getPubkeyMock = vi.fn();
let extensionInstalled = false;
let keyLocked = false;

vi.mock('../../outbox/PublishOutbox', () => ({
  // The starter also hears the outbox change, to try again later (plan item 9.4).
  publishOutbox: { drain: (...a: unknown[]) => drainMock(...a), onChange: () => () => {}, pending: async () => [] },
}));
vi.mock('../FindingsBroadcastService', () => ({
  FindingsBroadcastService: class {
    publishFinding(...a: unknown[]) { return publishMock(...a); }
    dispose() { /* no-op */ }
  },
}));
vi.mock('../../../identity/NostrIdentityService', () => ({
  nostrIdentityService: {
    getPubkey: () => getPubkeyMock(),
    signerPubkey: () => getPubkeyMock(),
    refreshSigner: async () => getPubkeyMock(),
    hasExtension: () => extensionInstalled,
    isLocked: () => keyLocked,
    asSigner: () => ({ getPublicKey: async () => 'pk', signEvent: async (e: unknown) => e }),
  },
}));

const { drainFindingsOutbox, canDrainFindingsOutbox } = await import('../FindingsPublisherService');

describe('drainFindingsOutbox — preconditions never cost a retry', () => {
  beforeEach(() => {
    drainMock.mockReset();
    drainMock.mockResolvedValue({ attempted: 0, sent: 0, stillPending: 0, abandoned: 0 });
    getPubkeyMock.mockReturnValue('pubkey');
    extensionInstalled = false;
    keyLocked = false;
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  // D-KL: a locked key signs nothing until the person unlocks it, and the drain runs on its own, so it never asks
  // for the passphrase: it waits, spending no retry, as for no key.
  it('does not touch the queue while this browser\'s key is locked', async () => {
    keyLocked = true;

    expect(canDrainFindingsOutbox()).toBe(false);
    const outcome = await drainFindingsOutbox();

    expect(outcome).toEqual({ drained: false, reason: 'no-identity' });
    expect(drainMock).not.toHaveBeenCalled();
  });

  it('does not touch the queue when there is no Nostr identity', async () => {
    getPubkeyMock.mockReturnValue(null);

    const outcome = await drainFindingsOutbox();

    expect(outcome).toEqual({ drained: false, reason: 'no-identity' });
    // The critical assertion: the queue was never asked, so no record spent an
    // attempt on a failure that had nothing to do with the relays.
    expect(drainMock).not.toHaveBeenCalled();
  });

  // Plan item 2.2: every finding is signed by the extension when one is
  // installed, but the check asked for this browser's key, so an outbox with
  // only an extension to sign it said "no identity" and never drained.
  it('drains with only a signer extension, and no key in this browser', async () => {
    getPubkeyMock.mockReturnValue(null);
    extensionInstalled = true;

    const outcome = await drainFindingsOutbox();

    expect(outcome.drained).toBe(true);
    expect(drainMock).toHaveBeenCalledTimes(1);
  });

  it('does not touch the queue while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const outcome = await drainFindingsOutbox();

    expect(outcome).toEqual({ drained: false, reason: 'offline' });
    expect(drainMock).not.toHaveBeenCalled();
  });

  it('drains when identity and network are both available', async () => {
    drainMock.mockResolvedValue({ attempted: 2, sent: 2, stillPending: 0, abandoned: 0 });

    const outcome = await drainFindingsOutbox();

    expect(outcome.drained).toBe(true);
    expect(drainMock).toHaveBeenCalledTimes(1);
  });

  it('canDrainFindingsOutbox agrees with what drain actually does', async () => {
    expect(canDrainFindingsOutbox()).toBe(true);

    getPubkeyMock.mockReturnValue(null);
    expect(canDrainFindingsOutbox()).toBe(false);
    expect((await drainFindingsOutbox()).drained).toBe(false);
  });
});

describe('startFindingsOutboxDrain', () => {
  beforeEach(() => {
    drainMock.mockReset();
    drainMock.mockResolvedValue({ attempted: 0, sent: 0, stillPending: 0, abandoned: 0 });
    getPubkeyMock.mockReturnValue('pubkey');
    extensionInstalled = false;
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('drains once at startup, for anything queued in a previous session', async () => {
    const { startFindingsOutboxDrain } = await import('../startOutboxDrain');
    const stop = startFindingsOutboxDrain();
    await vi.waitFor(() => expect(drainMock).toHaveBeenCalledTimes(1));
    stop();
  });

  it('drains again on regaining connectivity', async () => {
    const { startFindingsOutboxDrain } = await import('../startOutboxDrain');
    const stop = startFindingsOutboxDrain();
    await vi.waitFor(() => expect(drainMock).toHaveBeenCalledTimes(1));

    // The moment a previously-failed publish is most likely to succeed.
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(drainMock).toHaveBeenCalledTimes(2));
    stop();
  });

  it('stops responding to reconnects after disposal', async () => {
    const { startFindingsOutboxDrain } = await import('../startOutboxDrain');
    const stop = startFindingsOutboxDrain();
    await vi.waitFor(() => expect(drainMock).toHaveBeenCalledTimes(1));

    stop();
    window.dispatchEvent(new Event('online'));
    await new Promise(r => setTimeout(r, 30));
    expect(drainMock).toHaveBeenCalledTimes(1);
  });

  it('waits while the key is locked, and drains once it is unlocked (D-KL)', async () => {
    keyLocked = true;
    const { startFindingsOutboxDrain } = await import('../startOutboxDrain');
    const { notifyKeyLock } = await import('../../../identity/keyLock');
    const stop = startFindingsOutboxDrain();
    await new Promise(r => setTimeout(r, 30));
    expect(drainMock).not.toHaveBeenCalled();

    keyLocked = false;
    notifyKeyLock();
    await vi.waitFor(() => expect(drainMock).toHaveBeenCalledTimes(1));
    stop();
    keyLocked = false;
  });
});

describe('drainFindingsOutbox — what a retry that reaches a relay records', () => {
  it('writes the claim to the ledger with both its keys: the ML-DSA key that signed it, and the Nostr key its address uses (plan item 5.1)', async () => {
    getPubkeyMock.mockReturnValue('pubkey');
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    publishMock.mockReset().mockResolvedValue({ success: true, eventId: 'evt-retried', relaysOk: 1, nostrPubkey: 'f'.repeat(64) });
    drainMock.mockReset().mockImplementation(async (send: (payload: unknown, relays?: string[]) => Promise<unknown>) => {
      await send({
        content: { claim: { subjectRef: 'MV Northwind', attribute: 'location' }, publishedAt: '2026-09-27T00:00:00Z' },
        signature: { pubkey: 'ml-dsa-key' },
      }, ['wss://internal.test']);
      return { attempted: 1, sent: 1, stillPending: 0, abandoned: 0 };
    });
    await drainFindingsOutbox();
    const { publishedFindingsLedger } = await import('../PublishedFindingsLedger');
    const entry = publishedFindingsLedger.all().find((e) => e.eventId === 'evt-retried');
    expect(entry).toMatchObject({ authorPubkey: 'ml-dsa-key', nostrPubkey: 'f'.repeat(64) });
  });
});
