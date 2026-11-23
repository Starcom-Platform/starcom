/**
 * A team invite, as a link (plan item 2.3, step 3).
 *
 * Flotilla's form, `/join?r=<relay>&c=<claim>`, so one link works in both
 * apps, plus what Starcom needs to join safely: the relay's own key (`k`), to
 * check the relay is the one invited to, and the team's name (`t`). Whoever
 * invites signs all four (`p`, `ts`, `sig`), so the person invited can see who
 * invited them and that nothing in the link was changed.
 *
 * The signature is over an event of kind TEAM_INVITE that is never
 * published. The code this replaces signed a kind 1 note, which anyone holding
 * the code could have published as a note from the inviter. And it resolved
 * only on the machine that made it: the team was looked up in local memory.
 * Joining is now the relay's decision, by the claim.
 */
import { getEventHash, verifyEvent, type Event } from 'nostr-tools';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { APP_KINDS } from '../nostr/kindRegistry';

export interface TeamInvite {
  relay: string;
  claim: string;
  relayPubkey: string;
  team: string;
  /** Who signed the invite. */
  inviter: string;
  /** When it was signed, in seconds since the epoch. */
  issuedAt: number;
}

const HEX_KEY = /^[0-9a-f]{64}$/;

const contentOf = (i: Pick<TeamInvite, 'relay' | 'claim' | 'relayPubkey' | 'team'>) =>
  JSON.stringify({ r: i.relay, c: i.claim, k: i.relayPubkey, t: i.team });

/** Signs an invite as the person inviting, and returns the link to send. */
export async function makeInviteLink(
  input: Pick<TeamInvite, 'relay' | 'claim' | 'relayPubkey' | 'team'>,
  origin: string = globalThis.location?.origin ?? 'https://starcom.app',
): Promise<string> {
  if (!HEX_KEY.test(input.relayPubkey)) throw new Error("The relay's own key is missing, so the invite could not say which relay it is for.");
  if (!input.claim.trim()) throw new Error('An invite needs a claim: the invite code the relay will accept.');
  const signed = await nostrIdentityService.asSigner().signEvent({
    kind: APP_KINDS.TEAM_INVITE,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: contentOf(input),
  });
  const params = new URLSearchParams({
    r: input.relay, c: input.claim, k: input.relayPubkey, t: input.team,
    p: signed.pubkey, ts: String(signed.created_at), sig: signed.sig,
  });
  return `${origin.replace(/\/+$/, '')}/join?${params.toString()}`;
}

/** Reads an invite link's parameters: the invite, or why it cannot be trusted. */
export function readInviteLink(params: URLSearchParams): { invite: TeamInvite } | { refused: string } {
  const get = (name: string) => params.get(name) ?? '';
  const invite = { relay: get('r'), claim: get('c'), relayPubkey: get('k'), team: get('t'), inviter: get('p'), issuedAt: Number(get('ts')) };
  if (!invite.relay || !invite.claim) return { refused: 'This link is not a team invite: it names no relay or no claim.' };
  if (!HEX_KEY.test(invite.relayPubkey) || !HEX_KEY.test(invite.inviter) || !Number.isFinite(invite.issuedAt) || !get('sig')) {
    return { refused: 'This invite is not signed, so nobody can say who sent it. Ask for a new one.' };
  }
  const event = {
    kind: APP_KINDS.TEAM_INVITE, created_at: invite.issuedAt, tags: [], content: contentOf(invite),
    pubkey: invite.inviter, sig: get('sig'),
  } as Omit<Event, 'id'> & { id?: string };
  event.id = getEventHash(event as Event);
  if (!verifyEvent(event as Event)) {
    return { refused: 'This invite\'s signature does not match what it says: something in the link was changed. Ask for a new one.' };
  }
  return { invite };
}
