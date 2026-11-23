/**
 * Joining a team's relay with an invite (plan item 2.3, step 4), by NIP-43:
 *
 *   checking     the relay's own description (NIP-11) must take access
 *                requests (43), and its own key must be the invite's;
 *   signing-in   NIP-42, as the person's signer: a sign-in says who is
 *                joining, which is the point here;
 *   requesting   a kind 28934 join request carrying the claim, protected
 *                (NIP-70) so only its signed-in author may post it;
 *   confirming   the relay's member list (kind 13534), signed by its own key,
 *                names the person.
 *
 * Only then is the relay kept as joined. Nothing is sent to a relay that
 * fails the check, and a refusal says what the relay said.
 *
 * NIP-43 as published says membership is read from the relay's list together
 * with "a kind 10010 event by the member", and defines no kind 10010. The
 * relay's signed list is what is read; a relay that publishes none leaves
 * the join accepted but unconfirmed, and says so.
 */
import { AbstractRelay } from 'nostr-tools/abstract-relay';
import { verifyEvent, type Event, type EventTemplate, type VerifiedEvent } from 'nostr-tools';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { readRelayInfo } from '../nostr/relayInfo';
import { checkRelayConformance, whyNotTrusted } from '../nostr/relayConformance';
import { joinRelay } from '../nostr/joinedRelays';
import { PROTOCOL_KINDS } from '../nostr/kindRegistry';
import type { TeamInvite } from './inviteLink';

export type JoinStep = 'checking' | 'signing-in' | 'requesting' | 'confirming';

export type JoinResult =
  | { joined: true; confirmed: boolean; relaySaid: string }
  | { joined: false; step: JoinStep; reason: string };

const WAIT_MS = 8_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits for the relay's challenge and signs in; false when the relay never asks. */
async function signIn(relay: AbstractRelay, sign: (evt: EventTemplate) => Promise<VerifiedEvent>): Promise<boolean> {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    try {
      await relay.auth(sign);
      return true;
    } catch (e) {
      if (!(e instanceof Error) || !/no challenge/.test(e.message)) throw e;
      await sleep(50);
    }
  }
  return false;
}

/**
 * The relay's latest member list, signed by its own key, or null when it
 * publishes none; or the relay's words when it will not show it. A
 * members-only relay, as zooid is, shows a non-member nothing, and the refusal
 * went unheard: the wait ran out and read as a relay with no list.
 */
function memberList(relay: AbstractRelay, relayPubkey: string): Promise<{ list: Event | null; refused?: string }> {
  return new Promise((resolve) => {
    let latest: Event | null = null;
    let settled = false;
    let closing = false;
    const done = (answer: { list: Event | null; refused?: string }) => { if (!settled) { settled = true; clearTimeout(timer); resolve(answer); } };
    /*
     * The subscription is closed before the read settles. nostr-tools sends
     * CLOSE a microtask later, and the caller closes the connection as soon as
     * this settles, so a CLOSE sent after settling landed on a closing socket:
     * a browser logged "WebSocket is already in CLOSING or CLOSED state" on
     * every join. Its own close is then no refusal.
     */
    const end = () => { closing = true; sub.close(); done({ list: latest }); };
    const timer = setTimeout(end, WAIT_MS);
    const sub = relay.subscribe([{ kinds: [PROTOCOL_KINDS.NIP43_MEMBER_LIST], authors: [relayPubkey], limit: 1 }], {
      onevent: (event) => {
        if (event.pubkey === relayPubkey && verifyEvent(event) && (!latest || event.created_at > latest.created_at)) latest = event;
      },
      oneose: end,
      onclose: (reason) => { if (!closing) done({ list: latest, refused: reason }); },
    });
  });
}

/** Why a relay is not trusted with a team, before anything of the person's is sent to it (plan item 2.3a). */
async function untrusted(url: string): Promise<string | null> {
  const why = whyNotTrusted(await checkRelayConformance(url));
  return why && `${why} Nothing of yours was sent.`;
}

export async function joinTeam(invite: TeamInvite, onStep?: (step: JoinStep) => void): Promise<JoinResult> {
  const fail = (step: JoinStep, reason: string): JoinResult => ({ joined: false, step, reason });

  onStep?.('checking');
  let info;
  try {
    info = await readRelayInfo(invite.relay);
  } catch (e) {
    return fail('checking', e instanceof Error ? e.message : String(e));
  }
  if (!info.accessRequests) {
    return fail('checking', `${invite.relay} takes no access requests (NIP-43), so an invite cannot join it. Send your npub to whoever runs it, and they can add your key.`);
  }
  if (info.relayPubkey !== invite.relayPubkey) {
    return fail('checking', "This relay's own key is not the one the invite names, so it may not be the relay you were invited to. Nothing was sent.");
  }
  const refused = await untrusted(invite.relay);
  if (refused) return fail('checking', refused);

  onStep?.('signing-in');
  const me = await nostrIdentityService.ensureSigner('joining a team');
  const signer = nostrIdentityService.asSigner();
  const sign = (evt: EventTemplate) => signer.signEvent(evt as unknown as Record<string, unknown>) as Promise<VerifiedEvent>;
  const relay = new AbstractRelay(invite.relay, { verifyEvent, websocketImplementation: globalThis.WebSocket });
  try {
    try {
      await relay.connect({ timeout: WAIT_MS });
      if (!(await signIn(relay, sign))) return fail('signing-in', `${invite.relay} did not ask you to sign in, so it cannot tell who is joining.`);
    } catch (e) {
      return fail('signing-in', e instanceof Error ? e.message : String(e));
    }

    onStep?.('requesting');
    let relaySaid: string;
    try {
      const request = await sign({
        kind: PROTOCOL_KINDS.NIP43_JOIN_REQUEST,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['-'], ['claim', invite.claim]],
        content: '',
      });
      relaySaid = await relay.publish(request);
    } catch (e) {
      return fail('requesting', e instanceof Error ? e.message : String(e));
    }

    onStep?.('confirming');
    const { list, refused: listRefused } = await memberList(relay, invite.relayPubkey);
    if (listRefused) {
      return fail('confirming', /^(restricted|blocked):/.test(listRefused)
        ? `${invite.relay} accepted the request, but does not count you as a member: it shows its member list only to members. Ask whoever runs it.`
        : `${invite.relay} accepted the request, but would not show its member list: ${listRefused}`);
    }
    if (list && !list.tags.some((t) => t[0] === 'member' && t[1] === me)) {
      return fail('confirming', `${invite.relay} accepted the request, but its member list does not name you. Ask whoever runs it.`);
    }
    joinRelay({ url: invite.relay, relayPubkey: invite.relayPubkey, team: invite.team });
    return { joined: true, confirmed: list !== null, relaySaid };
  } finally {
    relay.close();
  }
}

export type MembershipResult =
  | { joined: true; relayPubkey: string; team: string }
  | { joined: false; reason: string };

/**
 * Whether an access request was allowed (plan item 2.3, step 5): the relay's
 * member list, signed by its own key, names this person. Only then is the
 * relay kept as joined.
 *
 * No invite pins the relay's key here, so it is the key the relay states now
 * (NIP-11 `self`). A relay that states none, or publishes no list, cannot say
 * who is in, and the person is told so rather than kept or turned away.
 */
export async function checkMembership(relayUrl: string): Promise<MembershipResult> {
  const fail = (reason: string): MembershipResult => ({ joined: false, reason });

  let info;
  try {
    info = await readRelayInfo(relayUrl);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
  if (!info.relayPubkey) {
    return fail(`${relayUrl} states no key of its own, so it has no signed member list to read. Ask whoever runs it whether you are in.`);
  }
  const refused = await untrusted(relayUrl);
  if (refused) return fail(refused);

  const me = await nostrIdentityService.ensureSigner('checking whether you are in a team');
  const signer = nostrIdentityService.asSigner();
  const sign = (evt: EventTemplate) => signer.signEvent(evt as unknown as Record<string, unknown>) as Promise<VerifiedEvent>;
  const relay = new AbstractRelay(relayUrl, { verifyEvent, websocketImplementation: globalThis.WebSocket });
  try {
    try {
      await relay.connect({ timeout: WAIT_MS });
      if (!(await signIn(relay, sign))) return fail(`${relayUrl} did not ask you to sign in, so it cannot tell who is asking.`);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    const { list, refused: listRefused } = await memberList(relay, info.relayPubkey);
    if (listRefused && /^(restricted|blocked):/.test(listRefused)) {
      return fail(`${relayUrl} shows its members only to its members: your request has not been allowed yet.`);
    }
    if (listRefused) return fail(`${relayUrl} would not show its member list: ${listRefused}`);
    if (!list) return fail(`${relayUrl} publishes no member list, so whether you are in cannot be read from it. Ask whoever runs it.`);
    if (!list.tags.some((t) => t[0] === 'member' && t[1] === me)) {
      return fail(`${relayUrl}'s member list does not name you yet: your request has not been allowed.`);
    }
    const team = info.name ?? relayUrl;
    joinRelay({ url: relayUrl, relayPubkey: info.relayPubkey, team });
    return { joined: true, relayPubkey: info.relayPubkey, team };
  } finally {
    relay.close();
  }
}
