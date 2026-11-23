/**
 * The callsign a person publishes under (decision D-MX, MX7; Locked Decision
 * #7 as amended on 2026-10-06).
 *
 * A Mission Package names its signer as its author: the person publishes, and
 * Starcom is the client they publish through. The callsign is how they choose
 * to be named in public. It is chosen to be published, which is why it is kept
 * apart from the display name in names.ts: that one can be a real name, shows
 * only in this browser, and is never published.
 *
 * Without a callsign, the signer's key stands as author. A callsign is never
 * a key, so nobody can publish under a key by name, theirs or another's.
 */
import { nip19 } from 'nostr-tools';

const STORAGE_KEY = 'starcom.callsign.v1';
const AGENT_KEY = 'starcom.agent.v1';
const MAX_LENGTH = 40;
const HEX_KEY = /^[0-9a-f]{64}$/i;

const listeners = new Set<() => void>();
/** The callsign as last set, held here when this browser refuses to store it: it then lasts until reload. */
let held: { callsign: string | null } | null = null;
/** Likewise for the agent setting. */
let heldAgent: { agent: boolean } | null = null;

/** The callsign you publish under, or null. Kept in this browser. */
export function publishedCallsign(): string | null {
  if (held) return held.callsign;
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return stored && stored.trim() ? stored : null;
  } catch {
    return null;
  }
}

/** Sets the callsign you publish under; nothing but whitespace clears it. Refuses a key, a second line, or more than 40 characters. */
export function setPublishedCallsign(callsign: string): void {
  const trimmed = callsign.trim();
  if (trimmed && (HEX_KEY.test(trimmed) || /^npub1[0-9a-z]+$/i.test(trimmed))) {
    throw new Error('A callsign cannot be a key. Leave it empty to publish under your key.');
  }
  if (/[\r\n]/.test(trimmed)) throw new Error('A callsign is one line.');
  if (trimmed.length > MAX_LENGTH) throw new Error(`A callsign is at most ${MAX_LENGTH} characters.`);
  try {
    if (trimmed) globalThis.localStorage?.setItem(STORAGE_KEY, trimmed);
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
    held = null;
  } catch {
    // Storage refused (private mode, quota): the callsign lasts only until reload.
    held = { callsign: trimmed || null };
  }
  listeners.forEach((listener) => listener());
}

export function subscribeCallsign(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** What a package signed by this key names as its author: your callsign, or the key itself as an npub. */
export function authorFor(signerPubkey: string): string {
  return publishedCallsign() ?? nip19.npubEncode(signerPubkey);
}

/**
 * Whether the key publishing here is an agent's (D-MX, MX14): then what it
 * signs says so, in an `agent` tag naming its author. Disclosure only: it
 * limits nothing an agent may do, as nothing here limits a person. Kept in
 * this browser, as the callsign is.
 */
export function publishesAsAgent(): boolean {
  if (heldAgent) return heldAgent.agent;
  try {
    return globalThis.localStorage?.getItem(AGENT_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function setPublishesAsAgent(agent: boolean): void {
  try {
    if (agent) globalThis.localStorage?.setItem(AGENT_KEY, 'yes');
    else globalThis.localStorage?.removeItem(AGENT_KEY);
    heldAgent = null;
  } catch {
    heldAgent = { agent };
  }
  listeners.forEach((listener) => listener());
}

/** The name an agent's package carries in its `agent` tag, its author; none for a person's. */
export function agentFor(signerPubkey: string): string | undefined {
  return publishesAsAgent() ? authorFor(signerPubkey) : undefined;
}
