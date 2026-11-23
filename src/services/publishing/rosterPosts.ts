/**
 * Posting a roster item where its author chose (decision D-RS, RS13–RS14), through the review every publish
 * passes: the item as it will be signed or sealed, who can read it, and the relays it goes over, before anything
 * is signed. Publicly, to the relays Starcom and NavCom share; sealed to each invitee by NIP-59, so only they can
 * open it; or to one team's own relay. On a yes it goes, and the draft keeps where it went (rosterDrafts.ts).
 */
import { sha256 } from '@noble/hashes/sha256';
import { publishedCallsign, publishesAsAgent } from '../identity/callsign';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { nip19 } from 'nostr-tools';
import { requestReview, type ReviewOutcome } from './publishReview';
import { destinationsFor } from './destinations';
import { stableStringify } from '../exchange/signing';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { rosterRelays } from '../nostr/publishTargets';
import { sealedRelaysFor } from '../team/sealedRelays';
import { sealRefusal } from '../nostr/giftWrap';
import { inboxRelays } from '../nostr/inboxRelays';
import { inboxListTemplate, ownInboxRelays } from '../nostr/inboxList';
import { sendOrKeep } from './keepUnsent';
import { inboxListTargets } from '../nostr/publishTargets';
import { getDraft, recordPost } from '../roster/rosterDrafts';
import { rosterTemplate, ROSTER_KIND_NAME, type RosterItem } from '../roster/rosterItem';
import { sendSealedRoster, sendSignedRoster } from '../roster/sendRoster';
import { storyProblems, storyProblemsText } from '../roster/storyCheck';

export type RosterVisibility =
  | { kind: 'public' }
  | { kind: 'sealed'; to: readonly string[] }
  | { kind: 'team'; relay: string; name: string };

type Template = ReturnType<typeof rosterTemplate>;
interface RosterSend {
  item: RosterItem;
  template: Template;
  visibility: RosterVisibility;
  relays: string[];
}

const HEX_KEY = /^[0-9a-f]{64}$/;
const npubOf = (pubkey: string): string => {
  try { return nip19.npubEncode(pubkey); } catch { return pubkey; }
};

const ACT: Record<RosterVisibility['kind'], string> = { public: 'Post publicly', sealed: 'Send to invitees', team: 'Post to the team' };

function whoCanRead(v: RosterVisibility): string {
  if (v.kind === 'public') return 'Anyone. A public relay keeps it, for good.';
  if (v.kind === 'team') return `${v.name}'s members, on the team's own relay.`;
  const more = v.to.length - 1;
  return `Only the ${v.to.length} ${v.to.length === 1 ? 'person' : 'people'} it is sealed to, by their keys: ${npubOf(v.to[0])}`
    + (more > 0 ? `, and ${more === 1 ? 'one more' : `${more} more`}.` : '.');
}

function show(p: Readonly<RosterSend>) {
  const { item } = p;
  const fields = [
    { label: 'Who can read it', value: whoCanRead(p.visibility) },
    { label: 'Kind', value: ROSTER_KIND_NAME[item.kind] },
    ...(item.purpose ? [{ label: 'Purpose', value: item.purpose }] : []),
    ...(item.firstStep ? [{ label: 'A first step', value: item.firstStep }] : []),
    ...(item.forWhom ? [{ label: 'Who it is for', value: item.forWhom }] : []),
    ...(item.limits.length ? [{ label: 'Limits', value: item.limits.join(' ') }] : []),
    ...(item.window ? [{ label: 'Window', value: `${item.window.from || 'open'} to ${item.window.until || 'open'}` }] : []),
    ...(item.places.length ? [{ label: 'Places', value: item.places.join(', ') }] : []),
    ...(item.toward.length ? [{ label: 'Toward', value: `${item.toward.length} ${item.toward.length === 1 ? 'item' : 'items'} it says it works toward` }] : []),
    ...(item.counts.length ? [{ label: 'Counts', value: `${item.counts.length} ${item.counts.length === 1 ? 'item' : 'items'} you count as part of it` }] : []),
    ...(item.grewInto?.length ? [{ label: 'Grew into', value: `${item.grewInto.length} ${item.grewInto.length === 1 ? 'item' : 'items'} you started from it` }] : []),
  ];
  return {
    title: `${ROSTER_KIND_NAME[item.kind]}: ${item.title}`,
    body: item.text,
    fields,
    raw: JSON.stringify({ kind: p.template.kind, tags: p.template.tags, content: p.template.content }, null, 2),
  };
}

/** Show, and on a yes post, the item kept on this device at `d`, as `visibility` says. */
export async function reviewRosterPost(d: string, visibility: RosterVisibility, now: number = Date.now()): Promise<ReviewOutcome<{ relays: number; to?: number }>> {
  const draft = getDraft(d);
  if (!draft) return { status: 'refused', reason: `There is no item "${d}" on this device.` };
  // A story never names or places people (RS11, RS51): refused before any review, saying which line.
  if (draft.kind === 'story') {
    const problems = storyProblems(draft);
    if (problems.length) return { status: 'refused', reason: storyProblemsText(problems) };
  }
  if (visibility.kind === 'sealed' && (visibility.to.length === 0 || !visibility.to.every((k) => HEX_KEY.test(k)))) {
    return { status: 'refused', reason: 'Name at least one person to seal it to, by their key.' };
  }
  const unsealable = visibility.kind === 'sealed' ? visibility.to.map(sealRefusal).find(Boolean) : null;
  if (unsealable) return { status: 'refused', reason: unsealable };
  if (visibility.kind === 'team' && !/^wss:\/\/[^\s/]+(\/[^\s]*)?$/.test(visibility.relay)) {
    return { status: 'refused', reason: "A team's relay is a wss:// address." };
  }
  const { updatedAt: _updatedAt, posts: _posts, ...item } = draft;
  const template = rosterTemplate(item);
  // From a key its holder marks as an agent's, it says so, as a package does (MX14; the legal review's AI label).
  if (publishesAsAgent()) template.tags.splice(template.tags.length - 1, 0, ['agent', publishedCallsign() ?? 'agent']);
  const relays = visibility.kind === 'public' ? rosterRelays()
    : visibility.kind === 'team' ? [visibility.relay]
      : sealedRelaysFor(visibility.to);
  /*
   * A return from an adventure is sealed to its caller and sent only to the inbox they name (RS41, MX28), so calling
   * one, from someone who names none yet, posts their inbox list beside it, shown here (as a mission does, MX32).
   */
  const me = nostrIdentityService.signerPubkey();
  const inbox = item.kind === 'adventure' && me && (await inboxRelays(me)).length === 0 ? ownInboxRelays() : [];
  const inboxTo = inbox.length ? inboxListTargets() : [];
  const outcome = await requestReview<RosterSend & { inbox: string[]; inboxTo: string[] }, { relays: number; to?: number }>({
    act: ACT[visibility.kind],
    payload: { item, template, visibility, relays, inbox, inboxTo },
    show: (p) => {
      const shown = show(p);
      return p.inbox.length
        ? { ...shown, fields: [...shown.fields, { label: 'Your inbox', value: `Also posts where you take sealed messages, so its returns can reach you: ${p.inbox.join(', ')}` }] }
        : shown;
    },
    destinations: destinationsFor([...new Set([...relays, ...inboxTo])]),
    sealed: visibility.kind === 'sealed',
    digest: (p) => bytesToHex(sha256(utf8ToBytes(stableStringify({ kind: p.template.kind, tags: p.template.tags, content: p.template.content })))),
    digestLabel: visibility.kind === 'sealed' ? 'the item, as it will be sealed' : 'the item, as it will be signed',
    signer: await nostrIdentityService.refreshSigner(),
    send: async (p) => {
      const result = await (p.visibility.kind === 'sealed'
        ? sendSealedRoster(p.template, p.visibility.to, [...p.relays], now)
        : sendSignedRoster(p.template, [...p.relays], now));
      // A failed list leaves the adventure posted: its view then says returns cannot reach the caller yet.
      // Kept when no relay takes it, to go when one does (W1b).
      if (p.inbox.length) await sendOrKeep(inboxListTemplate(p.inbox), p.inboxTo, Date.now()).catch(() => undefined);
      return result;
    },
  });
  if (outcome.status === 'sent') {
    recordPost(d, {
      visibility: visibility.kind, at: new Date(now).toISOString(), relays: outcome.result.relays,
      ...(outcome.result.to !== undefined ? { to: outcome.result.to } : {}),
    });
  }
  return outcome;
}
