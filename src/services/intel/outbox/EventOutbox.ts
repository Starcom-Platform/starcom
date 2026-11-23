/**
 * Notes signed after a publish review that no relay took (work package W1, docs/missions/04-plan/
 * relay-capability-work.md): kept on this device, and sent when a relay answers.
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * Only findings waited (PublishOutbox). A report published with no connection failed with "No relay took it", and
 * nothing was kept: the person had to notice, and publish it again later. Interns publish from cafés and trains.
 *
 * ─── WHAT IS KEPT ──────────────────────────────────────────────────────────
 *
 * The event exactly as it was signed, with the relays its review named. Unlike a finding, which is signed again
 * when it goes, nothing here is signed twice: a locked key, or Uplink, would otherwise ask the person again for
 * something they already said yes to, possibly days later and with no review on screen. The time it carries is when
 * it was reviewed and signed, which is when it was published. Relays keep the newest version of a replaceable note
 * by that time, and a withdrawal's deletion and notice keep their order by it (RP7), whatever order they arrive in.
 *
 * A newer version of a note waiting for the same slot replaces it: a relay would keep only the newer one anyway. A
 * note sent is removed, and its report records it (`after`); a note cancelled is removed, and its report never
 * says it was published. After ten failed tries, or as soon as every relay refuses it for good, a note waits for
 * the person: try again, or cancel.
 *
 * Before it goes, its signature is checked again: storage corruption or tampering must not turn this queue into a
 * way to publish what this person never signed.
 */
import { verifyEvent, type Event } from 'nostr-tools';
import { createDefaultOutboxStore, type OutboxStore } from './OutboxStore';
import { refusedForGood } from '../../nostr/relayRefusal';
import type { DrainSummary } from './OutboxTypes';
import { markSending, recordAfterSent, type AfterSent } from '../publishedReports';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'EventOutbox' });

const EVENT_OUTBOX_SCHEMA_VERSION = 1;
/** Tries before a note waits for the person, as for findings (PublishOutbox's MAX_ATTEMPTS). */
const MAX_EVENT_ATTEMPTS = 10;

/**
 * What a kept note's going means: for a report (AfterSent), or for a mission, whose Mission Package was kept when no
 * relay took it (W1c) and which is dispatched once it goes. A mission's is recorded by whoever listens (whenSent),
 * since the mission service is not loaded here.
 */
export type KeptAfter = AfterSent | { dispatched: { mission: string } };

const forReport = (after: KeptAfter | undefined): after is AfterSent => !!after && ('published' in after || 'withdrawn' in after);

/** A Mission Package kept for this mission. */
export const isKeptPackageOf = (record: WaitingEvent, missionId: string): boolean =>
  !!record.after && 'dispatched' in record.after && record.after.dispatched.mission === missionId;

export interface WaitingEvent {
  /** The event's own id. */
  id: string;
  schemaVersion: number;
  /** As signed after its review. */
  event: Event;
  /** Where its review said it goes. */
  relays: string[];
  /** The slot a relay keeps one of (see slotOf). */
  slot: string;
  /** What its going means for a report, or a mission. */
  after?: KeptAfter;
  keptAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  /** `abandoned`: ten tries failed, and it waits for the person to try again or cancel. */
  status: 'pending' | 'abandoned';
}

/** Offers an event already signed to these relays; resolves with how many took it, throws when none did. */
export type ResendFn = (event: Event, relays: readonly string[]) => Promise<number>;

/**
 * The slot a relay keeps one of: kind and author for a replaceable kind, and its `d` too for an addressable one.
 * Any other event is its own slot.
 */
export function slotOf(event: Pick<Event, 'id' | 'kind' | 'pubkey' | 'tags'>): string {
  const { kind } = event;
  if (kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000)) return `${kind}:${event.pubkey}`;
  if (kind >= 30000 && kind < 40000) return `${kind}:${event.pubkey}:${event.tags.find((t) => t[0] === 'd')?.[1] ?? ''}`;
  return event.id;
}

/**
 * The event's own fields and nothing else. nostr-tools caches a verdict on the event object when it checks a
 * signature, and a copy made by spreading carries that verdict along; a plain copy is checked from its bytes.
 */
const plain = ({ id, pubkey, created_at, kind, tags, content, sig }: Event): Event => ({ id, pubkey, created_at, kind, tags, content, sig });

/** Oldest signature first: a deletion goes before the notice signed a second after it. */
const bySigning = (a: WaitingEvent, b: WaitingEvent) => a.event.created_at - b.event.created_at || a.keptAt.localeCompare(b.keptAt);

export class EventOutbox {
  private listeners = new Set<() => void>();
  private held = false;
  private draining: Promise<DrainSummary> | null = null;
  private sentHooks = new Set<(record: WaitingEvent, took: number) => void | Promise<void>>();

  constructor(private readonly store: OutboxStore<WaitingEvent> = createDefaultOutboxStore<WaitingEvent>({
    db: 'starcom-event-outbox', store: 'signed-events', localKey: 'starcom_event_outbox_v1',
  })) {}

  /** Hold the queue from the job rail (BD13): drains send nothing until it is resumed. */
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

  /** Called whenever what waits may have changed. Returns the unsubscribe. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private changed(): void {
    for (const listener of this.listeners) {
      try { listener(); } catch (err) { log.warn('Outbox listener threw:', err instanceof Error ? err.message : String(err)); }
    }
  }

  /** Called with each kept note once it went, and how many relays took it. Returns the unsubscribe. */
  whenSent(hook: (record: WaitingEvent, took: number) => void | Promise<void>): () => void {
    this.sentHooks.add(hook);
    return () => { this.sentHooks.delete(hook); };
  }

  /** Keep a signed event no relay took, to send when one answers. A newer version of the same slot replaces it. */
  async keep(event: Event, relays: readonly string[], { after, now = () => new Date() }: { after?: KeptAfter; now?: () => Date } = {}): Promise<WaitingEvent> {
    const slot = slotOf(event);
    for (const older of await this.store.all()) {
      if (older.id !== event.id && older.slot === slot && older.event.created_at <= event.created_at) await this.store.remove(older.id);
    }
    const record: WaitingEvent = {
      id: event.id,
      schemaVersion: EVENT_OUTBOX_SCHEMA_VERSION,
      event: plain(event),
      relays: [...relays],
      slot,
      ...(after ? { after } : {}),
      keptAt: now().toISOString(),
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      status: 'pending',
    };
    await this.store.put(record);
    log.info(`Kept event ${event.id.slice(0, 12)} (kind ${event.kind}) until a relay takes it`);
    this.changed();
    return record;
  }

  /** Everything waiting, and everything given up on, oldest signature first. */
  async waiting(): Promise<WaitingEvent[]> {
    return (await this.store.all()).sort(bySigning);
  }

  async pending(): Promise<WaitingEvent[]> {
    return (await this.waiting()).filter((r) => r.status === 'pending');
  }

  /** Let a note go unsent. Returns false when nothing under that id waits. */
  async cancel(id: string): Promise<boolean> {
    if (!(await this.store.all()).some((r) => r.id === id)) return false;
    await this.store.remove(id);
    this.changed();
    return true;
  }

  /** Let go every kept note this matches: a mission moved back, or deleted, lets its kept package go. */
  async cancelWhere(matches: (record: WaitingEvent) => boolean): Promise<number> {
    const gone = (await this.store.all()).filter(matches);
    for (const record of gone) await this.store.remove(record.id);
    if (gone.length) this.changed();
    return gone.length;
  }

  /** Put a note that used up its tries back in the queue, with a full budget. Returns false when it is not given up. */
  async retry(id: string): Promise<boolean> {
    const record = (await this.store.all()).find((r) => r.id === id);
    if (!record || record.status !== 'abandoned') return false;
    await this.store.put({ ...record, status: 'pending', attempts: 0, lastError: null });
    this.changed();
    return true;
  }

  /**
   * Try every waiting note once, oldest signature first. One drain at a time: a second call while one runs gets
   * the same answer, so the online event and a timer firing together never send a note twice.
   */
  drain(resend: ResendFn, now: () => Date = () => new Date()): Promise<DrainSummary> {
    this.draining ??= this.drainOnce(resend, now).finally(() => { this.draining = null; });
    return this.draining;
  }

  private async drainOnce(resend: ResendFn, now: () => Date): Promise<DrainSummary> {
    const summary: DrainSummary = { attempted: 0, sent: 0, stillPending: 0, abandoned: 0 };
    if (this.held) return summary;
    for (const record of await this.pending()) {
      summary.attempted += 1;
      const lastAttemptAt = now().toISOString();
      if (!verifyEvent(plain(record.event))) {
        log.error(`Kept event ${record.id} failed its signature check: given up, not sent`);
        await this.store.put({ ...record, status: 'abandoned', attempts: record.attempts + 1, lastAttemptAt, lastError: 'its signature no longer checks' });
        summary.abandoned += 1;
        continue;
      }
      // A report's own note read back while it goes is the report's, not a second copy (RP5).
      const sending = record.after && 'published' in record.after ? markSending(record.after.published.address) : () => undefined;
      try {
        const took = await resend(record.event, record.relays);
        await this.store.remove(record.id);
        if (forReport(record.after)) recordAfterSent(record.after, record.event.id, record.event.created_at * 1000, took);
        for (const hook of this.sentHooks) {
          try { await hook(record, took); } catch (err) { log.warn('A sent hook threw:', err instanceof Error ? err.message : String(err)); }
        }
        summary.sent += 1;
      } catch (err) {
        const attempts = record.attempts + 1;
        // Every relay that answered refused it for good: trying again will not change that, so the person decides now.
        const said = (err as { said?: unknown } | null)?.said;
        const exhausted = attempts >= MAX_EVENT_ATTEMPTS || (Array.isArray(said) && refusedForGood(said as string[]));
        await this.store.put({
          ...record, attempts, lastAttemptAt, lastError: err instanceof Error ? err.message : String(err), status: exhausted ? 'abandoned' : 'pending',
        });
        if (exhausted) summary.abandoned += 1;
        else summary.stillPending += 1;
      } finally {
        sending();
      }
    }
    if (summary.attempted > 0) this.changed();
    return summary;
  }
}

export const eventOutbox = new EventOutbox();
