import type { SignedFinding } from '../findings/signFinding';
import { verifyFindingSignature } from '../findings/signFinding';
import { findingIdentifier } from '../findings/FindingContent';
import { OUTBOX_SCHEMA_VERSION, type DrainSummary, type OutboxRecord } from './OutboxTypes';
import { createDefaultOutboxStore, type OutboxStore } from './OutboxStore';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'PublishOutbox' });

/**
 * After this many failed drains a record stops being retried and becomes
 * `abandoned` — visible, not deleted. Ten is a deliberate compromise: high
 * enough to ride out a long offline stretch or a relay set having a bad
 * day, low enough that a permanently malformed record stops consuming
 * every drain forever.
 */
export const MAX_ATTEMPTS = 10;

export type PublishFn = (payload: SignedFinding, relays?: string[]) => Promise<{ success: boolean; error?: string }>;

/**
 * Durable queue for findings that could not be broadcast.
 *
 * The gap this closes: FindingsBroadcastService publishes to five relays and
 * reports success if at least one accepts. If none accept — offline, all five
 * unreachable, or every one of them rejecting the event — the finding was
 * simply lost. Nothing retried, nothing recorded, and the operator's only
 * signal was a failed return value on a call they may not have been watching.
 * For an app whose stated premise is censorship-resistant publishing, "the
 * network was hostile so we dropped it" is precisely the wrong behaviour.
 *
 * Scope of this first pass, stated so the next pass knows what it inherits:
 * whole-publish granularity only. A drain that reaches 2 of 5 relays counts
 * as sent, exactly as the broadcast service already defines success. Per-relay
 * tracking — retrying only the three that failed, scoring relay health,
 * reacting to online/offline events — is a deliberate follow-up, not an
 * oversight. See the module's companion notes in the review doc.
 */
export class PublishOutbox {
  private store: OutboxStore;
  private listeners = new Set<() => void>();
  private held = false;

  /**
   * Hold the queue (BD13): drains send nothing until it is resumed. The one
   * job the rail can hold, since it is a queue that waits anyway.
   */
  hold(): void {
    if (this.held) return;
    this.held = true;
    this.changed();
  }

  resume(): void {
    if (!this.held) return;
    this.held = false;
    this.changed();
  }

  isHeld(): boolean {
    return this.held;
  }

  constructor(store: OutboxStore = createDefaultOutboxStore()) {
    this.store = store;
  }

  /**
   * Called whenever what is waiting may have changed: a finding queued, a
   * drain, a cancellation. The queue drains by itself, so a surface showing
   * it has to hear about changes it did not make. Returns the unsubscribe.
   */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private changed(): void {
    for (const listener of this.listeners) {
      try { listener(); } catch (err) { log.warn('Outbox listener threw:', err instanceof Error ? err.message : String(err)); }
    }
  }

  /**
   * Withdraw a finding that is still waiting, or one given up on, so no drain
   * ever sends it. Returns false when there is nothing under that id to let
   * go: already sent, cancelled, or never queued.
   */
  async cancel(id: string, now: () => Date = () => new Date()): Promise<boolean> {
    const record = (await this.store.all()).find(r => r.id === id);
    if (!record || (record.status !== 'pending' && record.status !== 'abandoned')) return false;
    await this.store.put({ ...record, status: 'cancelled', lastAttemptAt: now().toISOString(), lastError: 'cancelled before sending' });
    log.info(`Cancelled waiting finding ${record.dedupeKey}`);
    this.changed();
    return true;
  }

  /**
   * Queue a finding for later publication. If a pending record already
   * exists for the same finding (same entity + attribute, i.e. the same
   * replaceable relay slot), it is REPLACED rather than duplicated — the
   * newer computation supersedes the older one, which is the same semantics
   * relays apply to kind 30082 itself.
   */
  async enqueue(
    payload: SignedFinding,
    { relays, now = () => new Date() }: { relays?: string[]; now?: () => Date } = {},
  ): Promise<OutboxRecord> {
    const dedupeKey = findingIdentifier(payload);
    const existing = (await this.store.all()).find(r => r.dedupeKey === dedupeKey && r.status === 'pending');

    const record: OutboxRecord = {
      id: existing?.id ?? `outbox_${dedupeKey}_${now().getTime()}`,
      schemaVersion: OUTBOX_SCHEMA_VERSION,
      kind: 'finding',
      dedupeKey,
      payload,
      ...(relays ? { relays } : {}),
      createdAt: existing?.createdAt ?? now().toISOString(),
      // Attempts reset on replacement: this is different content for the
      // same slot, and it deserves its own full retry budget rather than
      // inheriting the exhaustion of the claim it supersedes.
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      status: 'pending'
    };

    await this.store.put(record);
    log.info(`Queued finding ${dedupeKey}${existing ? ' (replaced pending record)' : ''}`);
    this.changed();
    return record;
  }

  /**
   * Put a record that used up its tries back in the queue, with a full budget
   * (plan item 9.4). Returns false when it is not abandoned.
   */
  async retry(id: string): Promise<boolean> {
    const record = (await this.store.all()).find(r => r.id === id);
    if (!record || record.status !== 'abandoned') return false;
    await this.store.put({ ...record, status: 'pending', attempts: 0, lastError: null });
    log.info(`Trying again finding ${record.dedupeKey}`);
    this.changed();
    return true;
  }

  async pending(): Promise<OutboxRecord[]> {
    const all = await this.store.all();
    return all
      .filter(r => r.status === 'pending')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Records that exhausted their retry budget. Surfaced, never silently dropped. */
  async abandoned(): Promise<OutboxRecord[]> {
    return (await this.store.all()).filter(r => r.status === 'abandoned');
  }

  /**
   * Attempt every pending record once, oldest first.
   *
   * One attempt per record per drain — the caller decides cadence. Retrying
   * in a tight loop inside a single drain would burn the whole ten-attempt
   * budget against a relay set that is down right now and would have
   * accepted the event five minutes later.
   */
  async drain(publish: PublishFn, now: () => Date = () => new Date()): Promise<DrainSummary> {
    const summary: DrainSummary = { attempted: 0, sent: 0, stillPending: 0, abandoned: 0 };
    // Held from the job rail (BD13): nothing is sent, and every record stays.
    if (this.held) return summary;
    const records = await this.pending();

    for (const record of records) {
      summary.attempted += 1;

      // A queued record has been sitting in browser storage, possibly for
      // days. Verify the signature still checks out before putting it on
      // the wire: storage corruption or local tampering must not turn this
      // queue into a path for publishing something this instance never
      // actually signed.
      if (!verifyFindingSignature(record.payload)) {
        log.error(`Record ${record.id} failed signature verification — abandoning, not publishing`);
        await this.store.put({
          ...record,
          status: 'abandoned',
          lastAttemptAt: now().toISOString(),
          lastError: 'signature verification failed'
        });
        summary.abandoned += 1;
        continue;
      }

      let ok = false;
      let error: string | undefined;
      try {
        const result = await publish(record.payload, record.relays);
        ok = result.success;
        error = result.error;
      } catch (err) {
        ok = false;
        error = err instanceof Error ? err.message : String(err);
      }

      const attempts = record.attempts + 1;
      const lastAttemptAt = now().toISOString();

      if (ok) {
        await this.store.put({ ...record, attempts, lastAttemptAt, lastError: null, status: 'sent' });
        summary.sent += 1;
        continue;
      }

      const exhausted = attempts >= MAX_ATTEMPTS;
      await this.store.put({
        ...record,
        attempts,
        lastAttemptAt,
        lastError: error ?? 'unknown publish failure',
        status: exhausted ? 'abandoned' : 'pending'
      });
      if (exhausted) {
        log.warn(`Record ${record.id} exhausted ${MAX_ATTEMPTS} attempts — abandoned (kept for inspection)`);
        summary.abandoned += 1;
      } else {
        summary.stillPending += 1;
      }
    }

    if (summary.attempted > 0) this.changed();
    return summary;
  }

  /** Drop records already confirmed sent. Never touches pending or abandoned ones. */
  async clearSent(): Promise<number> {
    const sent = (await this.store.all()).filter(r => r.status === 'sent');
    for (const r of sent) await this.store.remove(r.id);
    return sent.length;
  }
}

export const publishOutbox = new PublishOutbox();
