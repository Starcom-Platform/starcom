/**
 * Where a key takes sealed messages: its NIP-17 inbox list, kind 10050 (decision D-MX, MX28, after NavCom's mission
 * interchange rev 6, §5.0–§5.2). A sealed report or return goes there and nowhere else: never to The Record, a relay
 * built for permanence, and never to a public relay the recipient did not name. A recipient that names no inbox is
 * sent nothing, rather than sent it somewhere it did not ask.
 *
 * Read from the relays a publisher's packages and profile are read from, newest list first, held for the session.
 */
import type { Event, Filter } from 'nostr-tools';
import { createRelayPool } from './relayPool';
import { readNotesOnce } from './readNotesOnce';
import { signerProfileRelays } from './publishTargets';

export const INBOX_LIST_KIND = 10050;
const WAIT_MS = 6000;
const WSS = /^wss:\/\/[^\s/]+(\/[^\s]*)?$/;

/** The relays the newest inbox list this key signed names, each once; none when it signed none. */
export function inboxRelaysFrom(events: ReadonlyArray<Pick<Event, 'kind' | 'pubkey' | 'created_at' | 'tags'>>, pubkey: string): string[] {
  const newest = events
    .filter((e) => e.kind === INBOX_LIST_KIND && e.pubkey === pubkey)
    .sort((a, b) => b.created_at - a.created_at)[0];
  if (!newest) return [];
  return [...new Set(newest.tags.filter((t) => t[0] === 'relay' && typeof t[1] === 'string' && WSS.test(t[1])).map((t) => t[1]))];
}

export type ReadOnce = (relays: string[], filter: Filter, waitMs: number) => Promise<Event[]>;

const readLive: ReadOnce = (relays, filter, waitMs) => readNotesOnce(createRelayPool(), relays, filter, waitMs);
const known = new Map<string, string[]>();

/** The inbox relays a key names; an empty list when it names none, or none answered in time (asked again next time). */
export async function inboxRelays(pubkey: string, read: ReadOnce = readLive): Promise<string[]> {
  const held = known.get(pubkey);
  if (held) return held;
  const events = await read(signerProfileRelays(), { kinds: [INBOX_LIST_KIND], authors: [pubkey], limit: 1 }, WAIT_MS).catch(() => []);
  const relays = inboxRelaysFrom(events, pubkey);
  if (relays.length > 0) known.set(pubkey, relays);
  return relays;
}

/** Test-only: forget the lists read this session. */
export function resetInboxRelaysForTests(): void {
  known.clear();
}
