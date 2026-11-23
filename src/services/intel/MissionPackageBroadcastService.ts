/**
 * MissionPackageBroadcastService — sibling to NostrIntelBroadcastService, for
 * Cycle 4's Starcom -> Navcom handoff. Deliberately NOT the same service:
 * Intel Reports broadcast as NIP-23 (kind 30023, tagged #starcom_intel) —
 * Navcom's own docs describe that surface as report/analysis distribution,
 * not a mission-dispatch channel. Reusing it here would let a Mission
 * Package show up mixed into an Intel Report feed, and (per Locked Decision
 * #7) a Mission Package is a boundary-crossing artifact with different
 * content guarantees (objectives/briefing only, redacted, no raw report
 * content or analyst identity) that deserves its own kind so a consumer can
 * actually tell them apart without inspecting content.
 *
 * Event structure:
 *   kind: 30079 (parameterized-replaceable, arbitrary app data range — same
 *         range NIP-78/kind 30078 already occupies for PQC prekeys in this
 *         app; 30079 avoids colliding with that or with 30023/30000, the
 *         other kinds already in use — see PQCKeyPublisher.ts,
 *         NostrIntelBroadcastService.ts, RealTimeTeamService.ts)
 *   content: the full signed PackageManifest as JSON (small — a Mission
 *         Package manifest carries checksums/objectives/briefing, never a
 *         full report body, so embedding it directly in the event needs no
 *         separate IPFS upload this round; see Known Limitations)
 *   tags: [['d', identifier], ['t','starcom_mission_package'], ['t','navcom_handoff'],
 *          ...the profile NavCom reads, from the manifest (packageProfile.ts), ['client','Starcom']]
 *
 * Signing: same duck-typed secret-key-or-NIP-07 acceptance as
 * NostrIntelBroadcastService, so Cycle 0's nostrIdentityService.asSigner()
 * drops in unchanged.
 */

import { finalizeEvent, type SimplePool } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import type { Event as NostrEvent } from 'nostr-tools';
import type { PackageManifest } from '../exchange/types';
import { packageIdentifier, coordinateFor as packageCoordinateFor, MISSION_PACKAGE_KIND } from './missionPackageThread';
import { profileTags } from './packageProfile';
import { citeTags } from './citations';
import { towardTags } from '../roster/packageToward';
import type { RosterLink } from '../roster/rosterItem';
import type { ReportCitation } from '../../types/intel/IntelReportUI';
import { createLogger } from '@utils/logger';
import { publishRelays, readRelays } from '../nostr/publishTargets';

const log = createLogger({ prefix: 'MissionPackageBroadcast' });

// Same public relay surface as NostrIntelBroadcastService/NostrStarcomIntelIngest —
// the relay set this app already documents as the shared Navcom surface.

/**
 * The relays a Mission Package is published to.
 *
 * This list used to be hardcoded to the five public relays above, which left
 * a real asymmetry: the intel INGEST side has always been configurable
 * (VITE_NOSTR_INTEL_RELAYS — see NostrStarcomIntelIngest), so Starcom could
 * *receive* from the AI Security Relay Node's internal relay but could never
 * *publish* back to it. Mission Packages only ever reached public relays.
 *
 * `VITE_NOSTR_MISSION_RELAYS` closes that, mirroring the ingest side's
 * config shape (comma-separated wss:// URLs).
 *
 * ADDITIVE by default: configured relays are appended to the public set, not
 * substituted for it, because a Mission Package that reaches only an internal
 * relay is invisible to the Navcom handoff surface this whole path exists to
 * serve. Set VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE=true to publish ONLY to the
 * configured relays — the right choice for an air-gapped or
 * internal-only deployment, and deliberately an explicit opt-in rather than
 * something you get by accident from setting one env var.
 */
/**
 * A curated map of STATIC accesses, never a computed key — the rule
 * src/config/env.ts documents and ApiConfigManager/configValidator already
 * follow. Two reasons, and this file violated both:
 *
 * 1. Computed `import.meta.env[key]` forces Vite to materialise every VITE_
 *    variable into the bundle, which is how a Telegram bot token no code
 *    referenced was once served from production.
 * 2. Aliasing `import.meta` first (`const meta = import.meta; meta.env[key]`)
 *    dodges that leak but defeats substitution entirely: Vite replaces only
 *    the literal `import.meta.env.VITE_X` form, so the built bundle read a
 *    property that does not exist and every value came back undefined.
 *
 * (2) is what this file did, so VITE_NOSTR_MISSION_RELAYS and its EXCLUSIVE
 * flag were INERT in every production build — Mission Packages always went to
 * the five public relays, and could never reach the AI Security Relay Node's
 * internal relay, which is the entire capability the config was added for.
 * Dev and vitest read process.env, so this was invisible to the unit tests.
 */
/**
 * The env plumbing that used to live here — a literal-access map, a readEnv
 * that prefers process.env, and an additive-unless-exclusive resolver — now
 * lives in services/nostr/publishTargets.ts, because it was implemented here,
 * then again for findings, and was missing entirely from the path that
 * publishes intel reports. One contract, asked for by channel.
 */

/**
 * The mission channel's relays, whatever a mission's distribution says. A
 * mission's own destinations come from MissionService.missionDestinations
 * (plan item 0.4); this is the default for capability events sent without one.
 */
export function missionPackageRelays(): string[] {
  return publishRelays('MISSION');
}

/**
 * Where to LISTEN for Mission Packages and for replies to ours.
 *
 * Distinct from missionPackageRelays, which is a list of publish
 * destinations. The ingest subscribed to THAT — so The Record, where a peer
 * publishes their board, was never asked. Their open threads were not refused
 * and not counted here; they simply never arrived.
 */
export function missionPackageReadRelays(): string[] {
  return readRelays('MISSION');
}

/**
 * Re-exported from the protocol module, which owns it alongside the `d` tag
 * format and the reply coordinate built from both. Four files import it from
 * here, so the name stays.
 */
export { MISSION_PACKAGE_KIND } from './missionPackageThread';

export interface BroadcastResult {
  success: boolean;
  eventId?: string;
  /**
   * The addressable coordinate this package now lives at,
   * `30079:<pubkey>:starcom_mission_package_<id>`, taken from the SIGNED event
   * rather than re-derived — the signer decides the pubkey, so anything
   * computed beside it is a guess that fails silently when the identity is not
   * what the caller assumed.
   *
   * It is what a peer's reply addresses, and what this node subscribes to in
   * order to see that reply. Recorded on the mission so the thread survives a
   * later identity change: an old package stays addressable at the key that
   * actually published it.
   */
  coordinate?: string;
  relaysOk?: number;
  /** How many relays the event was sent to; with relaysOk, the receipt a mission keeps (plan item 0.7). */
  relaysTried?: number;
  error?: string;
  /** The event as signed, when no relay took it: kept to go when one answers (work package W1c). */
  signed?: NostrEvent;
  /** What each relay said when none took it, as it said it: a refusal for good is not kept (relayRefusal.ts). */
  said?: string[];
}

interface Nip07Signer {
  getPublicKey(): Promise<string>;
  signEvent(event: Record<string, unknown>): Promise<NostrEvent>;
}

export class MissionPackageBroadcastService {
  private pool: SimplePool;
  private relays: string[];

  constructor(relays?: string[]) {
    this.pool = createRelayPool();
    this.relays = relays ?? publishRelays('MISSION');
  }

  /**
   * The relay set this instance will actually publish to, after env config is
   * resolved. Exposed because "where did my Mission Package actually go?" is a
   * real operator question — the answer now depends on env vars, so it should
   * be inspectable rather than inferred from reading the source.
   */
  getRelays(): readonly string[] {
    return [...this.relays];
  }

  /**
   * Publish a composed, checksummed, redacted Mission Package manifest to
   * the Nostr relay network as a signed event.
   *
   * @param manifest - Output of PackageComposer.compose() over a
   *                    buildMissionPackageComposeInput()-built ComposeInput
   *                    — never a raw MissionUI or raw linked report content.
   * @param signer    - A nostr-tools secret key OR a NIP-07-shaped signer
   *                    (e.g. nostrIdentityService.asSigner()). If omitted,
   *                    attempts to detect window.nostr.
   * @param cites     - The observations its linked reports rest on, as the
   *                    review showed them (D-MX: MX19, MX22, MX24).
   */
  async publishMissionPackage(
    manifest: PackageManifest,
    signer?: Uint8Array | Nip07Signer,
    cites: readonly ReportCitation[] = [],
    toward: readonly RosterLink[] = [],
  ): Promise<BroadcastResult> {
    try {
      const event = this.buildUnsignedEvent(manifest, cites, toward);
      const signed = await this.signEvent(event, signer);
      return await this.broadcastEvent(signed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('publishMissionPackage failed:', msg);
      return { success: false, error: msg, relaysOk: 0, relaysTried: 0 };
    }
  }

  buildUnsignedEvent(manifest: PackageManifest, cites: readonly ReportCitation[] = [], toward: readonly RosterLink[] = []): Record<string, unknown> {
    // From missionPackageThread, which also builds the coordinate a reply
    // addresses. Two copies of this format would diverge silently: replies
    // would name a package that does not exist and simply match nothing.
    const identifier = packageIdentifier(manifest.id);
    return {
      kind: MISSION_PACKAGE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', identifier],
        ['t', 'starcom_mission_package'],
        ['t', 'navcom_handoff'],
        // What NavCom reads (rev 11), from the manifest, whose signature covers it.
        ...profileTags(manifest.profile),
        // What its linked reports rest on, in the tags only: the manifest is unchanged (D-MX, MX22).
        ...citeTags(cites),
        // The Causes and Initiatives it works toward, as roster items link them (RS59; spec rev 18).
        ...towardTags(toward),
        // The client it was published through (NIP-89); the author is in the manifest, and is its signer (D-MX, MX7).
        ['client', 'Starcom'],
      ],
      content: JSON.stringify(manifest),
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
    log.info(`Broadcasting mission package event ${event.id} to ${this.relays.length} relays`);
    const published = event.tags?.find((t) => t[0] === 'd')?.[1];
    const coordinate = published ? packageCoordinateFor(event.pubkey, published) : undefined;

    const results = this.pool.publish(this.relays, event);
    let ok = 0;
    const errors: string[] = [];
    const said: string[] = [];

    await Promise.allSettled(
      results.map(async (p, i) => {
        try {
          await p;
          ok++;
          log.debug(`Relay ${this.relays[i]} accepted event`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${this.relays[i]}: ${msg}`);
          said.push(msg);
          log.warn(`Relay ${this.relays[i]} rejected event:`, msg);
        }
      }),
    );

    if (ok === 0) {
      return { success: false, eventId: event.id, relaysOk: 0, relaysTried: this.relays.length, error: errors.join('; '), signed: event, said };
    }

    log.info(`Event ${event.id} accepted by ${ok}/${this.relays.length} relays`);
    return { success: true, eventId: event.id, coordinate, relaysOk: ok, relaysTried: this.relays.length };
  }

  dispose(): void {
    this.pool.close(this.relays);
  }
}
