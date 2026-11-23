/**
 * The findings outbox on the job rail (BD13): one job while records wait, its
 * queue the number waiting; hold and resume pause the queue; cancel cancels
 * every record still waiting. It ends when nothing waits.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { PublishOutbox } from '../../intel/outbox/PublishOutbox';
import { MemoryOutboxStore } from '../../intel/outbox/OutboxStore';
import type { OutboxRecord } from '../../intel/outbox/OutboxTypes';
import { jobs } from '../jobRegistry';
import { watchKeptNotes, watchOutbox } from '../outboxJob';
import { EventOutbox } from '../../intel/outbox/EventOutbox';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

// The record's own fields, as the outbox stores them; the payload is never read here.
const record = (id: string): OutboxRecord => ({
  id, schemaVersion: 1, kind: 'finding', dedupeKey: id, payload: {} as OutboxRecord['payload'],
  createdAt: '2026-10-05T00:00:00.000Z', attempts: 0, lastAttemptAt: null, lastError: null, status: 'pending',
});

const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => jobs.clearForTest());

describe('watchOutbox', () => {
  it('lists one job while findings wait, saying how many', async () => {
    const store = new MemoryOutboxStore();
    await store.put(record('a'));
    await store.put(record('b'));
    const outbox = new PublishOutbox(store);
    const stop = watchOutbox(outbox);
    await settle();
    expect(jobs.list()).toEqual([expect.objectContaining({ kind: 'findings-publish', state: 'running', queued: 2, detail: '2 findings waiting to send' })]);
    stop();
  });

  it('holds and resumes the queue from the job', async () => {
    const store = new MemoryOutboxStore();
    await store.put(record('a'));
    const outbox = new PublishOutbox(store);
    const stop = watchOutbox(outbox);
    await settle();
    jobs.list()[0].hold!();
    await settle();
    expect(outbox.isHeld()).toBe(true);
    expect(jobs.list()[0].state).toBe('held');
    jobs.list()[0].resume!();
    await settle();
    expect(outbox.isHeld()).toBe(false);
    expect(jobs.list()[0].state).toBe('running');
    stop();
  });

  it('cancels every waiting finding from the job, and then ends', async () => {
    const store = new MemoryOutboxStore();
    await store.put(record('a'));
    await store.put(record('b'));
    const outbox = new PublishOutbox(store);
    const stop = watchOutbox(outbox);
    await settle();
    jobs.list()[0].cancel!();
    await settle(); await settle();
    expect(await outbox.pending()).toHaveLength(0);
    expect(jobs.list()[0]).toMatchObject({ state: 'done', detail: 'cancelled before sending' });
    stop();
  });

  it('lists nothing when nothing waits', async () => {
    const stop = watchOutbox(new PublishOutbox(new MemoryOutboxStore()));
    await settle();
    expect(jobs.list()).toEqual([]);
    stop();
  });
});

describe('watchKeptNotes', () => {
  it('lists the notes kept when no relay took them as a job of their own, and cancel lets them go', async () => {
    const outbox = new EventOutbox(new MemoryOutboxStore());
    const secret = generateSecretKey();
    await outbox.keep(finalizeEvent({ kind: 30023, tags: [['d', 'r1']], content: '', created_at: 100 }, secret), ['wss://one.example']);
    const stop = watchKeptNotes(outbox);
    await settle();
    const [job] = jobs.list();
    expect(job).toEqual(expect.objectContaining({ kind: 'notes-publish', label: 'Publishing kept notes', queued: 1, detail: '1 note waiting to send' }));
    job.cancel?.();
    await settle();
    await settle();
    expect(await outbox.waiting()).toEqual([]);
    stop();
  });
});
