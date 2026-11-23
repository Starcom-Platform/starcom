import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { PublishOutbox, MAX_ATTEMPTS } from '../PublishOutbox';
import { MemoryOutboxStore } from '../OutboxStore';
import { signFinding, type SignedFinding } from '../../findings/signFinding';
import type { FindingContent } from '../../findings/FindingContent';

const keys = ml_dsa65.keygen();

function makeSigned(entityRef = 'Acme Corp', attribute = 'location', value: unknown = { lat: 1, lon: 2 }): SignedFinding {
  const content: FindingContent = {
    schemaVersion: 1,
    claim: { entityRef, attribute, value },
    confidence: 0.8,
    corroboration: { sourceCount: 2, algorithmVersion: 1, criteria: '2+ independent, no unresolved conflict' },
    publishedAt: '2026-08-20T00:00:00.000Z'
  };
  return signFinding(content, keys.secretKey);
}

const ok = async () => ({ success: true });
const fail = async () => ({ success: false, error: 'no relays reachable' });

describe('PublishOutbox', () => {
  let store: MemoryOutboxStore;
  let outbox: PublishOutbox;

  beforeEach(() => {
    store = new MemoryOutboxStore();
    outbox = new PublishOutbox(store);
  });

  // Plan item 0.2. The queue drains at startup and on reconnect, so what is
  // waiting must be visible and withdrawable before it goes.
  it('cancels a waiting finding: it stops being pending and no drain sends it', async () => {
    const record = await outbox.enqueue(makeSigned());

    expect(await outbox.cancel(record.id)).toBe(true);
    expect(await outbox.pending()).toHaveLength(0);

    let published = 0;
    await outbox.drain(async () => { published += 1; return { success: true }; });
    expect(published).toBe(0);
  });

  it('cancels only what is still waiting', async () => {
    const record = await outbox.enqueue(makeSigned());
    await outbox.drain(ok);

    expect(await outbox.cancel(record.id)).toBe(false);
    expect(await outbox.cancel('no-such-record')).toBe(false);
  });

  it('tells listeners when what is waiting changes', async () => {
    const changed = vi.fn();
    const stop = outbox.onChange(changed);

    const record = await outbox.enqueue(makeSigned());
    await outbox.cancel(record.id);
    await outbox.enqueue(makeSigned('Other Ltd'));
    await outbox.drain(ok);
    stop();
    await outbox.enqueue(makeSigned('Third Co'));

    expect(changed).toHaveBeenCalledTimes(4);
  });

  it('queues a finding and reports it as pending', async () => {
    await outbox.enqueue(makeSigned());
    const pending = await outbox.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe('pending');
    expect(pending[0].attempts).toBe(0);
  });

  it('replaces rather than duplicates a pending record for the same entity+attribute — kind 30082 is one replaceable slot', async () => {
    await outbox.enqueue(makeSigned('Acme Corp', 'location', { lat: 1, lon: 2 }));
    await outbox.enqueue(makeSigned('Acme Corp', 'location', { lat: 9, lon: 9 }));

    const pending = await outbox.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].payload.content.claim.value).toEqual({ lat: 9, lon: 9 });
  });

  it('keeps distinct findings separate', async () => {
    await outbox.enqueue(makeSigned('Acme Corp', 'location'));
    await outbox.enqueue(makeSigned('Other Ltd', 'location'));
    expect(await outbox.pending()).toHaveLength(2);
  });

  it('marks a record sent on a successful drain and stops retrying it', async () => {
    await outbox.enqueue(makeSigned());

    const summary = await outbox.drain(ok);
    expect(summary).toMatchObject({ attempted: 1, sent: 1, stillPending: 0 });
    expect(await outbox.pending()).toHaveLength(0);

    // A second drain must not re-publish something already accepted.
    expect((await outbox.drain(ok)).attempted).toBe(0);
  });

  it('keeps a record pending and records the error when the drain fails', async () => {
    await outbox.enqueue(makeSigned());

    const summary = await outbox.drain(fail);
    expect(summary).toMatchObject({ attempted: 1, sent: 0, stillPending: 1 });

    const [record] = await outbox.pending();
    expect(record.attempts).toBe(1);
    expect(record.lastError).toBe('no relays reachable');
    expect(record.lastAttemptAt).not.toBeNull();
  });

  it('survives a publish function that throws, treating it as a failed attempt', async () => {
    await outbox.enqueue(makeSigned());
    const summary = await outbox.drain(async () => { throw new Error('offline'); });
    expect(summary.stillPending).toBe(1);
    expect((await outbox.pending())[0].lastError).toBe('offline');
  });

  it('abandons — but does not delete — a record after MAX_ATTEMPTS, so "never published" stays visible', async () => {
    await outbox.enqueue(makeSigned());

    for (let i = 0; i < MAX_ATTEMPTS; i++) await outbox.drain(fail);

    expect(await outbox.pending()).toHaveLength(0);
    const abandoned = await outbox.abandoned();
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0].attempts).toBe(MAX_ATTEMPTS);
    expect(abandoned[0].lastError).toBe('no relays reachable');
  });

  it('refuses to publish a record whose signature no longer verifies, and abandons it instead', async () => {
    await outbox.enqueue(makeSigned());

    // Simulate storage corruption / local tampering between sessions.
    const [record] = await store.all();
    await store.put({ ...record, payload: { ...record.payload, content: { ...record.payload.content, confidence: 0.99 } } });

    let published = false;
    const summary = await outbox.drain(async () => { published = true; return { success: true }; });

    expect(published).toBe(false);
    expect(summary.abandoned).toBe(1);
    expect((await outbox.abandoned())[0].lastError).toBe('signature verification failed');
  });

  it('re-enqueueing after abandonment gives the finding a fresh retry budget', async () => {
    await outbox.enqueue(makeSigned());
    for (let i = 0; i < MAX_ATTEMPTS; i++) await outbox.drain(fail);
    expect(await outbox.abandoned()).toHaveLength(1);

    await outbox.enqueue(makeSigned());
    const pending = await outbox.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].attempts).toBe(0);
  });

  it('clearSent removes only confirmed-sent records', async () => {
    await outbox.enqueue(makeSigned('Sent Co', 'location'));
    await outbox.drain(ok);
    await outbox.enqueue(makeSigned('Pending Co', 'location'));
    await outbox.drain(fail);

    expect(await outbox.clearSent()).toBe(1);
    expect(await outbox.pending()).toHaveLength(1);
    expect((await store.all()).every(r => r.status !== 'sent')).toBe(true);
  });

  it('drains oldest first', async () => {
    const order: string[] = [];
    await outbox.enqueue(makeSigned('First Co', 'location'), () => new Date('2026-08-01T00:00:00Z'));
    await outbox.enqueue(makeSigned('Second Co', 'location'), () => new Date('2026-08-02T00:00:00Z'));

    await outbox.drain(async (p) => { order.push(p.content.claim.entityRef); return { success: true }; });
    expect(order).toEqual(['First Co', 'Second Co']);
  });
});

/*
 * A record that exhausted its tries stayed in storage but left every list, so
 * a finding the person believed queued was simply never sent (plan item 9.4).
 * It can now be tried again with a full budget, or let go.
 */
describe('an abandoned record, tried again or let go', () => {
  async function abandonedIn(outbox: PublishOutbox) {
    const record = await outbox.enqueue(makeSigned('Harbour crane', 'status'));
    for (let i = 0; i < MAX_ATTEMPTS; i++) await outbox.drain(fail);
    expect((await outbox.abandoned()).map((r) => r.id)).toEqual([record.id]);
    return record;
  }

  it('is put back with a full budget, and the next drain sends it', async () => {
    const outbox = new PublishOutbox(new MemoryOutboxStore());
    const record = await abandonedIn(outbox);

    expect(await outbox.retry(record.id)).toBe(true);
    const [back] = await outbox.pending();
    expect(back).toMatchObject({ id: record.id, status: 'pending', attempts: 0, lastError: null });

    expect((await outbox.drain(ok)).sent).toBe(1);
    expect(await outbox.abandoned()).toEqual([]);
  });

  it('tries again only what was abandoned', async () => {
    const outbox = new PublishOutbox(new MemoryOutboxStore());
    const waiting = await outbox.enqueue(makeSigned('Relay outage', 'cause'));
    expect(await outbox.retry(waiting.id)).toBe(false);
    expect(await outbox.retry('nope')).toBe(false);
  });

  it('can be let go', async () => {
    const outbox = new PublishOutbox(new MemoryOutboxStore());
    const record = await abandonedIn(outbox);
    expect(await outbox.cancel(record.id)).toBe(true);
    expect(await outbox.abandoned()).toEqual([]);
    expect(await outbox.pending()).toEqual([]);
  });

  it('says so when it changes', async () => {
    const outbox = new PublishOutbox(new MemoryOutboxStore());
    const record = await abandonedIn(outbox);
    const heard = vi.fn();
    outbox.onChange(heard);
    await outbox.retry(record.id);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
