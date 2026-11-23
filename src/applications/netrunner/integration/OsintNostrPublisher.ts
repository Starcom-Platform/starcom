/**
 * OsintNostrPublisher.ts
 * 
 * Publishes OSINT mission results to the Nostr relay network as NIP-23
 * long-form events tagged with #starcom_intel + OSINT tool tags.
 * 
 * Delegates to NostrIntelBroadcastService for event signing and relay I/O.
 */

import { NostrIntelBroadcastService } from '../../../services/intel/NostrIntelBroadcastService';
import type {
  IntelBroadcastPayload,
  BroadcastResult
} from '../../../services/intel/NostrIntelBroadcastService';
import type { EnhancedMissionResult } from '../execution/BotMissionExecutor';
import { buildOsintIpfsPackage, uploadOsintPackage, missionCollectionWindow, type OsintIpfsPackage } from './OsintIntelBridge';

// Singleton service (lazily created)
let _broadcaster: NostrIntelBroadcastService | null = null;

function getBroadcaster(): NostrIntelBroadcastService {
  if (!_broadcaster) {
    _broadcaster = new NostrIntelBroadcastService();
  }
  return _broadcaster;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OsintBroadcastOptions {
  /** Who signs: a secret key, or a signer such as this app's identity (nostrIdentityService.asSigner()). */
  signer?: Parameters<NostrIntelBroadcastService['publishIntelReport']>[1];
  /** Pre-computed IPFS CID — if omitted the publisher will upload to IPFS first. */
  ipfsCid?: string;
}

/**
 * An OSINT broadcast built and not yet sent: what the publish review shows.
 *
 * There was a browser confirm() here, with a privacy warning and nothing else:
 * no view of what would be uploaded or where. The publish review replaced it
 * (plan item 0.1); its warning travels with the review.
 */
export interface PreparedOsintBroadcast {
  /** Exactly what is uploaded to IPFS, as JSON. */
  package: OsintIpfsPackage;
  /** The Intel Report event that announces it, less the IPFS address it will carry. */
  title: string;
  tags: string[];
  window: { startDate?: string; endDate?: string; timePrecisionMs?: number };
}

export function prepareOsintBroadcast(result: EnhancedMissionResult): PreparedOsintBroadcast {
  const collected = missionCollectionWindow(result);
  return {
    package: buildOsintIpfsPackage(result),
    title: `OSINT Report: ${result.target}`,
    tags: ['osint', 'netrunner', ...result.toolsUsed.map((t) => t.toLowerCase())],
    // When what the tools found held: the mission's collection window (decision D-E).
    window: collected.startDate
      ? {
          startDate: collected.startDate.toISOString(),
          endDate: collected.endDate?.toISOString(),
          timePrecisionMs: collected.timePrecisionMs,
        }
      : {},
  };
}

/**
 * Upload the prepared package to IPFS, then announce it with an Intel Report
 * event (NIP-23 long-form, tagged #starcom_intel and with the tools used).
 */
export async function publishPreparedOsint(
  prepared: PreparedOsintBroadcast,
  options: OsintBroadcastOptions = {}
): Promise<BroadcastResult> {
  const cid = options.ipfsCid ?? await uploadOsintPackage(prepared.package);

  const payload: IntelBroadcastPayload = {
    title: prepared.title,
    ipfsCid: cid,
    // Was `classification: 'UNCLASSIFIED'`, stamped onto every OSINT item this
    // publisher broadcasts. Nothing reviewed them; the marking was the
    // publisher's invention, and it crossed the wire.
    tags: [...prepared.tags],
    ...prepared.window,
  };

  return getBroadcaster().publishIntelReport(payload, options.signer);
}

/** Prepare and publish in one call, for callers that have already reviewed it. */
export async function publishOsintToNostr(
  result: EnhancedMissionResult,
  options: OsintBroadcastOptions = {}
): Promise<BroadcastResult> {
  return publishPreparedOsint(prepareOsintBroadcast(result), options);
}
