/**
 * Replies to the Mission Packages this node published.
 *
 * ─── THE HALF OF THE LOOP THAT WAS MISSING ─────────────────────────────────
 *
 * Starcom published kind 30079 and consumed nothing — the pipeline model says
 * so in as many words, and the `receive` stage it declares has no `crosses`
 * field because receiving produced no outbound event of any kind. A peer could
 * read a package and had nowhere to put an answer.
 *
 * Mecha Jono's board report of 2026-09-20 put that first, under "blocks the
 * return path": "What comes back matters more to us than what goes out,
 * because the loop closes there." This is the reading half. It does not write.
 *
 * ─── WHAT IT WATCHES ───────────────────────────────────────────────────────
 *
 * Kind 1 events carrying an `a` tag equal to one of our package coordinates —
 * the convention missionPackageThread.ts defines. The coordinates come from
 * `mission.publishedAs`, recorded from the signed event at publish time, so a
 * package stays watchable at the key that actually published it rather than
 * at whatever this node signs under today.
 *
 * It subscribes to NOTHING when given no coordinates. A `#a` filter with an
 * empty list is, on most relays, a filter on nothing at all — which would turn
 * this into a firehose of every kind-1 event on the network.
 *
 * ─── WHAT IT REFUSES ───────────────────────────────────────────────────────
 *
 * An unverifiable signature, and an event whose `a` tag does not actually name
 * a coordinate we asked for. Relays are not obliged to honour a filter
 * faithfully, and an unchecked reply would let anyone put words under anyone's
 * name in a thread about our own package.
 */
import { verifyEvent, type Event as NostrEvent, type Filter, type SimplePool } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import { repliedCoordinates } from './missionPackageThread';
import { PROTOCOL_KINDS } from '../nostr/kindRegistry';
import { readRelays } from '../nostr/publishTargets';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'MissionPackageReplies' });

/** Kind 1: an ordinary note. A reply is a note that names what it answers. */
const REPLY_KIND = 1;

export interface PackageReply {
  /** The reply event's own id. */
  id: string;
  /** Who wrote it. Not resolved to a name — this node knows of no such name. */
  pubkey: string;
  content: string;
  /** The event's own stated time, in UTC (decision D-E). */
  createdAt: Date;
  /** The package coordinate it answers. */
  coordinate: string;
  /** Which relay it arrived on. */
  relay: string;
}

export interface ReplyCounters {
  seen: number;
  accepted: number;
  /** Rejected: a bad signature, or an `a` tag we never asked about. */
  refused: number;
}

/**
 * Rebuild from canonical fields before verifying.
 *
 * nostr-tools' `verifyEvent` short-circuits on a cached symbol that spread
 * copies, so a tampered object can verify without the hash being recomputed.
 * See the long note in capability/missionCapability.ts — same hazard, same
 * guard.
 */
const canonical = (e: NostrEvent): NostrEvent => ({
  id: e.id, pubkey: e.pubkey, created_at: e.created_at,
  kind: e.kind, tags: e.tags, content: e.content, sig: e.sig,
} as NostrEvent);

export class MissionPackageReplyIngest {
  private pool: SimplePool | null = null;
  private closers: Array<() => void> = [];
  private seenIds = new Set<string>();
  private listeners = new Set<(reply: PackageReply) => void>();
  private watching = new Set<string>();
  private counters: ReplyCounters = { seen: 0, accepted: 0, refused: 0 };

  /*
   * The read set. A reply may be posted anywhere a peer can reach, including
   * The Record, so listening only where WE publish would miss it — the same
   * mistake the package ingest made.
   */
  constructor(private readonly relays: string[] = [...readRelays('MISSION')]) {}

  getCounters(): ReplyCounters {
    return { ...this.counters };
  }

  /** The coordinates currently watched, for a surface that reports coverage. */
  getWatched(): string[] {
    return [...this.watching];
  }

  subscribe(listener: (reply: PackageReply) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Watch these coordinates. Restarts the subscription when the set changes,
   * because a relay filter is fixed once opened.
   */
  start(coordinates: string[], sinceSeconds?: number): void {
    const wanted = [...new Set(coordinates.filter((c) => c.trim().length > 0))];

    // Nothing of ours is published, so there is nothing to hear about. Opening
    // a subscription anyway would ask every relay for all of kind 1.
    if (wanted.length === 0) {
      this.stop();
      return;
    }

    const unchanged = wanted.length === this.watching.size
      && wanted.every((c) => this.watching.has(c));
    if (this.pool && unchanged) return;

    this.stop();
    this.watching = new Set(wanted);
    this.pool = createRelayPool();

    const since = sinceSeconds ? { since: sinceSeconds } : {};
    // Kind 1 replies as they were sent, and comments on the package (NIP-22,
    // kind 1111, the package as root in an A tag) as they are sent now (plan
    // item 5.1). One filter per subscription, as nostr-tools 2.25 takes them.
    const filters: Array<Filter & { '#a'?: string[]; '#A'?: string[] }> = [
      { kinds: [REPLY_KIND], '#a': wanted, ...since },
      { kinds: [PROTOCOL_KINDS.NIP22_COMMENT], '#A': wanted, ...since },
    ];

    for (const relay of this.relays) {
      for (const filter of filters) {
        const sub = this.pool.subscribeMany([relay], filter, {
          onevent: (event: NostrEvent) => this.handle(event, relay),
          onclose: (reason: unknown) => log.debug(`reply subscription closed on ${relay}`, reason),
        });
        this.closers.push(() => sub.close?.());
      }
    }
    log.info(`watching ${this.relays.length} relay(s) for replies to ${wanted.length} package(s)`);
  }

  private handle(event: NostrEvent, relay: string): void {
    if (!event?.id || this.seenIds.has(event.id)) return;
    this.seenIds.add(event.id);
    this.counters.seen += 1;

    if (!verifyEvent(canonical(event))) {
      this.counters.refused += 1;
      log.debug('refused a reply whose signature does not verify', { id: event.id, relay });
      return;
    }

    // Only the coordinates we asked about. A relay may answer a filter loosely,
    // and a reply to somebody else's package is not ours to show as one.
    const matched = repliedCoordinates(event).filter((c) => this.watching.has(c));
    if (matched.length === 0) {
      this.counters.refused += 1;
      return;
    }

    this.counters.accepted += 1;
    for (const coordinate of matched) {
      const reply: PackageReply = {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content ?? '',
        createdAt: new Date(event.created_at * 1000),
        coordinate,
        relay,
      };
      this.listeners.forEach((listener) => {
        try { listener(reply); } catch (error) { log.warn('a reply listener threw', error); }
      });
    }
  }

  stop(): void {
    this.closers.forEach((close) => { try { close(); } catch { /* already closed */ } });
    this.closers = [];
    if (this.pool) {
      try { this.pool.close(this.relays); } catch { /* already closed */ }
      this.pool = null;
    }
    this.watching.clear();
  }
}
