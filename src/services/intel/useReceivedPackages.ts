import { useCallback, useSyncExternalStore } from 'react';
import { MissionPackageIngest, type AcceptedPackage, type RefusedPackage, type IngestCounters } from './MissionPackageIngest';
import { onAccessChange } from '../nostr/accessChanges';

/**
 * Watch the network for Mission Packages other nodes publish.
 *
 * The ingest existed and nothing started it, which made "Starcom can read what
 * it publishes" true only in the test suite — the exact shape of defect this
 * codebase's orphan-export guard exists to catch, and which it did catch.
 *
 * Deliberately a read-only observation surface. A verified package from
 * another node is a true statement by that node, not a record in this
 * workspace; deciding what a foreign mission means locally is a trust question
 * that should be answered explicitly rather than by silently writing to
 * storage. So this reports what arrived and what was refused, and stops there.
 *
 * Refusals are surfaced alongside acceptances on purpose. A receiver that only
 * shows what it accepted cannot tell an empty network from one it is refusing
 * wholesale, and the second is far more interesting.
 *
 * One read, however many ask (D-MF, step 5a): the Missions app, the Market
 * Exchange's Grants and the globe's Missions mode share one ingest, started
 * while any of them is shown. Each started its own, so showing two read every
 * package twice. It stays open a minute after the last closes, so moving
 * between them does not read again, and what was received is kept.
 */
export interface ReceivedPackages {
  accepted: AcceptedPackage[];
  refused: RefusedPackage[];
  counters: IngestCounters;
  publishers: Array<{ pubkey: string; accepted: number; refused: number }>;
  /**
   * True once every package the relays hold is read and verified, each relay read to its end or failed: a card
   * is never made from half a read (D-MF, step 5e). Absent where nothing reads, as in a test's fixture.
   */
  loaded?: boolean;
}

/** A package's address: its signer and its `d`, which a newer version replaces at. Its id when it has no `d`. */
const addressOf = (p: AcceptedPackage): string => {
  const d = p.event.tags.find((t) => t[0] === 'd')?.[1];
  return d ? `${p.event.pubkey}:${d}` : p.event.id;
};

/** `next` in the list, newest first, replacing an older version at its address; an older one is dropped. */
function withPackage(list: readonly AcceptedPackage[], next: AcceptedPackage): AcceptedPackage[] {
  const at = addressOf(next);
  const held = list.find((p) => addressOf(p) === at);
  if (held && held.event.created_at >= next.event.created_at) return list as AcceptedPackage[];
  return [...list.filter((p) => p !== held), next].sort((a, b) => b.event.created_at - a.event.created_at);
}

const emptyCounters = (): IngestCounters => ({ seen: 0, accepted: 0, refused: 0, refusedBy: {} });
const nothing = (): ReceivedPackages => ({ accepted: [], refused: [], counters: emptyCounters(), publishers: [], loaded: false });
/** What a view not reading is given. */
const NOT_READING: ReceivedPackages = nothing();

/** How long the read stays open after the last view closes. */
const LINGER_MS = 60_000;

let current: ReceivedPackages = nothing();
const listeners = new Set<() => void>();
let ingest: MissionPackageIngest | null = null;
let offs: Array<() => void> = [];
let offAccess: (() => void) | null = null;
let lingering: ReturnType<typeof setTimeout> | null = null;

function emit(next: Partial<ReceivedPackages>): void {
  current = { ...current, ...next };
  for (const listener of listeners) listener();
}

function startReading(): void {
  if (lingering) { clearTimeout(lingering); lingering = null; }
  if (ingest) return;
  const reading = new MissionPackageIngest();
  ingest = reading;
  const sync = () => ({ counters: reading.stats(), publishers: reading.seenPublishers() });
  offs = [
    reading.onAccepted((p) => emit({ accepted: withPackage(current.accepted, p), ...sync() })),
    reading.onRefused((p) => emit({ refused: [p, ...current.refused].slice(0, 50), ...sync() })),
    reading.onSettled(() => { if (!current.loaded) emit({ loaded: true, ...sync() }); }),
  ];
  // A key made or a team relay joined: read again, since a relay that requires sign-in refused the read started
  // before (plan 0.3; the cohort audit of 2026-10-19). Watched once for the whole read, never again on a restart:
  // a listener added while the change is being told would be told it too, and restart again, without end.
  offAccess ??= onAccessChange(() => {
    if (!ingest) return;
    stopIngest();
    startReading();
  });
  // Read again from the start: what was received is kept, and is whole again once this read settles.
  if (current.loaded) emit({ loaded: false });
  // Every package the relays hold. This asked for the last 24 hours only, so a package not republished that
  // day was not shown: a first visit saw 16 of the 85 open on The Record (D-MF, step 1). A relay keeps one
  // version per address, so "the backlog" is the current set, and verifying 107 packages takes moments.
  reading.start();
}

function stopIngest(): void {
  for (const off of offs) off();
  offs = [];
  ingest?.stop();
  ingest = null;
}

function stopReading(): void {
  stopIngest();
  offAccess?.();
  offAccess = null;
}

/** Hear every change to what is received; the first listener starts the one read. */
function subscribeReceivedPackages(listener: () => void): () => void {
  listeners.add(listener);
  startReading();
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0 || lingering) return;
    lingering = setTimeout(() => {
      lingering = null;
      if (listeners.size === 0) stopReading();
    }, LINGER_MS);
  };
}

/** What is received now. */
const receivedPackagesNow = (): ReceivedPackages => current;

export function useReceivedPackages(enabled = true): ReceivedPackages {
  const subscribe = useCallback((listener: () => void) => (enabled ? subscribeReceivedPackages(listener) : () => {}), [enabled]);
  const received = useSyncExternalStore(subscribe, receivedPackagesNow, receivedPackagesNow);
  return enabled ? received : NOT_READING;
}
