import type { SimplePool } from 'nostr-tools';
import { createRelayPool } from '../../nostr/relayPool';
import { readRelays } from '../../nostr/publishTargets';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { FINDING_KIND } from '../findings/FindingsBroadcastService';
import { ForeignFindingStore } from './ForeignFindingStore';
import { RefutationStore } from './RefutationStore';
import { REFUTATION_KIND } from '../findings/refutation';
import { nostrIdentityService } from '../../identity/NostrIdentityService';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'FederationIngest' });

/**
 * Subscribe to findings published by other instances.
 *
 * This is the moment "network" stops being aspirational. Until now this app
 * broadcast findings to relays that nothing — including itself — subscribed
 * to, which is one instance shouting rather than a federation.
 *
 * Its own service rather than an addition to NostrStarcomIntelIngest: that
 * ingest reads kinds 1 and 30023 as intel REPORTS and parses them for
 * geo-tagged content. A finding is a different shape with different
 * verification rules, and folding it in would mean one code path guessing which
 * kind of thing it just received.
 */

/*
 * Where findings are read: readRelays('FINDING'), which is The Record and then
 * the public surface unless the build configures findings (plan item 0.3). The
 * list was written out here once, beginning with The Record, which is still
 * first, for the reason below.
 *
 * The Record — a peer-operated, kind-scoped archive.
 *
 * Listening here is not optional for the integration to exist. Mecha Jono
 * publishes attested claims to this relay; without it in the READ set, every
 * piece of identity and discovery work is inert, because the claims arrive
 * somewhere the app is not listening. Reads are open — no allowlist, no auth
 * — so this costs nothing but a connection.
 *
 * Public relays follow, and both matter: The Record is where peers publish,
 * the public set is where anyone else can, and a node that only listened to
 * one peer would have replaced an open network with a private feed.
 */

/** How far back to look on connect. Findings decay; ancient ones are archaeology. */
const DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;

export interface FederationIngestMetrics {
  received: number;
  accepted: number;
  rejected: number;
  relays: number;
  /** Refutations kept, counted apart so disagreement is visible as its own signal. */
  refutations: number;
}

export class FederationIngestService {
  private pool: SimplePool | null = null;
  private closer: { close: () => void } | null = null;
  private metrics: FederationIngestMetrics = { received: 0, accepted: 0, rejected: 0, relays: 0, refutations: 0 };

  constructor(
    readonly store: ForeignFindingStore = new ForeignFindingStore(() => nostrIdentityService.signerPubkey()),
    private relays: string[] = readRelays('FINDING'),
    /**
     * Refutations are held apart from claims, because a refutation does not
     * occupy a claim's slot and must never be returned where a claim was asked
     * for. See RefutationStore.
     */
    readonly refutations: RefutationStore = new RefutationStore(() => nostrIdentityService.signerPubkey()),
  ) {}

  /**
   * Start listening. Idempotent — calling twice does not open two subscriptions.
   *
   * Every event is verified by the store before it is kept; nothing here trusts
   * a relay to have served something genuine.
   */
  start(lookbackMs: number = DEFAULT_LOOKBACK_MS): void {
    if (this.closer) return;

    this.pool = createRelayPool();
    this.metrics.relays = this.relays.length;

    /**
     * Filtered by TAG as well as kind.
     *
     * Kind 30082 sits in Nostr's app-specific replaceable range, which is
     * unregistered — and it is already in use by unrelated applications.
     * Measured against the public relay set: 134 events in 25 seconds from a
     * dozen authors, every one of them rejected as unsupported-schema or
     * unparseable, with slots like `bro-coordinator` and bare UUIDs.
     *
     * The validator refused all of them, so nothing unsafe was getting in. But
     * subscribing on kind alone means the ingest metrics count mostly other
     * people's traffic, and the rejection work scales with strangers rather
     * than with peers.
     */
    /**
     * Both kinds on one subscription, because a claim without its refutations
     * is a claim that looks uncontested. Subscribing to 30082 alone was the
     * quieter half of the same defect the tag filter fixed: the app could see
     * only agreement, so agreement was all it could ever report.
     *
     * `attested-claim` covers both — the NIP names the tag in the claim section
     * and states plainly that a refutation IS an attestation.
     */
    const filter: Filter = {
      kinds: [FINDING_KIND, REFUTATION_KIND],
      '#t': ['attested-claim'],
      since: Math.floor((Date.now() - lookbackMs) / 1000),
    };

    log.info(`Subscribing to kinds ${FINDING_KIND}, ${REFUTATION_KIND} across ${this.relays.length} relays`);

    this.closer = this.pool.subscribeMany(this.relays, filter, {
      onevent: (event: NostrEvent) => this.onEvent(event),
      oneose: () => log.debug('End of stored events'),
    });
  }

  private onEvent(event: NostrEvent): void {
    this.metrics.received += 1;
    let payload: unknown;
    try {
      payload = JSON.parse(event.content);
    } catch {
      // A relay serving unparseable content is a fact worth counting, not an
      // exception worth throwing into a subscription callback.
      this.metrics.rejected += 1;
      return;
    }

    // Routed by kind, never by shape-sniffing the payload. A refutation and a
    // claim are both signed attestations, and guessing between them would put a
    // refutation in the claim store the first time the guess was wrong.
    if (event.kind === REFUTATION_KIND) {
      const r = this.refutations.accept(payload);
      // Counted APART, as the field's own doc says. Adding to `accepted` too
      // meant an operator reading it as "claims kept" over-counted by the
      // refutation volume, and a relay flooding refutations inflated the very
      // number used to judge whether claim ingest was healthy.
      if (r.accepted) { this.metrics.refutations += 1; }
      else this.metrics.rejected += 1;
      return;
    }

    const result = this.store.accept(payload);
    if (result.accepted) this.metrics.accepted += 1;
    else this.metrics.rejected += 1;
  }

  stop(): void {
    this.closer?.close();
    this.closer = null;
    this.pool?.close(this.relays);
    this.pool = null;
  }

  getMetrics(): FederationIngestMetrics {
    return { ...this.metrics };
  }
}

export const federationIngestService = new FederationIngestService();
