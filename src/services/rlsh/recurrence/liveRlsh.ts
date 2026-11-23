/**
 * RLSH's live windows and Cases (decision D-RR, RR3), from The Record: signed by Mecha Jono's new key only, by their
 * families' own topics, kind 30023, the newest at each address; anything the kit's rules refuse is kept apart with its
 * reason, never drawn (kit section 6). Packages come with the received missions; totals through the totals read.
 * One read however many ask, as Psi Watch's live notes are read.
 */
import type { Event, Filter, SimplePool } from 'nostr-tools';
import { createRelayPool } from '../../nostr/relayPool';
import { readComplete } from '../../nostr/readComplete';
import { burst } from '../../nostr/burst';
import { psiWatchRelays } from '../../nostr/publishTargets';
import { addressOf, RLSH_SIGNER, rlshFamilyOf, rlshRefusalOf, type RlshNote, type RlshRefusal } from './recurrence';

const TOPICS = ['recurrence_window', 'recurrence_case'] as const;

let byAddress = new Map<string, RlshNote>();
let refusedNow: Array<{ address: string; reason: RlshRefusal }> = [];
let snapshot: RlshNote[] = [];
let changed = false;
const listeners = new Set<() => void>();
let reading: { close: () => void; users: number } | null = null;

const told = burst(() => {
  if (!changed) return;
  changed = false;
  snapshot = [...byAddress.values()];
  listeners.forEach((l) => l());
});

/** Takes one note: the newest at its address, if the kit's rules take it. */
export function acceptLiveRlsh(note: RlshNote): boolean {
  const family = rlshFamilyOf(note);
  if (family !== 'recurrence_window' && family !== 'recurrence_case') return false;
  const refused = rlshRefusalOf(note);
  const address = addressOf(note);
  if (refused) {
    refusedNow = [...refusedNow.filter((r) => r.address !== address), { address, reason: refused }];
    return false;
  }
  const had = byAddress.get(address);
  if (had && had.created_at >= note.created_at) return false;
  byAddress.set(address, note);
  changed = true;
  return true;
}

export const liveRlshNotes = (): RlshNote[] => snapshot;
export const liveRlshRefused = (): Array<{ address: string; reason: RlshRefusal }> => refusedNow;
export function subscribeLiveRlsh(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Reads until the returned function is called; however many ask, one read is open. */
export function startLiveRlsh(options: { pool?: Pick<SimplePool, 'subscribeMany'>; relays?: string[] } = {}): () => void {
  if (reading) {
    reading.users += 1;
  } else {
    const pool = options.pool ?? createRelayPool();
    const filters: Filter[] = TOPICS.map((topic) => ({ kinds: [30023], authors: [RLSH_SIGNER], '#t': [topic] }));
    const read = readComplete(pool, options.relays ?? psiWatchRelays(), filters, {
      onevent: (event: Event) => { if (acceptLiveRlsh(event as unknown as RlshNote)) told.soon(); },
      oncomplete: () => told.now(),
      onfail: () => {},
    });
    reading = { close: () => read.close(), users: 1 };
  }
  let stopped = false;
  return () => {
    if (stopped || !reading) return;
    stopped = true;
    reading.users -= 1;
    if (reading.users === 0) { reading.close(); reading = null; }
  };
}

export function resetLiveRlshForTests(): void {
  byAddress = new Map();
  refusedNow = [];
  snapshot = [];
  changed = false;
}
