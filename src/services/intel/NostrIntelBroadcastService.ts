/**
 * NostrIntelBroadcastService — Step 2.2.4 (Nostr Intel Broadcast)
 *
 * Publishes intel reports to the Nostr relay network as NIP-23 long-form
 * events tagged with #starcom_intel. This is the outbound counterpart to
 * NostrStarcomIntelIngest (which consumes such events from the network).
 *
 * Event structure:
 *   kind: 30023 (long-form / NIP-23)
 *   content: JSON { title, ipfsCid, solanaTx, visibility?, lat, lon, startDate?, endDate?, timePrecisionMs? }
 *   tags: [['t','starcom_intel'], ['r','ipfs://…'], ['r','solana:…'], ['g',geohash], ['d',identifier],
 *          ['e', <observation id>, <relay>, 'cites'] for each observation it rests on]
 *
 * Signing: accepts either a nostr-tools secret key (Uint8Array) or a NIP-07
 * browser-extension signer (window.nostr.signEvent).
 */

import { finalizeEvent, type SimplePool } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import type { Event as NostrEvent } from 'nostr-tools';
import { createLogger } from '@utils/logger';
import type { ReportCitation } from '../../types/intel/IntelReportUI';
import { citeTags } from './citations';

const log = createLogger({ prefix: 'NostrIntelBroadcast' });

/**
 * Resolved, not hardcoded.
 *
 * This list was fixed and unconfigurable — so publishing an intel report, the
 * most ordinary act in this application, could only ever reach public relays.
 * An operator learning the tool had no way to rehearse it, which means every
 * practice run was an irreversible publication to a shared commons.
 *
 * Mission packages gained a way to be pointed elsewhere after a test package
 * went out for real; findings gained the same weeks later. Applying that once
 * per incident rather than once per class is why this path still had the hole,
 * so the contract now lives in one module and this channel just asks for it.
 */
import { publishRelays } from '../nostr/publishTargets';

const NIP23_KIND = 30023;

// ---------------------------------------------------------------------------
// Geohash encoder (minimal, no external dependency)
// ---------------------------------------------------------------------------
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function encodeGeohash(lat: number, lon: number, precision = 6): string {
  let minLat = -90, maxLat = 90;
  let minLon = -180, maxLon = 180;
  let isLon = true;
  let bit = 0;
  let ch = 0;
  let hash = '';

  while (hash.length < precision) {
    if (isLon) {
      const mid = (minLon + maxLon) / 2;
      if (lon >= mid) { ch = (ch << 1) | 1; minLon = mid; }
      else            { ch = ch << 1;       maxLon = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { ch = (ch << 1) | 1; minLat = mid; }
      else            { ch = ch << 1;       maxLat = mid; }
    }
    isLon = !isLon;
    bit++;
    if (bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntelBroadcastPayload {
  /** Human-readable title for the report */
  title: string;
  /** IPFS Content Identifier produced by Intel IPFS Upload (Step 2.2.1) */
  ipfsCid: string;
  /** Solana transaction signature from Blockchain Anchor (Step 2.2.3) */
  solanaTx?: string;
  /**
   * Who may receive this — the distribution axis.
   *
   * ─── THIS WAS `classification: string`, AND IT WAS REQUIRED ───────────────
   *
   * A second wire format, after PackageManifest (see
   * docs/interchange/2026-09-09-manifest-visibility.md). It rides inside the
   * JSON content body of a SIGNED NIP-23 event, so anything written here is
   * published and cannot be recalled.
   *
   * Required meant every producer had to supply one, and the OSINT publisher
   * duly stamped 'UNCLASSIFIED' on every item it broadcast — a marking nobody
   * had reviewed, crossing the wire as though somebody had.
   *
   * Optional now, and consumers read it read-tolerantly: an event published by
   * an older build carries `classification` instead, and parseEventContent
   * accepts either.
   *
   * Unlike the manifest there is no custom canonicalisation to get wrong here —
   * nostr-tools hashes the serialized event — so the undefined-key digest
   * hazard that refused genuine packages does not repeat. JSON.stringify drops
   * an undefined key, which is exactly what should happen.
   */
  visibility?: string;
  /** Latitude of the report subject (optional) */
  latitude?: number;
  /** Longitude of the report subject (optional) */
  longitude?: number;
  /** Free-form tags (e.g. ['osint','maritime']) */
  tags?: string[];
  /**
   * When the reported event happened (decision D-E), ISO 8601 UTC, with how
   * closely it is known. Each stated time starts a window timePrecisionMs wide.
   * Optional and omitted when unstated, like `visibility`; `created_at` stays the
   * time the note was signed. See docs/interchange/2026-09-14-nostr-intel-event-time.md.
   */
  startDate?: string;
  endDate?: string;
  timePrecisionMs?: number;
  /**
   * What the report rests on (decision D-MX: MX3, MX22): one
   * `["e", <id>, <relay>, "cites"]` tag each, as rev 11 agreed. In the tags
   * only, never in the content.
   */
  cites?: ReportCitation[];
}

export interface BroadcastResult {
  success: boolean;
  /** Nostr event ID (hex) */
  eventId?: string;
  /** Number of relays that accepted the event */
  relaysOk?: number;
  error?: string;
}

/** NIP-07 window.nostr signer shape */
interface Nip07Signer {
  getPublicKey(): Promise<string>;
  signEvent(event: Record<string, unknown>): Promise<NostrEvent>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class NostrIntelBroadcastService {
  private pool: SimplePool;
  private relays: string[];

  constructor(relays?: string[]) {
    this.pool = createRelayPool();
    this.relays = relays ?? publishRelays('INTEL');
  }

  /**
   * Publish an intel report to the Nostr relay network.
   *
   * @param payload - The intel data to broadcast.
   * @param signer  - Either a 32-byte nostr-tools secret key OR a NIP-07 signer.
   *                  If omitted the service attempts to detect `window.nostr`.
   */
  async publishIntelReport(
    payload: IntelBroadcastPayload,
    signer?: Uint8Array | Nip07Signer,
  ): Promise<BroadcastResult> {
    try {
      const event = this.buildUnsignedEvent(payload);
      const signed = await this.signEvent(event, signer);
      return await this.broadcastEvent(signed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('publishIntelReport failed:', msg);
      return { success: false, error: msg };
    }
  }

  // -----------------------------------------------------------------------
  // Event construction
  // -----------------------------------------------------------------------

  /** Build an unsigned NIP-23 event from the payload. */
  buildUnsignedEvent(payload: IntelBroadcastPayload): Record<string, unknown> {
    const { title, ipfsCid, solanaTx, visibility, latitude, longitude, tags: extraTags, startDate, endDate, timePrecisionMs, cites } = payload;

    // NIP-23 identifier (deterministic for replaceable events)
    const identifier = `starcom_intel_${ipfsCid.substring(0, 16)}`;

    // Build content body
    const content = JSON.stringify({
      title,
      ipfsCid,
      solanaTx: solanaTx ?? null,
      // Omitted entirely when unstated, rather than defaulted — an absent key
      // says "the author did not say", which is the truth.
      ...(visibility ? { visibility } : {}),
      lat: latitude ?? null,
      lon: longitude ?? null,
      // Absent keys, not nulls, for the same reason as visibility.
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
      ...(timePrecisionMs ? { timePrecisionMs } : {}),
    });

    // Build Nostr tags
    const nostrTags: string[][] = [
      ['d', identifier],
      ['t', 'starcom_intel'],
      ['t', 'starcom-intel'],
      ['r', `ipfs://${ipfsCid}`],
    ];
    if (solanaTx) {
      nostrTags.push(['r', `solana:${solanaTx}`]);
    }
    if (latitude != null && longitude != null) {
      nostrTags.push(['g', encodeGeohash(latitude, longitude)]);
    }
    if (extraTags?.length) {
      for (const t of extraTags) {
        nostrTags.push(['t', t]);
      }
    }
    nostrTags.push(...citeTags(cites ?? []));

    return {
      kind: NIP23_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: nostrTags,
      content,
    };
  }

  // -----------------------------------------------------------------------
  // Signing
  // -----------------------------------------------------------------------

  /** Sign the event using either a secret key or NIP-07 extension. */
  private async signEvent(
    unsignedEvent: Record<string, unknown>,
    signer?: Uint8Array | Nip07Signer,
  ): Promise<NostrEvent> {
    // Explicit secret key
    if (signer instanceof Uint8Array) {
      return finalizeEvent(unsignedEvent as Parameters<typeof finalizeEvent>[0], signer);
    }

    // Explicit NIP-07 signer object
    if (signer && typeof (signer as Nip07Signer).signEvent === 'function') {
      const nip07 = signer as Nip07Signer;
      const pubkey = await nip07.getPublicKey();
      const withPubkey = { ...unsignedEvent, pubkey };
      return nip07.signEvent(withPubkey);
    }

    // Auto-detect NIP-07 browser extension (window.nostr)
    if (typeof window !== 'undefined' && (window as unknown as { nostr?: Nip07Signer }).nostr) {
      const nip07 = (window as unknown as { nostr: Nip07Signer }).nostr;
      const pubkey = await nip07.getPublicKey();
      const withPubkey = { ...unsignedEvent, pubkey };
      return nip07.signEvent(withPubkey);
    }

    throw new Error('No signing method available — provide a secret key or install a NIP-07 browser extension');
  }

  // -----------------------------------------------------------------------
  // Broadcasting
  // -----------------------------------------------------------------------

  /** Publish a signed event to all configured relays. */
  private async broadcastEvent(event: NostrEvent): Promise<BroadcastResult> {
    log.info(`Broadcasting event ${event.id} to ${this.relays.length} relays`);

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
      return { success: false, eventId: event.id, relaysOk: 0, error: errors.join('; ') };
    }

    log.info(`Event ${event.id} accepted by ${ok}/${this.relays.length} relays`);
    return { success: true, eventId: event.id, relaysOk: ok };
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Close all relay connections. */
  dispose(): void {
    this.pool.close(this.relays);
  }
}
