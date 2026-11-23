/**
 * A team's chat, sealed to each member (plan item 2.7).
 *
 * A team is named by its relay's address: the one thing every member's
 * machine agrees on, since each keeps the team under an id of its own. Its
 * members are the relay's own signed list (NIP-43), read signed in; a roster
 * here never hears of someone who joined by invite on their own machine, so
 * it is used only when the relay answers that it publishes no list. When the
 * list cannot be read, the relay refusing or not answering, nothing is sent:
 * the roster may still name people who were removed (plan item 9.8). A
 * sender the relay refuses is told they may have been removed: a members-only
 * relay refuses a removed member outright. Not being on the list is no such
 * sign, since a relay's managers read it without being named. A message goes to every
 * member but the sender, over the team relay and the build's internal
 * relays, never the public chat relays. A team with no relay, or nobody else
 * on it, is told so: nothing goes in plain text.
 */
import { verifyEvent, type Event } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import { internalRelays } from '../nostr/publishTargets';
import { relayAddress } from '../nostr/joinedRelays';
import { PROTOCOL_KINDS } from '../nostr/kindRegistry';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { secureChatIntegration } from '../SecureChatIntegrationService';
import { rememberSentChat, sendSealedChat, type SealedSendResult } from './sealedChat';
import type { CyberTeam } from '../../types/cyberInvestigation';

const HEX_KEY = /^[0-9a-f]{64}$/;
const WAIT_MS = 8_000;

/** How a team is named in its messages: its relay's address, or nothing when it has no relay. */
export function teamChatKey(team: Pick<CyberTeam, 'relayUrl'>): string | null {
  return team.relayUrl ? relayAddress(team.relayUrl) : null;
}

/** What reading a relay's member list came to: the list or that it has none, a refusal, or no answer. */
type ListRead = { list: Event | null } | { refused: string } | { unanswered: string };

/** A refusal is the relay's own answer; anything else closing the read means it could not be reached. */
const REFUSAL = /^(restricted|auth-required|blocked):/;

/**
 * The relay's latest member list, signed by its own key. Unlike a query that
 * returns whatever arrived, this tells a relay that answered with no list from
 * one that refused, and from one that never answered.
 */
function readMemberList(relayUrl: string, relayPubkey: string): Promise<ListRead> {
  return new Promise((resolve) => {
    let latest: Event | null = null;
    let settled = false;
    // Held, not a const: a close can arrive before subscribeMany has returned.
    const read: { sub?: { close: (reason?: string) => void } } = {};
    const done = (answer: ListRead) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(answer);
      read.sub?.close();
    };
    const timer = setTimeout(() => done({ unanswered: 'its relay did not answer' }), WAIT_MS);
    read.sub = createRelayPool().subscribeMany([relayUrl], { kinds: [PROTOCOL_KINDS.NIP43_MEMBER_LIST], authors: [relayPubkey], limit: 1 }, {
      // nostr-tools calls a silent relay done after a few seconds, and the pool
      // hands a relay its maxWait as that limit: this read's own wait decides instead.
      maxWait: WAIT_MS * 2,
      onevent: (event) => {
        if (event.pubkey === relayPubkey && verifyEvent(event) && (!latest || event.created_at > latest.created_at)) latest = event;
      },
      // The pool counts a relay that closes the read as having sent everything,
      // and says so before it says why it closed, in the same tick: so the end
      // waits one turn, and a refusal in that tick is heard as one.
      oneose: () => { setTimeout(() => done({ list: latest }), 0); },
      onclose: (reasons) => {
        if (latest) return done({ list: latest });
        const said = reasons.map((r) => r.reason).filter(Boolean);
        const refusal = said.find((r) => REFUSAL.test(r));
        done(refusal ? { refused: refusal } : { unanswered: `its relay could not be reached${said.length ? `: ${said.join('; ')}` : ''}` });
      },
    });
  });
}

export type TeamMembers =
  | { members: string[]; source: 'relay' | 'roster' }
  /**
   * The relay's list could not be read: `refused` is the relay's own words. `locked` is this browser's key, locked
   * with a passphrase (D-KL): a team relay reads nothing to someone not signed in, and a locked key signs in nowhere
   * until it is opened, so the relay was never asked. Said as that, not as a relay that did not answer.
   */
  | { unreadable: 'refused' | 'unanswered' | 'locked'; reason: string };

/** Why a locked key reads nothing from a team's relay. */
export const LOCKED_TEAM_READ = 'your key is locked, so Starcom has not signed in to the team relay';

/** Who is on the team: the relay's signed list, the roster when the relay has none, or why it could not be read. */
export async function teamMembersFor(team: CyberTeam): Promise<TeamMembers> {
  if (team.relayUrl && team.relayPubkey) {
    if (nostrIdentityService.isLocked()) return { unreadable: 'locked', reason: LOCKED_TEAM_READ };
    const read = await readMemberList(team.relayUrl, team.relayPubkey);
    if ('refused' in read) return { unreadable: 'refused', reason: read.refused };
    if ('unanswered' in read) return { unreadable: 'unanswered', reason: read.unanswered };
    if (read.list) {
      return { members: [...new Set(read.list.tags.filter((t) => t[0] === 'member' && HEX_KEY.test(t[1] ?? '')).map((t) => t[1]))], source: 'relay' };
    }
  }
  const roster = team.members.map((m) => m.pubkey ?? '').filter((k) => HEX_KEY.test(k));
  return { members: [...new Set(roster)], source: 'roster' };
}

export async function sendTeamMessage(team: CyberTeam, text: string): Promise<SealedSendResult> {
  const key = teamChatKey(team);
  if (!key || !team.relayUrl) {
    throw new Error(`${team.name} has no relay, so its chat cannot be sealed. A team made with its relay can chat.`);
  }
  const me = await nostrIdentityService.ensureSigner('writing to your team');
  // Writing is the person's own act, so a locked key is opened here (D-KL): the member list is read from the team
  // relay, which needs a sign-in, and the message is sealed and signed. Cancelling fails the send, saying so.
  if (nostrIdentityService.isLocked()) await nostrIdentityService.unlockFor('writing to your team');
  secureChatIntegration.markChatUsed();
  const read = await teamMembersFor(team);
  if ('unreadable' in read) {
    throw new Error(read.unreadable === 'refused'
      ? `Not sent: ${team.name}'s relay would not show its member list (${read.reason}). You may have been removed from ${team.name}.`
      : read.unreadable === 'locked'
        ? `Not sent: ${read.reason}.`
        : `Not sent: ${team.name}'s member list could not be read (${read.reason}). The list kept here may still name people who were removed.`);
  }
  const recipients = read.members.filter((m) => m !== me);
  if (recipients.length === 0) throw new Error(`No one else is on ${team.name} yet, so there is nobody to seal it to.`);
  const sent = await sendSealedChat({
    recipients,
    text,
    team: key,
    encryptFor: (to, content) => secureChatIntegration.encryptFor(to, content),
    relays: [...new Set([team.relayUrl, ...internalRelays()])],
  });
  if (sent.reached.length > 0) {
    await rememberSentChat({ id: sent.id, senderId: me, recipients: sent.reached, content: text, timestamp: Date.now(), postQuantum: sent.postQuantum, decryptionFailed: false, team: key });
  }
  return sent;
}
