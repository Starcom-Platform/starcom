/**
 * Whom a person follows (decision D-RS, RS4, RS22): authority is each person's own choice. Kept on this device
 * and never posted; following someone puts what they publish first, and marks it. No key is followed by default,
 * Mecha Jono's included: nothing is marked until the person chooses.
 */
const KEY = 'starcom.follows.v1';
const HEX_KEY = /^[0-9a-f]{64}$/;

export interface Followed {
  pubkey: string;
  since: string;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let list: Followed[] = load();
// One sorted list, replaced when it changes, for a React store.
let snapshot: Followed[] = newestFirst(list);

function newestFirst(of: Followed[]): Followed[] {
  return [...of].sort((a, b) => b.since.localeCompare(a.since));
}

function load(): Followed[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((f): f is Followed => typeof f === 'object' && f !== null
      && HEX_KEY.test((f as Followed).pubkey) && typeof (f as Followed).since === 'string');
  } catch {
    return [];
  }
}

function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* kept for this visit */ }
  snapshot = newestFirst(list);
  for (const listener of listeners) listener();
}

/** Newest first. The same list until it changes. */
export function followed(): Followed[] {
  return snapshot;
}

export function isFollowed(pubkey: string): boolean {
  return list.some((f) => f.pubkey === pubkey);
}

/** Follow a key; false when it is not one. */
export function follow(pubkey: string, now: number = Date.now()): boolean {
  if (!HEX_KEY.test(pubkey)) return false;
  if (isFollowed(pubkey)) return true;
  list = [...list, { pubkey, since: new Date(now).toISOString() }];
  persist();
  return true;
}

export function unfollow(pubkey: string): void {
  if (!isFollowed(pubkey)) return;
  list = list.filter((f) => f.pubkey !== pubkey);
  persist();
}

export function subscribeFollows(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/* ── Causes followed (RS1, RS53) ────────────────────────────────────────── */

/*
 * Following a cause is kept on this device as following a publisher is, and never posted: anything posted to a relay
 * can be listed by whoever reads it, so no list of a cause's followers exists anywhere. A cause shows instead how
 * much work cites it, and from how many publishers.
 */
const CAUSES_KEY = 'starcom.follows.causes.v1';
const ROSTER_ADDRESS = /^30084:[0-9a-f]{64}:\S{1,200}$/;

function loadCauses(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CAUSES_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((a): a is string => typeof a === 'string' && ROSTER_ADDRESS.test(a)) : [];
  } catch {
    return [];
  }
}

let causes: string[] = loadCauses();

function persistCauses(): void {
  try { localStorage.setItem(CAUSES_KEY, JSON.stringify(causes)); } catch { /* kept for this visit */ }
  for (const listener of listeners) listener();
}

/** The causes followed here, by address. The same list until it changes. */
export function followedCauses(): string[] {
  return causes;
}

export function followsCause(address: string): boolean {
  return causes.includes(address);
}

export function followCause(address: string): boolean {
  if (!ROSTER_ADDRESS.test(address)) return false;
  if (!followsCause(address)) { causes = [...causes, address]; persistCauses(); }
  return true;
}

export function unfollowCause(address: string): void {
  if (!followsCause(address)) return;
  causes = causes.filter((a) => a !== address);
  persistCauses();
}
