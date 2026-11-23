/**
 * The key an RLSH card is signed by (D-RF, RF1): a contact key of its own, made for the card and kept on this device,
 * never the person's own Starcom key, so the card says nothing about anything else they sign (NavCom's §10911: a
 * card is safe to publish only because its key receives nothing else). Made only after the age step (RF3), by the
 * card's publish. Kept when a card is withdrawn, unless the person throws it away; a key thrown away cannot sign the
 * card again, and nobody can take back what was already published under it.
 */
import { finalizeEvent, generateSecretKey, getPublicKey, type Event } from 'nostr-tools';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

const KEY = 'starcom:rlsh-contact-key';
const HEX_SECRET = /^[0-9a-f]{64}$/;
const listeners = new Set<() => void>();

function load(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw && HEX_SECRET.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

let secret: string | null = typeof localStorage !== 'undefined' ? load() : null;
let pubkey: string | null = secret ? getPublicKey(hexToBytes(secret)) : null;

const tell = () => listeners.forEach((l) => l());

/** The contact key's public half, or null when there is none on this device. */
export const contactPubkey = (): string | null => pubkey;

/** The contact key, made now when there is none. Called only once the age step is passed. */
export function ensureContactKey(): string {
  if (pubkey) return pubkey;
  const made = generateSecretKey();
  secret = bytesToHex(made);
  pubkey = getPublicKey(made);
  try { localStorage.setItem(KEY, secret); } catch { /* kept for this visit */ }
  tell();
  return pubkey;
}

/** Signs a reviewed card or its deletion with the contact key. */
export function signWithContactKey(template: { kind: number; tags: string[][]; content: string }, now: number = Date.now()): Event {
  if (!secret) throw new Error('There is no contact key on this device.');
  return finalizeEvent({ ...template, created_at: Math.floor(now / 1000) }, hexToBytes(secret));
}

/** Throws the contact key away: it cannot sign this card again. */
export function discardContactKey(): void {
  secret = null;
  pubkey = null;
  try { localStorage.removeItem(KEY); } catch { /* gone for this visit */ }
  tell();
}

export function subscribeContactKey(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test seam: read the device again. */
export function reloadContactKey(): void {
  secret = load();
  pubkey = secret ? getPublicKey(hexToBytes(secret)) : null;
  tell();
}
