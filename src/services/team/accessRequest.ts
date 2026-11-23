/**
 * Asking to join a team's relay without an invite (plan item 2.3, step 5).
 *
 * NIP-43 lets a person join only with a claim, and no NIP says how someone
 * with none reaches an admin. So the request is text: signed by the person
 * asking, carrying the relay and a note (an intake reference), sent to an
 * admin however they already talk. The admin pastes it into Starcom's admin
 * panel, which checks the signature and allows the key (NIP-86). The
 * signature proves the key's owner asked, so a mistyped npub cannot be let in.
 *
 * Signed as kind TEAM_ACCESS_REQUEST, never published.
 */
import { nip19, verifyEvent, type Event } from 'nostr-tools';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { APP_KINDS } from '../nostr/kindRegistry';

const PREFIX = 'starcom-access-request';

export interface AccessRequest {
  relay: string;
  note: string;
  requester: string;
  npub: string;
  issuedAt: number;
}

const toBase64Url = (text: string) => btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (text: string) => decodeURIComponent(escape(atob(text.replace(/-/g, '+').replace(/_/g, '/'))));

export async function makeAccessRequest(input: { relay: string; note: string }): Promise<string> {
  await nostrIdentityService.ensureSigner('asking to join a team');
  const signed = await nostrIdentityService.asSigner().signEvent({
    kind: APP_KINDS.TEAM_ACCESS_REQUEST,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: JSON.stringify({ relay: input.relay.trim(), note: input.note.trim() }),
  });
  return `${PREFIX}:${toBase64Url(JSON.stringify(signed))}`;
}

export function readAccessRequest(text: string): { request: AccessRequest } | { refused: string } {
  const [prefix, body] = text.trim().split(':');
  if (prefix !== PREFIX || !body) return { refused: 'This is not an access request from Starcom.' };
  let event: Event;
  try { event = JSON.parse(fromBase64Url(body)); } catch { return { refused: 'This access request is damaged: it could not be read.' }; }
  if (event.kind !== APP_KINDS.TEAM_ACCESS_REQUEST || !verifyEvent(event)) {
    return { refused: "This access request's signature does not match what it says: something in it was changed. Ask for it again." };
  }
  let content: { relay?: string; note?: string };
  try { content = JSON.parse(event.content); } catch { return { refused: 'This access request is damaged: it could not be read.' }; }
  return {
    request: {
      relay: content.relay ?? '', note: content.note ?? '',
      requester: event.pubkey, npub: nip19.npubEncode(event.pubkey), issuedAt: event.created_at,
    },
  };
}
