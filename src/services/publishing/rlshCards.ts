/**
 * Publishing and withdrawing an RLSH card (D-RF, RF1, RF3, RF7), through the review every publish passes: the card
 * as it will be signed, who can find it, and the relays it goes to, before anything is signed. Under 13 nothing is
 * made; before the card's contact key is made, how old is asked (RF3). Withdrawn as NavCom withdraws a card: a NIP-09
 * deletion signed by the same key, in NavCom's words, "This changes what you share from now on. It can't unshare
 * what's already out."
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { nip19 } from 'nostr-tools';
import { requestReview, type ReviewContent, type ReviewOutcome } from './publishReview';
import { destinationsFor } from './destinations';
import { stableStringify } from '../exchange/signing';
import { ageBeforeSigning } from '../identity/ageAnswer';
import { publishesAsAgent } from '../identity/callsign';
import { rlshCardRelays } from '../nostr/publishTargets';
import { contactPubkey, discardContactKey, ensureContactKey } from '../rlsh/contactKey';
import { myCard, recordPublished, recordWithdrawn } from '../rlsh/myCard';
import {
  CALLSIGN_MAX, DOING_MAX, cardTemplate, deletionTemplate, doesLabel, keyPrint,
  type CardTemplate, type Finding, type RlshCardDraft,
} from '../rlsh/rlshCard';
import { sendRlshCard } from '../rlsh/sendCard';

/** How a card can be found (RF7), as the review says it. */
export const FINDING_WORDS: Record<Finding, string> = {
  starcom: "Starcom's RLSH list. Anyone can read it there, and on any relay that keeps it.",
  public: "Starcom's RLSH list and navcom.app's public roster. Anyone can read it.",
  address: 'Listed nowhere. It is still published: anyone who has its address can read it.',
};

export const WITHDRAW_WORDS = "This changes what you share from now on. It can't unshare what's already out.";

interface CardSend {
  template: CardTemplate;
  relays: string[];
  finding: Finding;
}

const digestOf = (t: CardTemplate) => bytesToHex(sha256(utf8ToBytes(stableStringify({ kind: t.kind, tags: t.tags, content: t.content }))));
const npubOf = (pubkey: string): string => {
  try { return nip19.npubEncode(pubkey); } catch { return pubkey; }
};

/** Why a draft cannot be published as it is, or null. */
export function draftRefusal(draft: RlshCardDraft): string | null {
  if (!draft.callsign.trim()) return 'Give your card an alias.';
  if (draft.callsign.trim().length > CALLSIGN_MAX) return `An alias is ${CALLSIGN_MAX} characters at most.`;
  if (draft.doing.trim().length > DOING_MAX) return `Say what you do in ${DOING_MAX} characters or fewer.`;
  return null;
}

function showCard(p: Readonly<CardSend>, signer: string): ReviewContent {
  const content = JSON.parse(p.template.content) as { callsign: string; doing?: string };
  const zone = p.template.tags.find((t) => t[0] === 'area');
  const does = p.template.tags.filter((t) => t[0] === 't').map((t) => doesLabel(t[1]));
  return {
    title: `RLSH card: ${content.callsign}`,
    body: content.doing ?? '',
    fields: [
      { label: 'Who can find it', value: FINDING_WORDS[p.finding] },
      { label: 'Zone', value: zone ? zone[3] : 'Not given' },
      { label: 'Does', value: does.length ? does.join(', ') : 'Not given' },
      { label: 'Signed by', value: `The card's own contact key (${keyPrint(signer)}), never your Starcom key.` },
      ...(p.template.tags.some((t) => t[0] === 'agent') ? [{ label: 'AI agent', value: 'The card says it is an AI agent’s, as you said.' }] : []),
    ],
    raw: JSON.stringify({ kind: p.template.kind, tags: p.template.tags, content: p.template.content }, null, 2),
  };
}

/** Show, and on a yes publish, the person's card as drafted. The age step first; the contact key made after it. */
export async function reviewRlshCard(draft: RlshCardDraft, now: number = Date.now()): Promise<ReviewOutcome<{ relays: number }>> {
  const refused = draftRefusal(draft);
  if (refused) return { status: 'refused', reason: refused };
  // RF3: how old, before any key or card is made; under 13, nothing.
  const age = await ageBeforeSigning(true);
  if (!age.ok) return 'reason' in age ? { status: 'refused', reason: age.reason } : { status: 'cancelled' };
  const signer = ensureContactKey();
  const template = cardTemplate(draft);
  // From someone who said they are an AI agent, the card says so (MX14), by its own alias: never their Starcom name.
  if (publishesAsAgent()) template.tags.push(['agent', JSON.parse(template.content).callsign]);
  const relays = rlshCardRelays();
  const outcome = await requestReview<CardSend, { relays: number; eventId: string }>({
    act: myCard().published ? 'Update your RLSH card' : 'Publish your RLSH card',
    payload: { template, relays, finding: draft.finding },
    show: (p) => showCard(p, signer),
    destinations: destinationsFor(relays),
    digest: (p) => digestOf(p.template),
    digestLabel: 'the card, as it will be signed',
    notice: 'A public relay keeps what it is sent. Withdrawing the card later changes what you share from then on; it can\'t unshare what\'s already out.',
    signer,
    send: async (p) => {
      const sent = await sendRlshCard(p.template, p.relays, now);
      return { relays: sent.relays, eventId: sent.event.id };
    },
  });
  if (outcome.status === 'sent') recordPublished(now, outcome.result.relays, draft.finding, outcome.result.eventId);
  return outcome.status === 'sent' ? { status: 'sent', result: { relays: outcome.result.relays } } : outcome;
}

/** Show, and on a yes send, the deletion of the person's card; the contact key kept, or thrown away after it. */
export async function reviewRlshWithdrawal(options: { discardKey: boolean }, now: number = Date.now()): Promise<ReviewOutcome<{ relays: number }>> {
  const signer = contactPubkey();
  if (!signer) return { status: 'refused', reason: 'There is no card key on this device, so there is nothing here to withdraw.' };
  const template = deletionTemplate(signer);
  const relays = rlshCardRelays();
  const outcome = await requestReview<{ template: CardTemplate; relays: string[]; discardKey: boolean }, { relays: number }>({
    act: 'Withdraw your RLSH card',
    payload: { template, relays, discardKey: options.discardKey },
    show: (p) => ({
      title: 'Withdraw your RLSH card',
      body: WITHDRAW_WORDS,
      fields: [
        { label: 'Asks relays to drop', value: `The card signed by ${keyPrint(signer)} (${npubOf(signer)})` },
        { label: 'The key', value: p.discardKey ? 'Thrown away after this: it cannot sign the card again.' : 'Kept on this device, to publish the card again later.' },
      ],
      raw: JSON.stringify({ kind: p.template.kind, tags: p.template.tags, content: p.template.content }, null, 2),
    }),
    destinations: destinationsFor(relays),
    digest: (p) => digestOf(p.template),
    digestLabel: 'the request, as it will be signed',
    notice: 'Relays may not honour it, and nothing can take back a copy already taken.',
    signer,
    send: async (p) => {
      const sent = await sendRlshCard(p.template, p.relays, now);
      if (p.discardKey) discardContactKey();
      return { relays: sent.relays };
    },
  });
  if (outcome.status === 'sent') recordWithdrawn(now);
  return outcome;
}
