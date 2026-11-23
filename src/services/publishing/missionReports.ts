/**
 * Reporting back on a taken mission, through the review every publish passes (decision D-MF, MF11–MF13).
 *
 * The review shows the report as it will be sealed, the counts and the day, who alone can open it (the
 * package's publisher, by its key: a sender reads no names) and the relays it goes over, before anything is
 * signed. On a yes it is sealed to the publisher and sent (sendReport.ts) to the inbox relays its kind 10050 list
 * names, and nowhere else (D-MX, MX28); a publisher that names none is sent nothing. The taken mission keeps that it
 * went. It claims nothing (MF13).
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { nip19 } from 'nostr-tools';
import { requestReview, type ReviewOutcome } from './publishReview';
import { destinationsFor } from './destinations';
import { stableStringify } from '../exchange/signing';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { publishedCallsign } from '../identity/callsign';
import { inboxRelays } from '../nostr/inboxRelays';
import { sealTargetOf } from '../nostr/publisherKeys';
import { dayOf, reportTemplate, type ReportTemplate } from '../intel/received/missionReport';
import { sendMissionReport, type SentReportOutcome } from '../intel/received/sendReport';
import { takenMissions, type TakenMission } from '../intel/received/takenMissions';

interface ReportSend {
  title: string;
  template: ReportTemplate;
  recipient: string;
  /** The key that signed the package; the recipient is its publisher's newer key when one took over. */
  posted: string;
  relays: string[];
}

/**
 * Why a report or a return to a publisher is paused: the key its work was posted under is exposed, and whoever holds
 * that secret could open what is sealed to it and see who sent it (NavCom §5.0, rev 7). It resumes when the
 * publisher's new key starts.
 */
export const pausedReason = (what: 'report' | 'return', exposed: string | null): string =>
  `${what === 'report' ? 'Reports to this publisher' : 'Returns to this caller'} are paused. ${exposed
    ? `The key it posted this under was exposed on ${exposed}, so a sealed ${what} could show who sent it. They resume when its new key starts.`
    : 'None of its keys is in use yet.'} Nothing was sent.`;

const npubOf = (pubkey: string): string => {
  try { return nip19.npubEncode(pubkey); } catch { return pubkey; }
};

/** The day a report's content names. */
export const dayIn = (template: Pick<ReportTemplate, 'content'>): string => {
  try { return String((JSON.parse(template.content) as { date?: unknown }).date ?? ''); } catch { return ''; }
};

function show(p: Readonly<ReportSend>) {
  const day = dayIn(p.template);
  return {
    title: `Report on: ${p.title}`,
    body: [...p.template.given.map((c) => `${c.label}: ${c.n}`), `Day: ${day}`].join('\n'),
    fields: [
      { label: 'To', value: p.recipient === p.posted ? `The key that signed the package: ${npubOf(p.recipient)}` : `Its publisher's newer key, which took over from the one that signed the package: ${npubOf(p.recipient)}` },
      { label: 'Sealed', value: 'Only they can open it. A relay holds a sealed message: never who sent it, never what it says.' },
      { label: 'Where', value: 'Only the inbox relays the publisher names for sealed messages.' },
      { label: 'Day', value: `${day}, the day only: no time, no place, no people.` },
      { label: 'Claims', value: 'Nothing. It does not say publicly that you took the mission on.' },
    ],
    raw: JSON.stringify({ kind: p.template.kind, tags: p.template.tags, content: p.template.content, created_at: p.template.createdAt }, null, 2),
  };
}

/** Show, and on a yes seal and send, a report of these counts on a taken mission. */
export async function reviewMissionReport(mission: TakenMission, values: Readonly<Record<string, number>>, now: number = Date.now()): Promise<ReviewOutcome<SentReportOutcome>> {
  if (!mission.coordinate || !mission.counts?.length) {
    return { status: 'refused', reason: 'This mission names no counts to report.' };
  }
  const template = reportTemplate({ coordinate: mission.coordinate, counts: mission.counts, values, day: dayOf(now), callsign: publishedCallsign() });
  if (template.given.length === 0) {
    return { status: 'refused', reason: 'Give at least one count: a whole number, 0 or more.' };
  }
  // Its publisher's newest key that speaks now, which may have taken over from the one that signed it (NavCom §5.0).
  const target = sealTargetOf(mission.signer, Math.floor(now / 1000));
  if (!target.key) return { status: 'refused', reason: pausedReason('report', target.exposedOn) };
  const recipient = target.key;
  const relays = await inboxRelays(recipient);
  if (relays.length === 0) {
    return { status: 'refused', reason: 'The publisher names no inbox for sealed messages, so a report cannot reach it privately. Nothing was sent.' };
  }
  const outcome = await requestReview<ReportSend, SentReportOutcome>({
    act: 'Send report',
    payload: { title: mission.title, template, recipient, posted: mission.signer.toLowerCase(), relays },
    show,
    destinations: destinationsFor(relays),
    sealed: true,
    digest: (p) => bytesToHex(sha256(utf8ToBytes(stableStringify({ tags: p.template.tags, content: p.template.content, created_at: p.template.createdAt })))),
    digestLabel: 'the report, as it will be sealed',
    signer: await nostrIdentityService.refreshSigner(),
    send: async (p) => sendMissionReport(p.template, p.recipient, [...p.relays]),
  });
  if (outcome.status === 'sent') {
    const given = Object.fromEntries(mission.counts.filter((c) => template.given.some((g) => g.label === c.label)).map((c) => [c.id, values[c.id]]));
    takenMissions.addReport(mission.key, { day: dayOf(now), values: given, sentAt: new Date(now).toISOString(), relays: outcome.result.relays, id: outcome.result.id, author: outcome.result.author });
  }
  return outcome;
}
