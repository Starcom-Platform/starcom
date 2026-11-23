/**
 * Subscribe to Mission Packages and verify what arrives.
 *
 * The receiving half of the dispatch track. Starcom published kind 30079 and
 * consumed nothing, so a package another node sent was invisible here — and
 * the verifier this wraps had no caller, which makes it a capability that
 * exists in the test suite and nowhere else.
 *
 * DELIBERATELY DOES NOT IMPORT INTO THE WORKSPACE. A verified package is a
 * true statement by another node, not automatically a record in this one.
 * What a foreign mission means locally — whether it becomes a mission, who it
 * is attributed to, what it may corroborate — is a trust decision with real
 * consequences, and answering it by silently writing to storage would be the
 * wrong kind of helpful. This reports; a consumer decides.
 *
 * Refusals are surfaced rather than swallowed, with the same discipline the
 * intel ingest already uses: a rejected event is a fact worth knowing, not a
 * silent discard. A receiver that quietly drops malformed packages cannot
 * tell "nobody sent anything" from "everything sent was wrong".
 */
import type { Event as NostrEvent, Filter, SimplePool } from 'nostr-tools';
import { agentTagged, markAgentKey } from '../identity/agentKeys';
import { createRelayPool } from '../nostr/relayPool';
import { readComplete } from '../nostr/readComplete';
import { createLogger } from '../../utils/logger';
import { MISSION_PACKAGE_KIND, missionPackageReadRelays } from './MissionPackageBroadcastService';
import {
  verifyMissionPackageEvent, type PackageCheck, type PackageRefusal, type AdmissionPolicy,
} from './MissionPackageVerifier';

const log = createLogger({ prefix: 'MissionPackageIngest' });

export interface AcceptedPackage {
  event: NostrEvent;
  check: PackageCheck;
  relay: string;
}

export interface RefusedPackage {
  eventId: string;
  pubkey: string;
  code: PackageRefusal;
  reason: string;
  relay: string;
}

export interface IngestCounters {
  seen: number;
  accepted: number;
  refused: number;
  /** Refusals by cause, so "everything was wrong" is distinguishable from "nothing arrived". */
  refusedBy: Partial<Record<PackageRefusal, number>>;
}

export class MissionPackageIngest {
  private pool: SimplePool | null = null;
  private closers: Array<() => void> = [];
  private readonly counters: IngestCounters = { seen: 0, accepted: 0, refused: 0, refusedBy: {} };
  private readonly accepted = new Set<(p: AcceptedPackage) => void>();
  private readonly refused = new Set<(p: RefusedPackage) => void>();
  /** Replaceable events re-deliver on reconnect; verifying twice is waste, not error. */
  private readonly seenIds = new Set<string>();
  /** The relays whose packages are all in, read to the end or failed (D-MF, step 5e). */
  private readonly settledRelays = new Set<string>();
  /** Packages still being verified. */
  private verifying = 0;
  private readonly settledListeners = new Set<() => void>();

  constructor(
    /*
     * The READ set, not the publish set. This defaulted to
     * missionPackageRelays() — publish destinations — so a peer publishing to
     * The Record was invisible: never refused, never counted, never asked for.
     *
     * READING IT IS NOT THE SAME AS CONSUMING THEIR BOARD. Measured against
     * the live relay on 2026-09-21: Mecha Jono's three open threads are kind
     * 30079 tagged `t=open_case` with `d=ic-uei-…`, carrying `ask` tags of the
     * form `<case_id>#<audience>` and a content schema that is not
     * PackageManifest at all. The subscription below narrows on
     * `t=starcom_mission_package`, so those never arrive here — which is
     * correct rather than a gap: the spec's own note says the `d` tag, not the
     * kind number, is what keeps two apps apart on a shared kind, and theirs
     * and ours do not collide.
     *
     * What this relay change does buy is everything addressed to US that a
     * peer posts there — replies to our packages among them. Consuming their
     * format is separate work, and should follow their published spec rather
     * than a guess made from three sampled events.
     */
    private readonly relays: string[] = missionPackageReadRelays(),
    /** Which publishing nodes to admit. Empty admits everyone — see AdmissionPolicy. */
    private readonly policy: AdmissionPolicy = {},
  ) {}

  /**
   * Publishers seen, whether or not admitted.
   *
   * A receiver that only counts what it accepted cannot tell an empty network
   * from a network it is refusing wholesale — the same reasoning as counting
   * refusals by cause.
   */
  private readonly publishers = new Map<string, { accepted: number; refused: number }>();

  seenPublishers(): Array<{ pubkey: string; accepted: number; refused: number }> {
    return [...this.publishers.entries()].map(([pubkey, c]) => ({ pubkey, ...c }));
  }

  onAccepted(listener: (p: AcceptedPackage) => void): () => void {
    this.accepted.add(listener);
    return () => this.accepted.delete(listener);
  }

  onRefused(listener: (p: RefusedPackage) => void): () => void {
    this.refused.add(listener);
    return () => this.refused.delete(listener);
  }

  /**
   * Whether every package the relays hold has been read and verified: each relay read to its end (paged past a
   * relay's cap, readComplete) or failed. A card is never made from half a read (The Record's 500 cap, 4ff10bb8).
   */
  isSettled(): boolean {
    return this.relays.length > 0 && this.settledRelays.size >= this.relays.length && this.verifying === 0;
  }

  /** Hear when the read is settled, and again if it settles after more arrive. */
  onSettled(listener: () => void): () => void {
    this.settledListeners.add(listener);
    return () => this.settledListeners.delete(listener);
  }

  private settle(relay: string | null): void {
    if (relay) this.settledRelays.add(relay);
    if (this.isSettled()) for (const listener of this.settledListeners) listener();
  }

  stats(): IngestCounters {
    return { ...this.counters, refusedBy: { ...this.counters.refusedBy } };
  }

  start(sinceSeconds?: number): void {
    if (this.pool) return;
    this.pool = createRelayPool();

    const filter: Filter = {
      kinds: [MISSION_PACKAGE_KIND],
      '#t': ['starcom_mission_package'],
      ...(sinceSeconds ? { since: sinceSeconds } : {}),
    };

    // Each relay read to its end, past its cap, and kept open for what is published after (readComplete).
    for (const relay of this.relays) {
      const read = readComplete(this.pool, [relay], [filter], {
        onevent: (event: NostrEvent) => { void this.handle(event, relay); },
        oncomplete: () => this.settle(relay),
        onfail: (reasons) => { log.debug(`read failed on ${relay}`, reasons); this.settle(relay); },
      });
      this.closers.push(() => read.close());
    }
    log.info(`watching ${this.relays.length} relay(s) for Mission Packages`);
  }

  stop(): void {
    for (const close of this.closers) {
      try { close(); } catch { /* already closed */ }
    }
    this.closers = [];
    this.pool?.close(this.relays);
    this.pool = null;
  }

  private async handle(event: NostrEvent, relay: string): Promise<void> {
    if (this.seenIds.has(event.id)) return;
    this.seenIds.add(event.id);
    this.counters.seen++;

    // Counted while verified, so the read is settled only once every package in it is accepted or refused.
    this.verifying++;
    try {
      this.record(event, relay, await verifyMissionPackageEvent(event, this.policy));
    } finally {
      this.verifying--;
      this.settle(null);
    }
  }

  private record(event: NostrEvent, relay: string, check: Awaited<ReturnType<typeof verifyMissionPackageEvent>>): void {
    const tally = this.publishers.get(event.pubkey) ?? { accepted: 0, refused: 0 };
    this.publishers.set(event.pubkey, tally);

    if (check.ok) {
      tally.accepted++;
      this.counters.accepted++;
      // Its signed profile says its key is an AI agent's (MX14): labelled wherever the key is named.
      if (agentTagged(event)) markAgentKey(event.pubkey);
      for (const listener of this.accepted) listener({ event, check, relay });
      return;
    }

    const code = check.code ?? 'malformed-manifest';
    tally.refused++;
    this.counters.refused++;
    this.counters.refusedBy[code] = (this.counters.refusedBy[code] ?? 0) + 1;
    log.warn(`refused a package from ${relay}: ${check.reason}`);
    for (const listener of this.refused) {
      listener({ eventId: event.id, pubkey: event.pubkey, code, reason: check.reason ?? '', relay });
    }
  }
}
