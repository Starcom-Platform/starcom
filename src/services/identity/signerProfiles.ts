/**
 * Who posted it, read from the posts (decision D-MF, MF4). The owner: "if it's posted by Mecha Jono, it should
 * say it's posted by Mecha Jono", and Starcom is not to be coded to say so for it. So a signer's name is the
 * one its own profile (kind 0) gives, and it is taken as known only when the domain that profile names lists
 * the key (NIP-05). Held for the session, never stored and never published (names.ts).
 */
import type { Event } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import { readNotesOnce } from '../nostr/readNotesOnce';
import { signerProfileRelays } from '../nostr/publishTargets';
import { nip05Answer, parseNip05 } from './nip05';
import { claimVerification, rememberVerifiedName } from './names';
import { markAgentKey } from './agentKeys';

export interface SignerProfile {
  name?: string;
  nip05?: string;
  /** The profile says it is a bot's (NIP-24): an AI agent, as it says itself. */
  bot?: true;
}

const PROFILE_WAIT_MS = 6000;
const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** The name and address a profile event states; nothing from content that is not a profile. */
export function profileFromEvent(event: Pick<Event, 'content'>): SignerProfile {
  try {
    const p = JSON.parse(event.content) as Record<string, unknown>;
    const name = text(p.name) ?? text(p.display_name);
    const nip05 = text(p.nip05);
    return { ...(name ? { name } : {}), ...(nip05 ? { nip05 } : {}), ...(p.bot === true ? { bot: true as const } : {}) };
  } catch {
    return {};
  }
}

/** The newest profile this key signed, from where its packages are read; null when none answers. */
async function readProfile(pubkey: string): Promise<SignerProfile | null> {
  // The pool is left to close itself, as the board's one-shot reads leave theirs: closing it the moment the
  // read resolved met the subscription still closing ("WebSocket is already in CLOSING or CLOSED state").
  const events = await readNotesOnce(createRelayPool(), signerProfileRelays(), { kinds: [0], authors: [pubkey], limit: 1 }, PROFILE_WAIT_MS);
  const newest = events.filter((e) => e.pubkey === pubkey).sort((a, b) => b.created_at - a.created_at)[0];
  return newest ? profileFromEvent(newest) : null;
}

export interface VerifyDeps {
  readProfile: (pubkey: string) => Promise<SignerProfile | null>;
  lists: (nip05: string, pubkey: string) => Promise<boolean>;
}

/** The relays each verified signer's domain lists for it, this session: where a report to it can go (MF11). */
const listedRelays = new Map<string, string[]>();

/** The relays a verified signer's domain lists for it; none for a signer not verified this session. */
export function signerRelays(pubkey: string): string[] {
  return listedRelays.get(pubkey) ?? [];
}

const LIVE: VerifyDeps = {
  readProfile,
  lists: async (nip05, pubkey) => {
    const answer = await nip05Answer(nip05, pubkey);
    if (answer.listed) listedRelays.set(pubkey, answer.relays);
    return answer.listed;
  },
};

/** The name a key gives itself and the domain that lists it, or null when no domain does. */
export async function verifiedSigner(pubkey: string, deps: VerifyDeps = LIVE): Promise<{ name: string; domain: string } | null> {
  const profile = await deps.readProfile(pubkey).catch(() => null);
  // An AI agent's, as its own profile says, whether or not a domain lists it.
  if (profile?.bot) markAgentKey(pubkey);
  const address = profile?.nip05 ? parseNip05(profile.nip05) : null;
  if (!profile?.nip05 || !address || !(await deps.lists(profile.nip05, pubkey).catch(() => false))) return null;
  return { name: profile.name ?? profile.nip05, domain: address.domain };
}

/** Verifies each signer once a session; a verified one is named, wherever a key is shown, until the page closes. */
export async function verifySigners(pubkeys: readonly string[], deps: VerifyDeps = LIVE): Promise<void> {
  const fresh = [...new Set(pubkeys)].filter((pubkey) => claimVerification(pubkey));
  await Promise.all(fresh.map(async (pubkey) => {
    const verified = await verifiedSigner(pubkey, deps);
    if (verified) rememberVerifiedName(pubkey, verified.name, verified.domain);
  }));
}
