/**
 * Sending a case or a mission to chosen people over relays (plan item 2.4),
 * through the review every publish passes.
 *
 * The review shows what goes (the record and everything it carries), to whom,
 * and where, before anything is signed: the bundle is signed and sealed only
 * on a yes, so an extension is asked to sign after the person has seen it.
 * The fingerprint is of the records' hashes, which the signed manifest lists.
 *
 * Where: the build's internal relays and the team relays that can reach the
 * recipients (services/team/sealedRelays.ts).
 *
 * What may go is decided by distribution (plan item 9.13, decision G8): a
 * Private or undecided case or mission is refused before anything is shown,
 * and the review lists the Private records it cites that stay here and the
 * undecided ones that go with it.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { nip19 } from 'nostr-tools';
import { requestReview, type ReviewOutcome } from './publishReview';
import { destinationsFor } from './destinations';
import { collectBundle, type CollectedBundle } from '../intel/bundles/collectBundle';
import { StaysHere, storedVisibility, type WithheldRecord } from '../intel/bundles/bundleDistribution';
import { checkFitsARelay } from '../intel/bundles/bundleParts';
import { sendBundle, type SendResult } from '../intel/bundles/sendBundle';
import { makeBundle, stableSubject, type BundleSubjectType, type RecordEnvelope } from '../exchange/bundle';
import { stableStringify } from '../exchange/signing';
import { sealedRelaysFor } from '../team/sealedRelays';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { caseRestsOnSample, missionRestsOnSample } from '../intel/sampleRecords';
import type { IntelCaseUI } from '../../types/intel/IntelCaseUI';
import type { MissionUI } from '../../types/intel/MissionUI';

interface BundleSend {
  subject: { type: BundleSubjectType; id: string };
  envelopes: RecordEnvelope[];
  /** Private records it cites, left out. */
  withheld: WithheldRecord[];
  recipients: string[];
  relays: string[];
}


const shortNpub = (pubkey: string): string => {
  const npub = nip19.npubEncode(pubkey);
  return `${npub.slice(0, 14)}…${npub.slice(-6)}`;
};

const WORD: Record<string, string> = { case: 'case', mission: 'mission', report: 'report', item: 'intel item' };

function show(p: Readonly<BundleSend>) {
  const subject = p.envelopes.find((e) => e.type === p.subject.type && e.id === p.subject.id)!;
  const title = String(subject.record.title ?? p.subject.id);
  const counts = new Map<string, number>();
  p.envelopes.forEach((e) => counts.set(e.type, (counts.get(e.type) ?? 0) + 1));
  // The case or mission itself was decided before it got here; what it carries may not have been.
  const undecided = p.envelopes.filter((e) => storedVisibility(e.type, e.record) === undefined);
  const records = (n: number) => `${n} ${n === 1 ? 'record' : 'records'}`;
  return {
    title,
    body: [
      ...p.envelopes.map((e) => `${WORD[e.type]}: ${String(e.record.title ?? (e.record.frontmatter as { title?: unknown } | undefined)?.title ?? e.id)}${undecided.includes(e) ? ' (undecided)' : ''}`),
      ...p.withheld.map((w) => `${WORD[w.type]}: ${w.title} — stays here: Private`),
    ].join('\n'),
    fields: [
      { label: 'To', value: p.recipients.map(shortNpub).join(', ') },
      { label: 'Holds', value: [...counts].map(([type, n]) => `${n} ${WORD[type]}${n === 1 ? '' : 's'}`).join(', ') },
      ...(p.withheld.length > 0 ? [{
        label: 'Stays here',
        value: `${p.withheld.length} Private ${p.withheld.length === 1 ? 'record is' : 'records are'} not sent. The people it goes to see that ${p.withheld.length === 1 ? 'one was' : 'some were'} kept back, never what ${p.withheld.length === 1 ? 'it holds' : 'they hold'}.`,
      }] : []),
      ...(undecided.length > 0 ? [{
        label: 'Undecided',
        value: `${records(undecided.length)} it carries ${undecided.length === 1 ? 'has' : 'have'} no distribution chosen. ${undecided.length === 1 ? 'It goes' : 'They go'}, sealed to these people, and ${undecided.length === 1 ? 'stays' : 'stay'} undecided.`,
      }] : []),
      { label: 'Sealed', value: 'Encrypted to each person (NIP-59). A relay sees who receives something and roughly when; not who sent it, and not what it is. A relay someone is not on holds a copy they never read.' },
      { label: 'Readable', value: 'Protected fields go readable to the people it is sealed to, and are encrypted again on their machine.' },
    ],
    raw: JSON.stringify(p.envelopes.map((e) => e.record), null, 2),
  };
}

/** Collect, show and, on a yes, sign, seal and send a case or mission to these people. */
export async function reviewBundleSend(subject: { type: BundleSubjectType; id: string }, recipients: string[]): Promise<ReviewOutcome<SendResult>> {
  // Distribution first, so a record that may not leave is never pointed to a file instead.
  let collected: CollectedBundle;
  try {
    collected = await collectBundle(subject);
  } catch (e) {
    if (e instanceof StaysHere) return { status: 'refused', reason: e.message };
    throw e;
  }
  const { envelopes, withheld } = collected;
  const relays = sealedRelaysFor(recipients);
  if (relays.length === 0) {
    return { status: 'refused', reason: 'There is no relay to send it over: this build names no internal relay, and no team relay you joined lists them. Export it as a file instead.' };
  }
  checkFitsARelay(envelopes);
  const record = envelopes[0].record;
  const sample = subject.type === 'case'
    ? caseRestsOnSample(record as unknown as IntelCaseUI)
    : missionRestsOnSample(record as unknown as MissionUI);
  return requestReview<BundleSend, SendResult>({
    act: `Send ${subject.type}`,
    sample,
    payload: { subject, envelopes, withheld, recipients, relays },
    show,
    destinations: destinationsFor(relays),
    digest: (p) => bytesToHex(sha256(utf8ToBytes(stableStringify(stableSubject(p.subject, p.envelopes, p.withheld))))),
    digestLabel: 'the records, as the signed manifest will list them',
    signer: await nostrIdentityService.refreshSigner(),
    send: async (p) => sendBundle(await makeBundle(p.subject, [...p.envelopes], [...p.withheld]), [...p.recipients], [...p.relays]),
  });
}
