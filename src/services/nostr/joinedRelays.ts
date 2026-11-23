/**
 * The relays this person has joined (plan item 2.3, step 1), kept in this
 * browser.
 *
 * Joining a team's relay is what lets the app sign in there (NIP-42): a
 * sign-in tells a relay who is reading, so it goes only where the person
 * belongs. Each entry keeps the relay's own key (its NIP-11 `self`), which is
 * what signs its member list (NIP-43), and the team it serves.
 *
 * Joined is not a destination by itself. What a Limited distribution sends
 * goes to the build's internal relays, and to a joined team's relay only when
 * its author picked that team for it (LW1), so joining a second team cannot
 * carry the first team's work to it.
 */
export interface JoinedRelay {
  url: string;
  /** The relay's own key, from its NIP-11 document: what signs its member list. */
  relayPubkey: string;
  /** The team this relay serves, as the invite named it. */
  team: string;
  joinedAt: string;
}

const STORAGE_KEY = 'starcom.joinedRelays.v1';
const listeners = new Set<() => void>();

/** The same address, however it was written: case and trailing slashes aside. */
export const relayAddress = (url: string): string => url.trim().replace(/\/+$/, '').toLowerCase();

/** Loopback and private-network hosts, where a local test relay may speak plain ws://. */
const LOCAL_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)|\.local$|\.internal$/;

function read(): JoinedRelay[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r?.url === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: JoinedRelay[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage refused: the join lasts this session's reads only.
  }
  listeners.forEach((listener) => listener());
}

export function joinedRelays(): JoinedRelay[] {
  return read();
}

export function isJoinedRelay(url: string): boolean {
  const address = relayAddress(url);
  return read().some((r) => relayAddress(r.url) === address);
}

/**
 * Remembers a joined relay. A relay reached over the internet must be wss://:
 * a browser on this HTTPS site refuses anything else, and plain ws:// would
 * send the sign-in in the clear. Plain ws:// is accepted on this machine or
 * network only, where a test relay runs.
 */
export function joinRelay(entry: Omit<JoinedRelay, 'joinedAt'> & { joinedAt?: string }): JoinedRelay {
  let parsed: URL;
  try { parsed = new URL(entry.url.trim()); } catch { throw new Error(`"${entry.url}" is not a relay address. A relay address starts with wss://.`); }
  const local = LOCAL_HOST.test(parsed.hostname.toLowerCase());
  if (parsed.protocol !== 'wss:' && !(parsed.protocol === 'ws:' && local)) {
    throw new Error(`"${entry.url}" is not a secure relay address. A team's relay is reached with wss://.`);
  }
  const joined: JoinedRelay = { ...entry, url: entry.url.trim().replace(/\/+$/, ''), joinedAt: entry.joinedAt ?? new Date().toISOString() };
  write([...read().filter((r) => relayAddress(r.url) !== relayAddress(joined.url)), joined]);
  return joined;
}

export function leaveRelay(url: string): void {
  const address = relayAddress(url);
  write(read().filter((r) => relayAddress(r.url) !== address));
}

export function subscribeJoinedRelays(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
