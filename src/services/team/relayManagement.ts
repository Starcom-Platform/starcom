/**
 * Managing a team's relay from Starcom (plan item 2.3, step 5), by NIP-86:
 * JSON-RPC over HTTP to the relay's own address, each call signed with NIP-98
 * by the person managing, as their signer. The relay decides whether that key
 * may manage it; a refusal is said in words, not as a status code.
 *
 * Nothing is kept here: the relay holds its allowlist, bans and claims.
 */
import { getToken } from 'nostr-tools/nip98';
import type { EventTemplate, Event } from 'nostr-tools';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { readRelayInfo } from '../nostr/relayInfo';

const httpAddress = (relay: string) => relay.trim().replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');

export async function manageRelay<T = unknown>(relay: string, method: string, params: unknown[] = []): Promise<T> {
  const url = httpAddress(relay);
  const call = { method, params };
  const signer = nostrIdentityService.asSigner();
  // The same object is hashed into the signature and sent as the body.
  const authorization = await getToken(url, 'POST', (e: EventTemplate) => signer.signEvent(e as unknown as Record<string, unknown>) as Promise<Event>, true, call);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/nostr+json+rpc', Authorization: authorization },
      body: JSON.stringify(call),
    });
  } catch (e) {
    throw new Error(`${relay} could not be reached to manage it: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status === 401) throw new Error(`${relay} refused: your key may not manage it.`);
  if (!res.ok) throw new Error(`${relay} answered ${res.status} to ${method}.`);
  const answer = await res.json() as { result?: T; error?: string };
  if (answer.error) throw new Error(`${relay}: ${answer.error}`);
  return answer.result as T;
}

export const listMembers = (relay: string) => manageRelay<Array<{ pubkey: string; reason?: string }>>(relay, 'listallowedpubkeys');
export const allowMember = (relay: string, pubkey: string, reason?: string) => manageRelay<boolean>(relay, 'allowpubkey', reason ? [pubkey, reason] : [pubkey]);
export const removeMember = (relay: string, pubkey: string) => manageRelay<boolean>(relay, 'unallowpubkey', [pubkey]);
export const banMember = (relay: string, pubkey: string, reason?: string) => manageRelay<boolean>(relay, 'banpubkey', reason ? [pubkey, reason] : [pubkey]);
export const listClaims = (relay: string) => manageRelay<string[]>(relay, 'listclaims');
export const revokeClaim = (relay: string, claim: string) => manageRelay<boolean>(relay, 'deleteclaim', [claim]);

/** Creates a claim (an invite code) on the relay, for an invite link to carry. */
export async function createClaim(relay: string): Promise<string> {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  const claim = `starcom-${Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('')}`;
  await manageRelay<boolean>(relay, 'createclaim', [claim]);
  return claim;
}

const HEX_KEY = /^[0-9a-f]{64}$/;
const distinct = (keys: Array<string | undefined>) => [...new Set(keys.filter((k): k is string => Boolean(k && HEX_KEY.test(k))))];

/**
 * Who manages the relay, as the relay says now (decision R4): the keys a
 * cohort's end must keep. zooid names them in `listmethodassignees`: its
 * owner, its own key, and every key given methods. Otherwise the relay's
 * description names its owner (NIP-11 `pubkey`) and its own key (`self`).
 * Null when neither says, so the caller can say that too.
 */
export async function relayManagers(relay: string): Promise<string[] | null> {
  try {
    const methods = await manageRelay<string[]>(relay, 'supportedmethods');
    if (Array.isArray(methods) && methods.includes('listmethodassignees')) {
      const keys = distinct((await manageRelay<Array<{ pubkey: string }>>(relay, 'listmethodassignees') ?? []).map((a) => a.pubkey));
      if (keys.length) return keys;
    }
  } catch {
    // The relay's description may still say.
  }
  try {
    const info = await readRelayInfo(relay);
    const keys = distinct([info.operatorPubkey, info.relayPubkey]);
    return keys.length ? keys : null;
  } catch {
    return null;
  }
}

/**
 * A cohort's last day: every member removed and every claim revoked, but for
 * the keys named to keep (the admin doing it) and whoever manages the relay.
 * Those are read from the relay when it runs, not written down here: the
 * admins change (a key is rotated, one is added), and "keep only me" removed
 * the other admin.
 */
export async function revokeEveryone(relay: string, options: { keep: string[] }): Promise<{ removed: number; claimsRevoked: number; kept: string[] }> {
  const kept = [...new Set([...options.keep, ...((await relayManagers(relay)) ?? [])])];
  const members = (await listMembers(relay)).filter((m) => !kept.includes(m.pubkey));
  for (const m of members) await removeMember(relay, m.pubkey);
  const claims = await listClaims(relay);
  for (const c of claims) await revokeClaim(relay, c);
  return { removed: members.length, claimsRevoked: claims.length, kept };
}
