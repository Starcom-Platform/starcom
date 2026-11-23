/**
 * Who wrote a review, and what a published item is addressed by (plan item
 * 5.1). Provenance is shown beside what was said, never turned into weight:
 * the risk is throwaway keys posting verdicts, and the answer is to say whose
 * each one is.
 */
import { isOwnKey, nameOf } from '../identity/names';
import { realTimeTeamService } from '../RealTimeTeamService';
import { PROTOCOL_KINDS } from '../nostr/kindRegistry';
import type { MissionUI } from '../../types/intel/MissionUI';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import { publishedFindingsLedger, type PublishedFinding } from '../intel/findings/PublishedFindingsLedger';
import { caseAdjudicationAttribute } from '../intel/findings/caseAdjudication';
import type { AcceptedPackage } from '../intel/MissionPackageIngest';
import { coordinateFor } from '../intel/missionPackageThread';
import type { Provenance, ReviewTarget } from './reviewEvents';

export function provenanceOf(pubkey: string): Provenance {
  if (isOwnKey(pubkey)) return 'you';
  // On a team's roster now: a name learned from a roster once is not membership.
  if (realTimeTeamService.getTeams().some((team) => team.members.some((m) => m.pubkey === pubkey))) return 'teammate';
  return nameOf(pubkey) ? 'known' : 'unknown';
}

/**
 * A dispatched Mission Package: the address it was published at and the
 * version the relays accepted. Null until both are recorded.
 */
export function missionReviewTarget(mission: Pick<MissionUI, 'publishedAs' | 'dispatchReceipt'>): ReviewTarget | null {
  const coordinate = mission.publishedAs;
  const eventId = mission.dispatchReceipt?.eventId;
  if (!coordinate || !eventId) return null;
  const [kind, author] = coordinate.split(':');
  if (Number(kind) !== PROTOCOL_KINDS.MISSION_PACKAGE || !author) return null;
  return { kind: PROTOCOL_KINDS.MISSION_PACKAGE, author, coordinate, eventId };
}

/**
 * A package another node published, as received: its address and the version
 * this node verified. Null for one carrying no d tag, which has no address.
 */
export function receivedPackageReviewTarget(pkg: Pick<AcceptedPackage, 'event' | 'relay'>): ReviewTarget | null {
  const identifier = pkg.event.tags.find((t) => t[0] === 'd')?.[1];
  if (!identifier) return null;
  return {
    kind: PROTOCOL_KINDS.MISSION_PACKAGE,
    author: pkg.event.pubkey,
    coordinate: coordinateFor(pkg.event.pubkey, identifier),
    eventId: pkg.event.id,
    relay: pkg.relay,
  };
}

/**
 * A report read from a relay: its address (or its event, for a note) and the
 * version read. Null for a report this node never read from a relay.
 */
export function reportReviewTarget(
  report: Pick<IntelReportUI, 'id' | 'nostrEventId' | 'nostrKind' | 'tags'> & { author?: string },
): ReviewTarget | null {
  const eventId = report.nostrEventId;
  if (!eventId || !report.nostrKind) return null;
  const relay = report.tags?.find((t) => t.startsWith('relay:'))?.slice('relay:'.length);
  const where = relay ? { relay } : {};
  const address = /^(\d+):([0-9a-f]{64}):/.exec(report.id);
  // One event with several features is several reports, `<address>#<i>`; the
  // event, which reviews point at, is the address without the feature.
  if (address) return { kind: Number(address[1]), author: address[2], coordinate: report.id.replace(/#\d+$/, ''), eventId, ...where };
  if (!report.author) return null;
  return { kind: report.nostrKind, author: report.author, eventId, ...where };
}

/**
 * A finding this node published, as its ledger recorded it: the key that
 * signed the event, its slot, and the version the relays took. Null once
 * withdrawn, or for a record from before the key was kept.
 */
export function findingReviewTarget(entry: Pick<PublishedFinding, 'slot' | 'eventId' | 'nostrPubkey' | 'retractedAt'>): ReviewTarget | null {
  if (!entry.eventId || !entry.nostrPubkey || entry.retractedAt) return null;
  return {
    kind: PROTOCOL_KINDS.ATTESTED_CLAIM,
    author: entry.nostrPubkey,
    coordinate: `${PROTOCOL_KINDS.ATTESTED_CLAIM}:${entry.nostrPubkey}:${entry.slot}`,
    eventId: entry.eventId,
  };
}

/** A case's position as published from here, or null if it has not been. */
export function casePositionReviewTarget(caseNumber: string | undefined): ReviewTarget | null {
  if (!caseNumber) return null;
  const attribute = caseAdjudicationAttribute(caseNumber);
  // The live claim, the latest: a withdrawn or older one for the same case is not its position now.
  const entry = publishedFindingsLedger.live()
    .filter((e) => e.content.claim?.attribute === attribute)
    .sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))[0];
  return entry ? findingReviewTarget(entry) : null;
}
