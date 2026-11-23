/**
 * Where this person takes sealed messages, as a list others read (NIP-17 kind 10050; the owner's MX32, 2026-10-23).
 * A report on a mission is sealed to its publisher and sent only to the relays that publisher's list names (MX28),
 * so a publisher who posted none could be sent nothing. The list names the public relays this browser's sealed inbox
 * reads, never a team's relay, which a stranger could not post to. Posted through the publish review, with the
 * mission that asks for counts.
 */
import { chatProviderRelays } from './publishTargets';
import { INBOX_LIST_KIND } from './inboxRelays';

const WSS = /^wss:\/\/[^\s/]+(\/[^\s]*)?$/;

/** The public relays this browser's sealed inbox reads, each once. */
export function ownInboxRelays(): string[] {
  return [...new Set(chatProviderRelays().filter((r) => WSS.test(r)))];
}

/** The unsigned list: a `relay` tag for each, in order. */
export function inboxListTemplate(relays: readonly string[] = ownInboxRelays()): { kind: number; tags: string[][]; content: string } {
  return { kind: INBOX_LIST_KIND, tags: relays.map((r) => ['relay', r]), content: '' };
}
