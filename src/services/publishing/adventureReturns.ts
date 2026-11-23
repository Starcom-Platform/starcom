/**
 * An adventure's return, through the review every publish passes (decision D-RS, RS35).
 *
 * The review shows the return as it will be sealed: seen or not, the counts given and the day, who alone can open
 * it (its caller, by the key that posted it) and the relays it goes over, before anything is signed. On a yes it is
 * sealed to the caller and sent as a mission report is (sendReport.ts), to the inbox relays its kind 10050 list names
 * and nowhere else (D-MX, MX28), and this device keeps that it went. It claims nothing: nobody else learns that the
 * person went.
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
import { dayOf, type ReportTemplate } from '../intel/received/missionReport';
import { dayIn, pausedReason } from './missionReports';
import { sendMissionReport } from '../intel/received/sendReport';
import { recordReturn, returnTemplate } from '../roster/adventure';
import type { ReadRosterItem } from '../roster/rosterItem';

interface ReturnSend {
  title: string;
  template: ReportTemplate;
  recipient: string;
  /** The key that posted the adventure; the recipient is its caller's newer key when one took over. */
  posted: string;
  relays: string[];
}

const npubOf = (pubkey: string): string => {
  try { return nip19.npubEncode(pubkey); } catch { return pubkey; }
};

function show(p: Readonly<ReturnSend>) {
  const day = dayIn(p.template);
  const seen = (() => { try { return (JSON.parse(p.template.content) as { seen?: unknown }).seen === true; } catch { return false; } })();
  return {
    title: `Return from: ${p.title}`,
    body: [seen ? 'Seen it' : 'Not seen', ...p.template.given.map((c) => `${c.label}: ${c.n}`), `Day: ${day}`].join('\n'),
    fields: [
      { label: 'To', value: p.recipient === p.posted ? `Its caller, the key that posted it: ${npubOf(p.recipient)}` : `Its caller's newer key, which took over from the one that posted it: ${npubOf(p.recipient)}` },
      { label: 'Sealed', value: 'Only they can open it. A relay holds a sealed message: never who sent it, never what it says.' },
      { label: 'Where', value: 'Only the inbox relays its caller names for sealed messages.' },
      { label: 'Day', value: `${day}, the day only: no time, no place, no people.` },
      { label: 'Claims', value: 'Nothing. It does not say publicly that you went.' },
    ],
    raw: JSON.stringify({ kind: p.template.kind, tags: p.template.tags, content: p.template.content, created_at: p.template.createdAt }, null, 2),
  };
}

/** Show, and on a yes seal and send, a return from an adventure: seen or not, with the counts given. */
export async function reviewAdventureReturn(
  item: ReadRosterItem,
  seen: boolean,
  counts: ReadonlyArray<{ label: string; n: number }>,
  now: number = Date.now(),
): Promise<ReviewOutcome<{ relays: number }>> {
  const day = dayOf(now);
  const given = counts.filter((c) => Number.isInteger(c.n) && c.n >= 0);
  const template = returnTemplate({ address: item.address, seen, counts: given, day, callsign: publishedCallsign() });
  const target = sealTargetOf(item.author, Math.floor(now / 1000));
  if (!target.key) return { status: 'refused', reason: pausedReason('return', target.exposedOn) };
  const recipient = target.key;
  const relays = await inboxRelays(recipient);
  if (relays.length === 0) {
    return { status: 'refused', reason: 'Its caller names no inbox for sealed messages, so a return cannot reach it privately. Nothing was sent.' };
  }
  const outcome = await requestReview<ReturnSend, { relays: number }>({
    act: 'Send return',
    payload: { title: item.title, template, recipient, posted: item.author.toLowerCase(), relays },
    show,
    destinations: destinationsFor(relays),
    sealed: true,
    digest: (p) => bytesToHex(sha256(utf8ToBytes(stableStringify({ tags: p.template.tags, content: p.template.content, created_at: p.template.createdAt })))),
    digestLabel: 'the return, as it will be sealed',
    signer: await nostrIdentityService.refreshSigner(),
    send: async (p) => sendMissionReport(p.template, p.recipient, [...p.relays]),
  });
  if (outcome.status === 'sent') recordReturn(item.address, { seen, day, relays: outcome.result.relays });
  return outcome;
}
