/**
 * Mission paths through the publish review (plan item 0.1): publishing a
 * Mission Package, sending a kept one again, and delegating or withdrawing
 * dispatch.
 *
 * Each builds the exact thing that will be signed, shows it, and on a yes signs
 * and sends that thing. The fingerprint shown is the digest its signature
 * covers: manifestDigest for a package, the NIP-01 event id for a grant or a
 * withdrawal.
 */
import { bytesToHex } from '@noble/hashes/utils';
import { nip19 } from 'nostr-tools';
import { requestReview, type ReviewContent, type ReviewOutcome } from './publishReview';
import { nostrEventId } from './nostrEventId';
import { destinationsFor } from './destinations';
import {
  missionService,
  type PreparedCapabilityEvent, type PreparedMissionPackage, type PublishToNavcomResult, missionDestinations,
} from '../intel/MissionService';
import { manifestDigest } from '../exchange/signing';
import type { PackageManifest } from '../exchange/types';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { MissionStatus } from '../../types/intel/MissionUI';
import { missionRestsOnSample } from '../intel/sampleRecords';
import { formatUtcDateTime } from '../../utils/utcTime';
import type { ReportCitation } from '../../types/intel/IntelReportUI';
import { citeRows } from './citeRows';
import { rosterItems } from '../roster/rosterRead';
import { inboxRelays } from '../nostr/inboxRelays';
import { inboxListTemplate, ownInboxRelays } from '../nostr/inboxList';
import { sendOrKeep } from './keepUnsent';
import { inboxListTargets } from '../nostr/publishTargets';

const MISSION_STATE_WORDS = { open: 'Open', closed: 'Closed', claimed: 'Claimed' } as const;

/** What NavCom reads of the package (interchange rev 11), in words. Nothing for a package without a profile. */
function profileRows(profile: PackageManifest['profile']): ReviewContent['fields'] {
  if (!profile) return [];
  const { fieldWork } = profile;
  return [
    { label: 'Mission state', value: MISSION_STATE_WORDS[profile.missionState] },
    { label: 'Who takes it', value: profile.claims === 'one' ? 'One person' : 'Anybody who joins' },
    {
      label: 'Field work',
      value: fieldWork
        ? `${fieldWork.jurisdiction} until ${formatUtcDateTime(fieldWork.validUntil * 1000, { year: true })}, in the tags NavCom's map reads`
        : 'No: desk work, naming no region',
    },
    ...(profile.agent ? [{ label: 'Agent', value: `Posted by an agent, as ${profile.agent}` }] : []),
  ];
}

/** A Mission Package as a person reads it, and as it is sent, with what it cites in its tags. */
export function showManifest(manifest: Readonly<PackageManifest>, cites: readonly ReportCitation[] = [], heldBack = 0, toward: readonly { coordinate: string }[] = []): ReviewContent {
  const objectives = manifest.objectives ?? [];
  const meta = manifest.metadata ?? {};
  const fields = [
    { label: 'Distribution', value: manifest.visibility ?? 'not stated' },
    ...objectives.map((o, i) => ({
      label: `Asks ${i + 1}`,
      value: [o.ask, o.handsBack && `hands back ${o.handsBack}`, o.limits?.length && `must not: ${o.limits.join('; ')}`]
        .filter(Boolean).join(' · '),
    })),
    // The package names how much evidence the mission rests on; the evidence
    // itself does not travel (Locked Decision #7).
    {
      label: 'Evidence',
      value: `${Number(meta.relatedReportCount ?? 0)} linked report(s) and ${Number(meta.relatedCaseCount ?? 0)} linked case(s), counted only: their contents are not sent`,
    },
    // The observations they rest on are cited, where their distribution reaches (D-MX: MX19, MX22, MX24).
    ...citeRows(cites, heldBack),
    // The Causes and Initiatives it says it works toward, named as read here (RS59).
    ...(toward.length ? [{ label: 'Works toward', value: toward.map((l) => rosterItems().find((x) => x.address === l.coordinate)?.title ?? l.coordinate).join('; ') }] : []),
    ...(typeof meta.missionNumber === 'string' ? [{ label: 'Mission', value: meta.missionNumber }] : []),
    ...profileRows(manifest.profile),
    // Its signer, by callsign or key (D-MX, MX7): the person publishes, through Starcom.
    { label: 'Author', value: /^npub1/.test(manifest.author) ? `your key, ${manifest.author.slice(0, 14)}… (set a callsign with /callsign)` : manifest.author },
    { label: 'Licence', value: String(manifest.license) },
  ];
  return {
    title: manifest.name,
    body: manifest.description,
    fields,
    raw: JSON.stringify(manifest, null, 2),
  };
}

const packageDigest = (manifest: Readonly<PackageManifest>) => bytesToHex(manifestDigest(manifest as PackageManifest));

/** Check, show and, on a yes, sign and send a READY_FOR_PACKAGE mission's package. */
export async function reviewMissionPackage(missionId: string): Promise<ReviewOutcome<PublishToNavcomResult>> {
  const prepared = await missionService.prepareMissionPackage(missionId);
  const mission = await missionService.getMission(missionId);
  /*
   * A report on it is sealed to its publisher and sent only to the inbox they name (MX28), so a mission that asks for
   * counts, from someone who names none yet, posts their inbox list beside it, shown here (MX32).
   */
  const me = nostrIdentityService.signerPubkey();
  const inbox = mission?.countLines?.length && me && (await inboxRelays(me)).length === 0 ? ownInboxRelays() : [];
  const inboxTo = inbox.length ? inboxListTargets() : [];
  return requestReview<PreparedMissionPackage & { inbox: string[]; inboxTo: string[] }, PublishToNavcomResult>({
    act: 'Publish Mission Package',
    // A sample mission, or one resting on sample evidence, is never published (plan item 0.9).
    sample: mission !== null && missionRestsOnSample(mission),
    payload: { ...prepared, inbox, inboxTo },
    show: (p) => {
      const shown = showManifest(p.manifest, p.cites, p.heldBack, p.toward);
      return p.inbox.length
        ? { ...shown, fields: [...shown.fields, { label: 'Your inbox', value: `Also posts where you take sealed messages, so its reports can reach you: ${p.inbox.join(', ')}` }] }
        : shown;
    },
    // Where the mission's distribution sends it, decided when it was prepared, and where an inbox list goes.
    destinations: destinationsFor([...new Set([...prepared.relays, ...inboxTo])]),
    digest: (p) => packageDigest(p.manifest),
    signer: await nostrIdentityService.refreshSigner(),
    send: async (p) => {
      const result = await missionService.publishPreparedPackage(p as PreparedMissionPackage);
      if (p.inbox.length && result.broadcast.success) {
        // Kept when no relay takes it, to go when one does (W1b); the package went either way.
        await sendOrKeep(inboxListTemplate(p.inbox), p.inboxTo, Date.now()).catch(() => undefined);
      }
      return result;
    },
  });
}

/**
 * Show a published mission's closing, its package saying closed, and on a yes
 * sign and send exactly it (D-MX, MX12).
 */
export async function reviewMissionClosing(missionId: string): Promise<ReviewOutcome<PublishToNavcomResult>> {
  const prepared = await missionService.prepareClosingPackage(missionId);
  const mission = await missionService.getMission(missionId);
  return requestReview<PreparedMissionPackage, PublishToNavcomResult>({
    act: 'Publish the closing',
    sample: mission !== null && missionRestsOnSample(mission),
    payload: prepared,
    show: (p) => showManifest(p.manifest, p.cites, 0, p.toward),
    destinations: destinationsFor(prepared.relays),
    digest: (p) => packageDigest(p.manifest),
    signer: await nostrIdentityService.refreshSigner(),
    send: (p) => missionService.publishPreparedClosing(p as PreparedMissionPackage),
  });
}

/** Show the package kept at packaging, and on a yes send exactly it again. */
export async function reviewMissionRetry(missionId: string): Promise<ReviewOutcome<PublishToNavcomResult>> {
  const mission = await missionService.getMission(missionId);
  if (!mission) throw new Error(`Mission not found: ${missionId}`);
  // Refused here, never handed to retryPublish unreviewed.
  if (mission.status !== MissionStatus.PACKAGED) {
    throw new Error(`Only a ${MissionStatus.PACKAGED} mission can be retried (current: ${mission.status})`);
  }
  if (!mission.packagedManifest) {
    throw new Error(`This mission was packaged before packages were kept, so there is nothing frozen to send again. Move it back to ${MissionStatus.READY_FOR_PACKAGE} and publish it.`);
  }
  const kept = mission.packagedManifest;
  const { relays, refusal } = missionDestinations(mission);
  if (refusal) throw new Error(refusal);
  return requestReview<{ missionId: string; manifest: PackageManifest; cites: ReportCitation[] }, PublishToNavcomResult>({
    act: 'Send Mission Package again',
    sample: missionRestsOnSample(mission),
    // retryPublish sends the citations kept with the package, these.
    payload: { missionId, manifest: kept, cites: mission.packagedCites ?? [] },
    show: (p) => showManifest(p.manifest, p.cites, 0, mission.toward ?? []),
    destinations: destinationsFor(relays),
    digest: (p) => packageDigest(p.manifest),
    signer: await nostrIdentityService.refreshSigner(),
    send: (p) => missionService.retryPublish(p.missionId, packageDigest(p.manifest)),
  });
}

const npubOf = (hex: string) => {
  try { return nip19.npubEncode(hex); } catch { return hex; }
};

const tag = (event: Readonly<PreparedCapabilityEvent['event']>, name: string) => event.tags.find((t) => t[0] === name)?.[1];

function showCapability(p: Readonly<PreparedCapabilityEvent>, missionTitle: string, withdrawing: boolean): ReviewContent {
  const holder = npubOf(p.holder);
  return {
    title: withdrawing ? `Withdraw dispatch of "${missionTitle}" from ${holder}` : `Let ${holder} dispatch "${missionTitle}"`,
    body: withdrawing
      ? `After this, the grant ${holder} holds no longer verifies. The reason travels with the withdrawal: ${p.event.content || 'none given'}`
      : `A signed grant ${holder} can fetch from these relays. They can pass it on; you can withdraw it later.`,
    fields: [
      { label: 'Resource', value: tag(p.event, 'resource') ?? '' },
      { label: 'Action', value: tag(p.event, 'action') ?? '' },
      { label: 'Holder', value: holder },
      { label: 'Issued', value: new Date(p.event.created_at * 1000).toISOString() },
    ],
    raw: JSON.stringify(p.event, null, 2),
  };
}

async function missionTitle(missionId: string): Promise<string> {
  return (await missionService.getMission(missionId))?.title ?? missionId;
}

/** Show a delegation of dispatch, and on a yes sign and publish exactly it. */
export async function reviewDelegation(missionId: string, holder: string): Promise<ReviewOutcome<{ relaysOk: number }>> {
  const prepared = await missionService.prepareDelegation(missionId, holder);
  const title = await missionTitle(missionId);
  return requestReview<PreparedCapabilityEvent, { relaysOk: number }>({
    act: 'Publish delegation',
    payload: prepared,
    show: (p) => showCapability(p, title, false),
    destinations: destinationsFor(prepared.relays),
    digest: (p) => nostrEventId(p.event),
    signer: prepared.event.pubkey,
    send: (p) => missionService.publishPreparedDelegation(p as PreparedCapabilityEvent),
  });
}

/** Show the withdrawal of a delegation, and on a yes sign and publish exactly it. */
export async function reviewRevocation(missionId: string, holder: string, reason: string): Promise<ReviewOutcome<{ relaysOk: number }>> {
  const prepared = await missionService.prepareRevocation(missionId, holder, reason);
  const title = await missionTitle(missionId);
  return requestReview<PreparedCapabilityEvent, { relaysOk: number }>({
    act: 'Publish withdrawal',
    payload: prepared,
    show: (p) => showCapability(p, title, true),
    destinations: destinationsFor(prepared.relays),
    digest: (p) => nostrEventId(p.event),
    signer: prepared.event.pubkey,
    send: (p) => missionService.publishPreparedRevocation(p as PreparedCapabilityEvent),
  });
}
