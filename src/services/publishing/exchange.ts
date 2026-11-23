/**
 * The Exchange's publish through the review (plan item 0.1).
 *
 * "Compose & Publish Current Draft" sent the most recently edited draft to IPFS
 * and Nostr in one click, with a CC0 licence it chose itself, and nobody saw
 * the package first. Now the package is shown, licence and all, with both of
 * its destinations: the manifest goes to IPFS, and a small Intel Report event
 * carrying its IPFS address goes to the relays.
 *
 * Nothing is signed before the upload, so the fingerprint is of the package
 * itself: SHA-256 of the manifest in canonical form.
 */
import { requestReview, sha256Hex, type ReviewContent } from './publishReview';
import { destinationsFor } from './destinations';
import { publishAdapter, type PublishResponse } from '../exchange/PublishAdapter';
import type { PackageManifest } from '../exchange/types';
import { publishRelays } from '../nostr/publishTargets';
import { stableStringify } from '../intel/findings/signFinding';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { manifestHoldsSample, onceLoaded } from '../intel/sampleRecords';
import type { InformationVisibility } from '../../types/intel/IntelItemUI';
import type { ReportCitation } from '../../types/intel/IntelReportUI';
import { citeRows } from './citeRows';

/** What a Public package's publication does, in the app's words. */
export const EXCHANGE_PUBLIC_WORDS = 'Goes to IPFS and to the public relays: anyone can read it, and it cannot be recalled.';

/**
 * Why a package may not go through the Exchange, or null when it may (plan
 * item 0.4). Every package goes to IPFS, where anyone holding the address can
 * read it, so only a Public one goes, whatever relays the build has. The
 * distribution was shown in the review and then ignored.
 */
export function exchangeRefusal(visibility: InformationVisibility | undefined): string | null {
  if (visibility === 'public') return null;
  if (visibility === undefined) {
    return 'Nobody has decided who may receive this package, so it goes nowhere yet. Mark it Public to publish it through the Exchange.';
  }
  const named = visibility === 'limited' ? 'Limited' : 'Private';
  return `This package is ${named}. The Exchange puts every package on IPFS, where anyone holding the address can read it, so only a Public package can go through it.`;
}

/** An Exchange package as a person reads it, exactly as it is uploaded, and what its announcement cites. */
export function showExchangeManifest(manifest: Readonly<PackageManifest>, cites: readonly ReportCitation[] = []): ReviewContent {
  const deepLink = typeof manifest.metadata?.analysisDeepLink === 'string' ? manifest.metadata.analysisDeepLink : null;
  return {
    title: manifest.name ?? manifest.id,
    body: manifest.description ?? '',
    fields: [
      { label: 'Licence', value: String(manifest.license ?? 'not stated') },
      { label: 'Distribution', value: manifest.visibility ?? 'not stated' },
      // Defaulted, so a malformed manifest is still shown rather than breaking the review.
      ...(manifest.reports ?? []).map((r, i) => ({ label: `Report ${i + 1}`, value: `${r.title} (its text is not in the package, only a checksum of it)` })),
      ...(deepLink ? [{ label: 'Link back to the analysis', value: deepLink }] : []),
      { label: 'Author', value: manifest.author ?? 'not stated' },
      ...citeRows(cites),
    ],
    raw: JSON.stringify(manifest, null, 2),
  };
}

/** Show a composed package, and on a yes upload it and announce it, citing what its report rests on. */
export async function reviewExchangePackage(manifest: PackageManifest, cites: readonly ReportCitation[] = []): Promise<PublishResponse | null> {
  // Refused before anything is shown or sent.
  const refusal = exchangeRefusal(manifest.visibility);
  if (refusal) throw new Error(refusal);
  // A package holding a sample report is never published (plan item 0.9).
  const sample = await onceLoaded(() => manifestHoldsSample(manifest));
  const outcome = await requestReview<{ manifest: PackageManifest; cites: readonly ReportCitation[] }, PublishResponse>({
    act: 'Publish package',
    sample,
    // The citations travel beside the package, in the announcement's tags (D-MX, MX22): shown, and sent, as one.
    payload: { manifest, cites },
    show: (p) => showExchangeManifest(p.manifest, p.cites),
    destinations: [{ address: 'IPFS', kind: 'ipfs' }, ...destinationsFor(publishRelays('INTEL'))],
    digest: (p) => sha256Hex(stableStringify(p.manifest)),
    digestLabel: 'Fingerprint of the package',
    signer: await nostrIdentityService.refreshSigner(),
    // The adapter uploads the manifest only; the zip is not sent anywhere.
    send: (p) => publishAdapter.publish({
      manifest: p.manifest as PackageManifest,
      blob: new Blob([]),
      ...(p.cites.length ? { cites: [...p.cites] } : {}),
    }),
  });
  return outcome.status === 'sent' ? outcome.result : null;
}
