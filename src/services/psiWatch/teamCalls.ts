/**
 * Teammates' calls (decision D-PW, PW44, PW76; step 9b): read from each joined team relay, `psi_call` notes only. A
 * reveal shows once it holds to its seal (`checkReveal`: one key, the call's two addresses, the hash, sealed before
 * its window), named by its team alone, never the person (PW76); a seal not yet revealed shows nothing (PW44). The
 * operative's own calls come from this device (`calls.ts`), so a note of one of those is left out here.
 *
 * One read for every view that asks, started by the first and stopped with the last; told in bursts (`nostr/burst.ts`)
 * and started again on a change of access, as a team relay refuses a read made before its sign-in (plan 0.3).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { verifyEvent, type Event as NostrEvent, type Filter, type SimplePool } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import { burst } from '../nostr/burst';
import { onAccessChange } from '../nostr/accessChanges';
import { isJoinedRelay, relayAddress } from '../nostr/joinedRelays';
import { realTimeTeamService } from '../RealTimeTeamService';
import { checkReveal, getCalls, PSI_CALL_FAMILY, PSI_CALL_KIND, type CallText } from './calls';

/** Notes asked of each relay: a team's calls stay well inside a relay's own limit (strfry sends at most 500). */
const READ_LIMIT = 500;

export interface TeamCall {
  /** The caller's key and the call's id: unique, never shown. */
  key: string;
  /** The call's id, its `d` tags' own. */
  id: string;
  /** The team whose relay it came from: the only name it carries (PW76). */
  team: string;
  text: CallText;
  sealedAt: number;
  revealedAt: number;
}

/** Rebuilt from its fields before verifying: a cached result survives a spread copy (see missionCapability.ts). */
const canonical = (e: NostrEvent): NostrEvent => ({
  id: e.id, pubkey: e.pubkey, created_at: e.created_at, kind: e.kind, tags: e.tags, content: e.content, sig: e.sig,
} as NostrEvent);
const tagOf = (e: NostrEvent, name: string) => e.tags.find((t) => t[0] === name)?.[1];

/** The joined team relays, each with its team's name. */
function teamRelays(): { relay: string; team: string }[] {
  const seen = new Map<string, string>();
  for (const team of realTimeTeamService.getTeams()) {
    if (!team.relayUrl || !isJoinedRelay(team.relayUrl)) continue;
    const relay = relayAddress(team.relayUrl);
    if (!seen.has(relay)) seen.set(relay, team.name);
  }
  return [...seen].map(([relay, team]) => ({ relay, team }));
}

let teamCalls: readonly TeamCall[] = [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getTeamCalls = (): readonly TeamCall[] => teamCalls;

/** The notes held, by relay: seals by their id, reveals by their caller's key and address. */
interface Held { team: string; seals: Map<string, NostrEvent>; reveals: Map<string, NostrEvent> }

/** Every reveal held that holds to its seal, oldest window first; none of the operative's own. */
export function pairCalls(held: Iterable<Held>, ownIds: ReadonlySet<string>): TeamCall[] {
  const calls = new Map<string, TeamCall>();
  for (const { team, seals, reveals } of held) {
    for (const reveal of reveals.values()) {
      const seal = seals.get(tagOf(reveal, 'e') ?? '');
      if (!seal) continue;
      const checked = checkReveal(seal, reveal);
      if (!('text' in checked)) continue;
      const id = (tagOf(seal, 'd') ?? '').slice('psi-call-'.length);
      const key = `${reveal.pubkey}:${id}`;
      if (ownIds.has(id) || calls.has(key)) continue;
      calls.set(key, { key, id, team, text: checked.text, sealedAt: seal.created_at * 1000, revealedAt: reveal.created_at * 1000 });
    }
  }
  return [...calls.values()].sort((a, b) => a.text.window.start - b.text.window.start || a.key.localeCompare(b.key));
}

class TeamCallsReader {
  private pool: SimplePool | null = null;
  private relays: string[] = [];
  private closers: Array<() => void> = [];
  private held = new Map<string, Held>();
  private seen = new Set<string>();
  private told = burst(() => this.tell());

  start(): void {
    this.stop();
    const relays = teamRelays();
    if (!relays.length) return;
    this.pool = createRelayPool();
    this.relays = relays.map((r) => r.relay);
    const filter: Filter & { '#t': string[] } = { kinds: [PSI_CALL_KIND], '#t': [PSI_CALL_FAMILY], limit: READ_LIMIT };
    for (const { relay, team } of relays) {
      this.held.set(relay, { team, seals: new Map(), reveals: new Map() });
      const sub = this.pool.subscribeMany([relay], filter, {
        onevent: (event: NostrEvent) => this.handle(event, relay),
        oneose: () => this.told.now(),
      });
      this.closers.push(() => sub.close?.());
    }
  }

  private handle(event: NostrEvent, relay: string): void {
    const held = this.held.get(relay);
    if (!held || !event?.id || this.seen.has(`${relay}|${event.id}`)) return;
    this.seen.add(`${relay}|${event.id}`);
    if (event.kind !== PSI_CALL_KIND || !verifyEvent(canonical(event))) return;
    const d = tagOf(event, 'd') ?? '';
    if (!d.startsWith('psi-call-')) return;
    if (d.endsWith('-reveal')) {
      // The newest reveal at an address, as a relay keeps it.
      const at = `${event.pubkey}:${d}`;
      const before = held.reveals.get(at);
      if (!before || before.created_at < event.created_at) held.reveals.set(at, event);
    } else {
      held.seals.set(event.id, event);
    }
    this.told.soon();
  }

  private tell(): void {
    teamCalls = pairCalls(this.held.values(), new Set(getCalls().map((c) => c.id)));
    listeners.forEach((listener) => listener());
  }

  stop(): void {
    this.closers.forEach((close) => { try { close(); } catch { /* already closed */ } });
    this.closers = [];
    if (this.pool) {
      try { this.pool.close(this.relays); } catch { /* already closed */ }
      this.pool = null;
    }
    this.held.clear();
    this.seen.clear();
    if (teamCalls.length) { teamCalls = []; listeners.forEach((listener) => listener()); }
  }
}

let reader: TeamCallsReader | null = null;
let readers = 0;
let stopAccess: (() => void) | null = null;

/** Start the read for one more view; returns the function that ends it for that view. */
export function readTeamCalls(): () => void {
  readers += 1;
  if (readers === 1) {
    reader = new TeamCallsReader();
    reader.start();
    stopAccess = onAccessChange(() => reader?.start());
  }
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    readers -= 1;
    if (readers === 0) {
      stopAccess?.();
      stopAccess = null;
      reader?.stop();
      reader = null;
    }
  };
}

/** Teammates' revealed calls, read while `active`. */
export function useTeamCalls(active: boolean): readonly TeamCall[] {
  useEffect(() => (active ? readTeamCalls() : undefined), [active]);
  return useSyncExternalStore(subscribe, getTeamCalls, getTeamCalls);
}
