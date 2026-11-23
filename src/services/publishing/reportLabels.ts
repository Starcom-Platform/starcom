/**
 * A publisher's word on a report sealed to it (the owner's MX32, 2026-10-23), and the inbox list that lets reports
 * reach it, each through the review every publish passes.
 *
 * Settling and challenging are NavCom's labels (§5.3): NIP-32, kind 1985, in `navcom.mission`, naming the report by
 * the id inside its seal and the mission by its `a`, so a reader asking by mission finds it, and nobody learns who
 * sent the report from the label. A settlement is the poster's; a challenge reverses nothing and stands beside it.
 * Silence settles a report seven days from its day all the same.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { requestReview, type ReviewOutcome } from './publishReview';
import { destinationsFor } from './destinations';
import { stableStringify } from '../exchange/signing';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { missionDestinations } from '../intel/MissionService';
import { MISSION_LABEL_KIND, MISSION_LABEL_NAMESPACE } from '../intel/missionLabels';
import type { ReceivedReport } from '../intel/received/receivedReports';
import { sendOrKeep } from './keepUnsent';
import { inboxListTemplate, ownInboxRelays } from '../nostr/inboxList';
import { inboxListTargets } from '../nostr/publishTargets';
import type { MissionUI } from '../../types/intel/MissionUI';

type Template = { kind: number; tags: string[][]; content: string };

const digestOf = (t: Template) => bytesToHex(sha256(utf8ToBytes(stableStringify({ kind: t.kind, tags: t.tags, content: t.content }))));

/** The label a publisher signs on a report: one word, the report and the mission, no text. */
export function reportLabelTemplate(word: 'settled' | 'challenged', report: Pick<ReceivedReport, 'id' | 'coordinate'>): Template {
  return {
    kind: MISSION_LABEL_KIND,
    tags: [['L', MISSION_LABEL_NAMESPACE], ['l', word, MISSION_LABEL_NAMESPACE], ['e', report.id], ['a', report.coordinate]],
    content: '',
  };
}

/** Show, and on a yes sign and send, a settlement or a challenge of a report on one's own mission. */
export async function reviewReportLabel(
  mission: Pick<MissionUI, 'title' | 'visibility' | 'limitedTo' | 'publishedAs'>,
  report: ReceivedReport,
  word: 'settled' | 'challenged',
): Promise<ReviewOutcome<{ relays: number; kept?: boolean }>> {
  if (!mission.publishedAs || mission.publishedAs !== report.coordinate) {
    return { status: 'refused', reason: 'That report is not on this mission. Nothing was sent.' };
  }
  const { relays, refusal } = missionDestinations(mission);
  if (refusal) return { status: 'refused', reason: refusal };
  const template = reportLabelTemplate(word, report);
  return requestReview<{ template: Template; relays: string[] }, { relays: number; kept?: boolean }>({
    act: word === 'settled' ? 'Settle report' : 'Challenge report',
    payload: { template, relays },
    show: () => ({
      title: `${word === 'settled' ? 'Settle' : 'Challenge'} a report on: ${mission.title}`,
      body: [...report.counts.map((c) => `${c.line.replace(/:\s*a count\.?$/i, '')}: ${c.n}`), `Day: ${report.day}`].join('\n'),
      fields: [
        { label: 'Says', value: word === 'settled'
          ? 'You accept it: it counts as done. A witness cannot outrank you.'
          : 'You dispute it. It reverses nothing: the report still settles, with your challenge beside it.' },
        { label: 'Names', value: 'The report by the id inside its seal, and the mission. Never who sent it, never what it counted.' },
        { label: 'Signed by', value: 'Your key, as the mission\'s publisher.' },
      ],
      raw: JSON.stringify(template, null, 2),
    }),
    destinations: destinationsFor(relays),
    digest: (p) => digestOf(p.template),
    digestLabel: 'the label, as it will be signed',
    signer: await nostrIdentityService.refreshSigner(),
    // No relay answering keeps it here, to go when one does (W1b).
    send: async (p) => { const sent = await sendOrKeep(p.template, p.relays, Date.now()); return { relays: sent.relays, ...(sent.kept ? { kept: true } : {}) }; },
  });
}

/** Show, and on a yes sign and send, the list of where this person takes sealed messages, so reports can reach them. */
export async function reviewInboxList(): Promise<ReviewOutcome<{ relays: number; kept?: boolean }>> {
  const inbox = ownInboxRelays();
  if (inbox.length === 0) return { status: 'refused', reason: 'This build reads no public relay for sealed messages, so there is no inbox to name. Nothing was sent.' };
  const template = inboxListTemplate(inbox);
  const to = inboxListTargets();
  return requestReview<{ template: Template; to: string[] }, { relays: number; kept?: boolean }>({
    act: 'Post your inbox',
    payload: { template, to },
    show: () => ({
      title: 'Where you take sealed messages',
      body: inbox.join('\n'),
      fields: [
        { label: 'Why', value: 'A report on a mission you published is sealed to you and sent only to the inbox you name.' },
        { label: 'Says', value: 'These relays, and nothing about you beyond your key.' },
      ],
      raw: JSON.stringify(template, null, 2),
    }),
    destinations: destinationsFor(to),
    digest: (p) => digestOf(p.template),
    digestLabel: 'the list, as it will be signed',
    signer: await nostrIdentityService.refreshSigner(),
    send: async (p) => { const sent = await sendOrKeep(p.template, p.to, Date.now()); return { relays: sent.relays, ...(sent.kept ? { kept: true } : {}) }; },
  });
}
