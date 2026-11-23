/**
 * Reading the roster (decision D-RS, RS4, RS19): every public 30084 Roster Item, by anyone, from the relays
 * Starcom and NavCom share and The Record, where Mecha Jono posts. No author is preferred here: whom a person
 * follows is theirs to choose (follows.ts), and the screen puts those first.
 *
 * The newest event at an address stands, as for any addressable event (NIP-01); a retraction there withdraws the
 * item until a newer edit. A kind this build does not know is counted, never shown half-read.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { agentTagged, markAgentKey } from '../identity/agentKeys';
import { createRelayPool } from '../nostr/relayPool';
import { readComplete } from '../nostr/readComplete';
import { burst } from '../nostr/burst';
import { rosterReadRelays } from '../nostr/publishTargets';
import { readRosterEvent, ROSTER_ITEM_KIND, ROSTER_TOPIC, type ReadRosterItem } from './rosterItem';

const addressOf = (event: Event): string | null => {
  const d = event.tags.find((t) => t[0] === 'd')?.[1];
  return d ? `${event.kind}:${event.pubkey}:${d}` : null;
};
/** Newer first; at the same second, the lower id, as relays keep replaceable events (NIP-01). */
const newer = (a: { created_at: number; id: string }, b: { created_at: number; id: string }) =>
  a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);

export class RosterStore {
  private latest = new Map<string, { created_at: number; id: string; item: ReadRosterItem | null }>();
  private unknown = new Map<string, number>();
  private refusedCount = 0;

  accept(event: Event): { kept: boolean } {
    const address = addressOf(event);
    if (!address) { this.refusedCount += 1; return { kept: false }; }
    const prior = this.latest.get(address);
    if (prior && !newer(event, prior)) return { kept: false };
    const read = readRosterEvent(event);
    if (read.ok) {
      // A key that says it is an AI agent's (MX14) is labelled wherever it is named.
      if (agentTagged(event)) markAgentKey(event.pubkey);
      this.latest.set(address, { created_at: event.created_at, id: event.id, item: read.item });
      return { kept: true };
    }
    if ('retracted' in read && read.retracted) {
      this.latest.set(address, { created_at: event.created_at, id: event.id, item: null });
      return { kept: prior?.item != null };
    }
    if ('unknownKind' in read && read.unknownKind !== undefined) {
      this.unknown.set(read.unknownKind, (this.unknown.get(read.unknownKind) ?? 0) + 1);
    } else {
      this.refusedCount += 1;
    }
    return { kept: false };
  }

  /** What stands, newest first. */
  items(): ReadRosterItem[] {
    return [...this.latest.values()].map((x) => x.item).filter((i): i is ReadRosterItem => i !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  unknownKinds(): Array<{ kind: string; count: number }> {
    return [...this.unknown].map(([kind, count]) => ({ kind, count }));
  }

  refused(): number {
    return this.refusedCount;
  }
}

export interface RosterReadStatus {
  loaded: boolean;
  error: string | null;
  at: number | null;
}

const store = new RosterStore();
const listeners = new Set<() => void>();
let reading: { close: () => void; users: number } | null = null;
// One list and one status, replaced when they change: a React store handing out a new array a read re-renders forever.
let snapshot: ReadRosterItem[] = [];
let status: RosterReadStatus = { loaded: false, error: null, at: null };
const notify = () => listeners.forEach((listener) => listener());

/** What a burst of notes changed, told once it is gathered (burst.ts): one rebuild and one render, not one a note. */
let changed = false;
const told = burst(() => {
  if (!changed) return;
  changed = false;
  snapshot = store.items();
  notify();
});

export function rosterItems(): ReadRosterItem[] {
  return snapshot;
}

export function rosterReadStatus(): RosterReadStatus {
  return status;
}

export function subscribeRoster(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Reads the roster until the returned function is called. However many ask, one read is open. */
export function startRosterRead(options: { pool?: Pick<SimplePool, 'subscribeMany'>; relays?: string[] } = {}): () => void {
  if (reading) {
    reading.users += 1;
  } else {
    status = { loaded: false, error: null, at: null };
    const pool = options.pool ?? createRelayPool();
    const filters: Filter[] = [{ kinds: [ROSTER_ITEM_KIND], '#t': [ROSTER_TOPIC] }];
    const read = readComplete(pool, options.relays ?? rosterReadRelays(), filters, {
      onevent: (event: Event) => {
        if (store.accept(event).kept) { changed = true; told.soon(); }
      },
      oncomplete: () => {
        status = { loaded: true, error: null, at: Date.now() };
        changed = true;
        told.now();
      },
      onfail: (reasons) => {
        status = { loaded: false, error: `The relays could not be read: ${reasons.map((r) => r.reason).filter(Boolean).join('; ') || 'no answer'}`, at: null };
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
