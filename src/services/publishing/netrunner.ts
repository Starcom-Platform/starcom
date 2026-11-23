/**
 * NetRunner's broadcast through the review (plan item 0.1).
 *
 * It asked with the browser's confirm(), a privacy warning and nothing else,
 * and called the result "shared with team" while sending it to public relays.
 * Now the package that goes to IPFS is shown, as are the relays the Intel Report
 * event announcing it goes to. The warning travels with the review.
 *
 * Nothing is signed before the upload, so the fingerprint is of the exact bytes
 * that go to IPFS.
 */
import { requestReview, sha256Hex, type ReviewContent } from './publishReview';
import { destinationsFor } from './destinations';
import { publishRelays } from '../nostr/publishTargets';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import type { BroadcastResult } from '../intel/NostrIntelBroadcastService';
import type { EnhancedMissionResult } from '../../applications/netrunner/execution/BotMissionExecutor';
import {
  prepareOsintBroadcast, publishPreparedOsint, type PreparedOsintBroadcast,
} from '../../applications/netrunner/integration/OsintNostrPublisher';

export function showOsintBroadcast(prepared: Readonly<PreparedOsintBroadcast>): ReviewContent {
  const { package: pkg } = prepared;
  const report = pkg.report as { summary?: string; content?: string } | undefined;
  const findings = Array.isArray(pkg.rawFindings) ? pkg.rawFindings.length : 0;
  return {
    title: prepared.title,
    body: report?.summary ?? report?.content ?? '',
    fields: [
      { label: 'Target', value: pkg.target },
      { label: 'Findings uploaded', value: String(findings) },
      { label: 'Tags', value: prepared.tags.join(', ') },
      ...(prepared.window.startDate ? [{ label: 'Collected', value: `${prepared.window.startDate}${prepared.window.endDate ? ` to ${prepared.window.endDate}` : ''}` }] : []),
    ],
    raw: JSON.stringify(pkg, null, 2),
  };
}

/** Show a NetRunner mission's results, and on a yes upload and announce them. */
export async function reviewOsintBroadcast(result: EnhancedMissionResult): Promise<BroadcastResult | null> {
  const outcome = await requestReview<PreparedOsintBroadcast, BroadcastResult>({
    act: 'Publish OSINT report',
    payload: prepareOsintBroadcast(result),
    show: (p) => showOsintBroadcast(p),
    notice: 'This may include IP addresses, domain names and vulnerability details. Publish only findings about targets you are authorised to examine.',
    destinations: [{ address: 'IPFS', kind: 'ipfs' }, ...destinationsFor(publishRelays('INTEL'))],
    // JSON.stringify of the package is exactly what uploadOsintPackage sends.
    digest: (p) => sha256Hex(JSON.stringify(p.package)),
    digestLabel: 'Fingerprint of what goes to IPFS',
    signer: await nostrIdentityService.refreshSigner(),
    sample: result.usedMockData === true,
    // Signed as this app's identity: without it only a browser extension could
    // sign, and with none no relay ever took it (plan item 9.3's check).
    send: (p) => publishPreparedOsint(p as PreparedOsintBroadcast, { signer: nostrIdentityService.asSigner() }),
  });
  return outcome.status === 'sent' ? outcome.result : null;
}
