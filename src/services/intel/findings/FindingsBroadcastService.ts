/**
 * FindingsBroadcastService — sibling to MissionPackageBroadcastService, for
 * the Findings Publisher's genuinely open channel (roadmap: "Findings
 * Publisher — concrete sketch"). Deliberately NOT the same service, and
 * NOT the same kind as Mission Package (30079): a Mission Package is a
 * narrow, bilateral Starcom -> Navcom handoff (objectives/briefing,
 * redacted per Locked Decision #7); a Finding is a standalone, corroborated
 * claim meant for ANY consumer to subscribe to, not just Navcom — mixing
 * them into one kind would make it impossible for a third party to
 * subscribe to findings alone without also parsing mission handoffs never
 * meant for them.
 *
 * Event structure:
 *   kind: 30082 (parameterized-replaceable, arbitrary app data range —
 *         adjacent to Mission Package's 30079, avoiding collision with
 *         30078 (NIP-78 PQC prekeys), 30023 (Intel Report broadcast), and
 *         30079 itself — see MissionPackageBroadcastService.ts)
 *   content: the signed finding (FindingContent + its ML-DSA signature
 *         block from signFinding.ts) as JSON — small, embedded directly,
 *         same as Mission Package's manifest-in-content approach
 *   tags: [['d', identifier], ['t','attested-claim'], ['schema_version', String(schemaVersion)]]
 *         The schema_version tag lets a relay-side or client-side filter
 *         select findings by wire version without parsing content JSON —
 *         the d-tag alone (per this app's own collision-avoidance
 *         discipline, see Phase 3's future-proofing note) only guarantees
 *         replaceable-event uniqueness, not discoverability by version.
 *
 * Signing: same duck-typed secret-key-or-NIP-07 acceptance as
 * MissionPackageBroadcastService, so nostrIdentityService.asSigner()
 * drops in unchanged.
 */

import { finalizeEvent, type SimplePool } from 'nostr-tools';
import { createRelayPool } from '../../nostr/relayPool';
import type { Event as NostrEvent } from 'nostr-tools';
import type { SignedFinding } from './signFinding';
import { findingIdentifier } from './FindingContent';
import { REFUTATION_KIND, refutationIdentifier, isRefutation, type FindingRefutation } from './refutation';
import { createLogger } from '@utils/logger';
import { publishRelays } from '../../nostr/publishTargets';

const log = createLogger({ prefix: 'FindingsBroadcast' });

// Same relay surface as MissionPackageBroadcastService/NostrIntelBroadcastService —
// the one relay set this app already documents as the shared Navcom surface, and
// (per this content type's own point) any other Nostr consumer's surface too.

/**
 * The env plumbing that lived here — added after mission packages had already
 * needed it — now lives in services/nostr/publishTargets.ts. Two copies of one
 * contract is how the path that publishes intel reports ended up with none.
 */
export function findingRelays(): string[] {
  return publishRelays('FINDING');
}


export const FINDING_KIND = 30082;


export interface BroadcastResult {
  success: boolean;
  eventId?: string;
  /** The Nostr key that signed the event: with its slot, its address, which reviews point at (plan item 5.1). */
  nostrPubkey?: string;
  relaysOk?: number;
  error?: string;
}

interface Nip07Signer {
  getPublicKey(): Promise<string>;
  signEvent(event: Record<string, unknown>): Promise<NostrEvent>;
}

export class FindingsBroadcastService {
  private pool: SimplePool;
  private relays: string[];

  constructor(relays?: string[]) {
    this.pool = createRelayPool();
    this.relays = relays ?? findingRelays();
  }

  /**
   * Publish an ML-DSA-signed finding to the Nostr relay network as a
   * signed event. Never called automatically — always a deliberate
   * "Publish Finding" action, mirroring "Publish to Navcom" (see
   * FindingsPublisherService), never a silent broadcast the moment a
   * corroboration threshold is crossed.
   *
   * @param signed - Output of signFinding() over buildFindingAttestation()'s
   *                  output — never a raw CorroboratedFinding or anything
   *                  carrying source identities.
   * @param signer  - A nostr-tools secret key OR a NIP-07-shaped signer
   *                  (e.g. nostrIdentityService.asSigner()). If omitted,
   *                  attempts to detect window.nostr.
   */
  async publishFinding(
    signed: SignedFinding,
    signer?: Uint8Array | Nip07Signer,
  ): Promise<BroadcastResult> {
    try {
      const event = this.buildUnsignedEvent(signed);
      const finalized = await this.signEvent(event, signer);
      return await this.broadcastEvent(finalized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('publishFinding failed:', msg);
      return { success: false, error: msg };
    }
  }

  /**
   * A refutation is addressed by WHICH claim it refutes, never by its own slot.
   *
   * This dispatch is the load-bearing part. `findingIdentifier` reads
   * `claim.subjectRef` / `retracts.subjectRef`, and a refutation has neither —
   * it has `refutes`. Passed through unchanged it would derive the identifier
   * for the empty subject and empty attribute, and publish at kind 30082, which
   * means a refutation would land in a REAL claim's replaceable slot and delete
   * the claim it was arguing with. Disagreement would erase the thing disagreed
   * with, which is the exact opposite of what the Refutation section of the NIP
   * exists to guarantee.
   */

  buildUnsignedEvent(signed: SignedFinding): Record<string, unknown> {
    if (isRefutation(signed.content)) {
      const r = signed.content;
      return {
        kind: REFUTATION_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          // Four percent-encoded components, per the NIP's Addressing section.
          ['d', refutationIdentifier(r.refutes)],
          // The NIP names this tag only in the claim section, but states plainly
          // that a refutation IS an attestation. Emitting it means a consumer
          // subscribing `#t: attested-claim` across kinds sees disagreement as
          // well as agreement; without it, refutations are findable only by
          // computing the address of a claim you already hold, and a consumer
          // that does not yet hold the claim can never discover it is contested.
          ['t', 'attested-claim'],
          ['schema_version', String(r.schemaVersion)],
        ],
        content: JSON.stringify(signed),
      };
    }

    // Content-addressed identifier (hash-free approximation: entity +
    // attribute + schema version) so republishing the SAME finding
    // replaces the prior event (parameterized-replaceable semantics)
    // instead of accumulating duplicates each time corroboration is
    // recomputed with no actual change.
    const identifier = findingIdentifier(signed);
    return {
      kind: FINDING_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', identifier],
        // The tag the SPECIFICATION defines. This published 'starcom_finding',
        // which appears nowhere in the spec and is vendor-prefixed — the exact
        // shape the spec rejects for the `d` tag, because a vendor prefix in a
        // shared identifier is a centralising factor.
        //
        // The cost was silent and total: a peer implementing from the document
        // filters `#t: ['attested-claim']` and would have received nothing this
        // app ever published. The federation gate did not catch it because it
        // validates claim CONTENT, not event tags.
        ['t', 'attested-claim'],
        ['schema_version', String(signed.content.schemaVersion)],
        /*
         * One `e` tag per event this finding rests on — the citation.
         *
         * A TAG rather than a content field, because a content field is not
         * filterable. Navcom made this rule for their own format and it holds
         * in the return direction: with these tags, an operator answers "which
         * findings rest on what I filed?" with a single relay filter,
         * `{kinds:[30082], "#e":[...their own ids]}`, built from ids they
         * already know because they published them. Buried in content it would
         * require fetching every finding Starcom has ever published and parsing
         * each one.
         *
         * This is what makes the citation a receipt rather than a record. It
         * needs no store on either side: the reference is to an EVENT, not to a
         * key, so nobody has to retain a history of anybody to make it work —
         * which is precisely why it delivers the reward that per-key standing
         * was going to, without building the profile that made us decline.
         *
         * Ids only. A pubkey in here would convert a citation into an
         * attribution of a person, which is the line the "never source
         * identities" rule draws.
         */
        ...('method' in signed.content
          ? (signed.content.method.citedEventIds ?? [])
          : []
        ).map((id) => ['e', id]),
      ],
      content: JSON.stringify(signed),
    };
  }

  private async signEvent(
    unsignedEvent: Record<string, unknown>,
    signer?: Uint8Array | Nip07Signer,
  ): Promise<NostrEvent> {
    if (signer instanceof Uint8Array) {
      return finalizeEvent(unsignedEvent as Parameters<typeof finalizeEvent>[0], signer);
    }

    if (signer && typeof (signer as Nip07Signer).signEvent === 'function') {
      const nip07 = signer as Nip07Signer;
      const pubkey = await nip07.getPublicKey();
      const withPubkey = { ...unsignedEvent, pubkey };
      return nip07.signEvent(withPubkey);
    }

    if (typeof window !== 'undefined' && (window as unknown as { nostr?: Nip07Signer }).nostr) {
      const nip07 = (window as unknown as { nostr: Nip07Signer }).nostr;
      const pubkey = await nip07.getPublicKey();
      const withPubkey = { ...unsignedEvent, pubkey };
      return nip07.signEvent(withPubkey);
    }

    throw new Error('No signing method available — provide a secret key or install a NIP-07 browser extension');
  }

  private async broadcastEvent(event: NostrEvent): Promise<BroadcastResult> {
    log.info(`Broadcasting finding event ${event.id} to ${this.relays.length} relays`);

    const results = this.pool.publish(this.relays, event);
    let ok = 0;
    const errors: string[] = [];

    await Promise.allSettled(
      results.map(async (p, i) => {
        try {
          await p;
          ok++;
          log.debug(`Relay ${this.relays[i]} accepted event`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${this.relays[i]}: ${msg}`);
          log.warn(`Relay ${this.relays[i]} rejected event:`, msg);
        }
      }),
    );

    if (ok === 0) {
      return { success: false, eventId: event.id, nostrPubkey: event.pubkey, relaysOk: 0, error: errors.join('; ') };
    }

    log.info(`Event ${event.id} accepted by ${ok}/${this.relays.length} relays`);
    return { success: true, eventId: event.id, nostrPubkey: event.pubkey, relaysOk: ok };
  }

  dispose(): void {
    this.pool.close(this.relays);
  }
}
