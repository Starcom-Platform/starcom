/**
 * Reading the RLSH list (D-RF, RF6): every card labelled `starcom:rlsh`, by anyone, from the relays Starcom and NavCom
 * share, and the deletions of cards there. A card is replaceable, one to a key, the newest standing (NIP-01); a
 * deletion of its address by the same key withdraws every version up to it (NIP-09), whether or not a relay honoured
 * it. A card NavCom's reader would refuse is not shown. Listed alphabetically by callsign, as NavCom's /who/ lists;
 * nobody counted, nothing placed on the globe.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { markAgentKey } from '../identity/agentKeys';
import { createRelayPool } from '../nostr/relayPool';
import { readComplete } from '../nostr/readComplete';
import { burst } from '../nostr/burst';
import { rlshCardRelays } from '../nostr/publishTargets';
import { KIND_CARD, KIND_DELETION, RLSH_LABEL, readCard, type ReadCard } from './rlshCard';

/** Newer first; at the same second, the lower id, as relays keep replaceable events (NIP-01). */
const newer = (a: { created_at: number; id: string }, b: { created_at: number; id: string }) =>
  a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);

export class RlshCardStore {
  private cards = new Map<string, { created_at: number; id: string; card: ReadCard | null }>();
  /** Each key's latest deletion of its card, unix seconds. */
  private deleted = new Map<string, number>();

  /** Whether what is listed may have changed. */
  accept(event: Event): boolean {
    if (event.kind === KIND_DELETION) {
      const address = `${KIND_CARD}:${event.pubkey}:`;
      if (!event.tags.some((t) => t[0] === 'a' && t[1] === address)) return false;
      if ((this.deleted.get(event.pubkey) ?? -1) >= event.created_at) return false;
      this.deleted.set(event.pubkey, event.created_at);
      return this.cards.has(event.pubkey);
    }
    if (event.kind !== KIND_CARD) return false;
    const prior = this.cards.get(event.pubkey);
    if (prior && !newer(event, prior)) return false;
    // The newest version stands even when it is refused or no longer labelled: an older one is not shown instead.
    const read = readCard(event);
    const card = read && read.labels.includes(RLSH_LABEL) ? read : null;
    if (card?.agent) markAgentKey(card.pubkey);
    this.cards.set(event.pubkey, { created_at: event.created_at, id: event.id, card });
    return true;
  }

  /** The cards standing, alphabetical by callsign. */
  list(): ReadCard[] {
    return [...this.cards.values()]
      .map((x) => x.card)
      .filter((c): c is ReadCard => c !== null && (this.deleted.get(c.pubkey) ?? -1) < c.at)
      .sort((a, b) => a.callsign.localeCompare(b.callsign, undefined, { sensitivity: 'base' }) || a.pubkey.localeCompare(b.pubkey));
  }
}

export interface RlshReadStatus {
  loaded: boolean;
  error: string | null;
}

let store = new RlshCardStore();
const listeners = new Set<() => void>();
let reading: { close: () => void; users: number } | null = null;
let snapshot: ReadCard[] = [];
let status: RlshReadStatus = { loaded: false, error: null };
let changed = false;
const told = burst(() => {
  if (!changed) return;
  changed = false;
  snapshot = store.list();
  listeners.forEach((l) => l());
});

export const rlshCards = (): ReadCard[] => snapshot;
export const rlshReadStatus = (): RlshReadStatus => status;

export function subscribeRlshCards(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const RLSH_FILTERS: Filter[] = [
  { kinds: [KIND_CARD], '#l': [RLSH_LABEL] },
  { kinds: [KIND_DELETION], '#k': [String(KIND_CARD)] },
];

/** Reads the list until the returned function is called. However many ask, one read is open. */
export function startRlshRead(options: { pool?: Pick<SimplePool, 'subscribeMany'>; relays?: string[] } = {}): () => void {
  if (reading) {
    reading.users += 1;
  } else {
    store = new RlshCardStore();
    status = { loaded: false, error: null };
    const read = readComplete(options.pool ?? createRelayPool(), options.relays ?? rlshCardRelays(), RLSH_FILTERS, {
      onevent: (event: Event) => {
        if (store.accept(event)) { changed = true; told.soon(); }
      },
      oncomplete: () => {
        status = { loaded: true, error: null };
        changed = true;
        told.now();
      },
      onfail: (reasons) => {
        status = { loaded: false, error: `The relays could not be read: ${reasons.map((r) => r.reason).filter(Boolean).join('; ') || 'no answer'}` };
        changed = true;
        told.now();
      },
    });
    reading = { close: () => read.close(), users: 1 };
  }
  let stopped = false;
  return () => {
    if (stopped || !reading) return;
    stopped = true;
    reading.users -= 1;
    if (reading.users === 0) {
      reading.close();
      reading = null;
    }
  };
}
