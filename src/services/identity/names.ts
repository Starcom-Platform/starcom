/**
 * Names for keys (plan item 2.1, story S2).
 *
 * "A new report says 'Author: anonymous'. Elsewhere a person is a 64-character
 * hex key. There is no screen to set a display name." A key is how the network
 * knows a person; a name is how a person reading this screen does.
 *
 * Two kinds of name, both kept in this browser only:
 * - your own, which you set, and which names every key that is yours: the
 *   signer's, and this browser's own key if that is different;
 * - one for each other key you know, learned from where people are already
 *   named: a team's roster, a collaborator added to a record, and (plan item
 *   2.4) who sent a bundle.
 *
 * And for this session only, never kept: the name a key gives itself in its own
 * profile, where the domain that profile names lists the key (NIP-05; decision
 * D-MF, MF4, signerProfiles.ts). A learned name comes before it.
 *
 * A name is never published. Not into a package (Locked Decision #7), not
 * into a finding, not onto a relay as a profile. Nothing that builds or signs
 * an event reads this module but a bundle, which goes only to the people its
 * sender chooses and carries their own name, never one learned for anyone
 * else (plan item 2.4). Tests hold both lines.
 */
import { nip19 } from 'nostr-tools';
import { nostrIdentityService } from './NostrIdentityService';

/** Where a name was learned. 'you' is your own name, for your own keys. */
export type NameSource = 'you' | 'team' | 'collaborator' | 'bundle' | 'nip05';

export interface KnownName {
  name: string;
  source: NameSource;
  /** For a name a key gives itself: the domain that lists the key (NIP-05). */
  domain?: string;
}

/** Where a name can be learned and kept: not your own, nor a self-given one held for the session. */
type LearnedSource = Exclude<NameSource, 'you' | 'nip05'>;

/**
 * How far each source is trusted to name someone. A team's roster outranks a
 * collaborator entry, which outranks the name a sender gave themselves in a
 * bundle: anyone can claim any name for their own key, so a claim must never
 * rename someone a team has named.
 */
const RANK: Record<LearnedSource, number> = { team: 2, collaborator: 1, bundle: 0 };

const STORAGE_KEY = 'starcom.names.v1';
const HEX_KEY = /^[0-9a-f]{64}$/;

interface Stored {
  own?: string;
  known: Record<string, { name: string; source: LearnedSource }>;
}

const listeners = new Set<() => void>();

/** Names keys give themselves, a domain listing each key: this session's only (MF4). */
const selfNamed = new Map<string, { name: string; domain: string }>();
/** Keys whose profile this session has asked after, so each is asked once. */
const asked = new Set<string>();

function read(): Stored {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<Stored> : {};
    return { own: typeof parsed.own === 'string' ? parsed.own : undefined, known: parsed.known ?? {} };
  } catch {
    return { known: {} };
  }
}

function write(stored: Stored): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage refused (private mode, quota): names then last only this session's
    // reads, which is a smaller loss than failing whatever was being done.
  }
  listeners.forEach((listener) => listener());
}

/** The name you gave yourself, or null. */
export function ownName(): string | null {
  return read().own ?? null;
}

/** Sets your own name; nothing but whitespace clears it. Kept in this browser only. */
export function setOwnName(name: string): void {
  const stored = read();
  const trimmed = name.trim();
  if (trimmed) stored.own = trimmed;
  else delete stored.own;
  write(stored);
}

/** Whether this key is one of yours: the signer's, or this browser's own. */
export function isOwnKey(pubkey: string): boolean {
  return pubkey === nostrIdentityService.signerPubkey() || pubkey === nostrIdentityService.getPubkey();
}

/** What to call the holder of this key, and where that came from; null when nobody has said. */
export function nameOf(pubkey: string | null | undefined): KnownName | null {
  if (!pubkey) return null;
  const stored = read();
  if (stored.own && isOwnKey(pubkey)) return { name: stored.own, source: 'you' };
  const known = stored.known[pubkey];
  if (known) return { name: known.name, source: known.source };
  const own = selfNamed.get(pubkey);
  return own ? { name: own.name, source: 'nip05', domain: own.domain } : null;
}

/**
 * A key in words, where a component cannot be drawn (a hover): its learned
 * name, "you" for your own, or its short npub. What KeyName shows.
 */
export function keyLabel(pubkey: string): string {
  const known = nameOf(pubkey);
  if (known) return known.source === 'you' ? `${known.name} (you)` : known.name;
  if (!HEX_KEY.test(pubkey)) return pubkey;
  if (isOwnKey(pubkey)) return 'you';
  try {
    const npub = nip19.npubEncode(pubkey);
    return `${npub.slice(0, 14)}…${npub.slice(-6)}`;
  } catch {
    return pubkey;
  }
}

/**
 * The keys a name is known for: your own keys for your own name, and every key
 * that was learned under it (BD25). Compared without case or outer spaces. A
 * received package claiming a name known for another key is an impersonation.
 */
export function keysNamed(name: string): string[] {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return [];
  const stored = read();
  const own = stored.own?.trim().toLowerCase() === wanted
    ? [nostrIdentityService.signerPubkey(), nostrIdentityService.getPubkey()].filter((k): k is string => !!k)
    : [];
  const learned = Object.entries(stored.known).filter(([, v]) => v.name.trim().toLowerCase() === wanted).map(([key]) => key);
  const verified = [...selfNamed].filter(([, v]) => v.name.trim().toLowerCase() === wanted).map(([key]) => key);
  return [...new Set([...own, ...learned, ...verified])];
}

/**
 * Remembers what someone is called, from where they are already named. A
 * weaker source never renames someone a stronger one has named.
 */
export function learnName(pubkey: string, name: string, source: LearnedSource): void {
  const trimmed = name.trim();
  if (!trimmed || !HEX_KEY.test(pubkey)) return;
  const stored = read();
  const current = stored.known[pubkey];
  if (current && (RANK[current.source] > RANK[source] || current.name === trimmed)) return;
  stored.known[pubkey] = { name: trimmed, source };
  write(stored);
}

/** Holds, for this session, the name a key gives itself where a domain lists the key (signerProfiles.ts). */
export function rememberVerifiedName(pubkey: string, name: string, domain: string): void {
  const trimmed = name.trim();
  if (!trimmed || !HEX_KEY.test(pubkey)) return;
  selfNamed.set(pubkey, { name: trimmed, domain });
  listeners.forEach((listener) => listener());
}

/** True the first time this session a key's profile is to be asked after, false after. */
export function claimVerification(pubkey: string): boolean {
  if (asked.has(pubkey)) return false;
  asked.add(pubkey);
  return true;
}

export function subscribeNames(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Forgets every name, your own included. */
export function forgetNames(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing kept, so nothing to forget.
  }
  selfNamed.clear();
  asked.clear();
  listeners.forEach((listener) => listener());
}
