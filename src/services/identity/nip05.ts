/**
 * A NIP-05 address checked against a key (decision D-MF, MF4). A key's profile may name an address,
 * `name@domain`; the domain's /.well-known/nostr.json, listing that name under the same key, is the domain
 * saying the key is the one it calls by that name. Starcom states nothing of its own here: the badge is the
 * domain's word. Redirects are refused, as NIP-05 asks, and a domain that does not answer in time does not
 * verify.
 */

export interface Nip05Address {
  /** The local part, `_` for a bare domain. */
  name: string;
  domain: string;
}

const NAME = /^[a-z0-9._-]+$/;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ANSWER_MS = 6000;

/** `name@domain` or a bare domain, in lower case; null for anything else. */
export function parseNip05(id: string): Nip05Address | null {
  const s = id.trim().toLowerCase();
  if (!s) return null;
  const at = s.lastIndexOf('@');
  const [name, domain] = at < 0 ? ['_', s] : [s.slice(0, at), s.slice(at + 1)];
  return NAME.test(name) && DOMAIN.test(domain) ? { name, domain } : null;
}

export type FetchJson = (url: string, init: { signal: AbortSignal }) => Promise<unknown>;

const fetchJson: FetchJson = async (url, { signal }) => {
  const res = await fetch(url, { signal, redirect: 'error', headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`answered ${res.status}`);
  return res.json();
};

/** Whether the domain of `id` lists `pubkey` under its name. */
export async function nip05Lists(id: string, pubkey: string, get: FetchJson = fetchJson, timeoutMs = ANSWER_MS): Promise<boolean> {
  return (await nip05Answer(id, pubkey, get, timeoutMs)).listed;
}

/**
 * Whether the domain lists the key, and the relays it names for that key (NIP-05's `relays`), where a sealed
 * message to the key can go (a mission report, D-MF MF11). No relays unless it lists the key.
 */
export async function nip05Answer(id: string, pubkey: string, get: FetchJson = fetchJson, timeoutMs = ANSWER_MS): Promise<{ listed: boolean; relays: string[] }> {
  const none = { listed: false, relays: [] as string[] };
  const address = parseNip05(id);
  if (!address) return none;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = await get(`https://${address.domain}/.well-known/nostr.json?name=${encodeURIComponent(address.name)}`, { signal: controller.signal });
    const answer = body as { names?: Record<string, unknown>; relays?: Record<string, unknown> } | null;
    const listed = answer?.names?.[address.name];
    if (typeof listed !== 'string' || listed.toLowerCase() !== pubkey.toLowerCase()) return none;
    const named = answer?.relays?.[listed] ?? answer?.relays?.[pubkey];
    return { listed: true, relays: Array.isArray(named) ? named.filter((r): r is string => typeof r === 'string') : [] };
  } catch {
    return none;
  } finally {
    clearTimeout(timer);
  }
}
