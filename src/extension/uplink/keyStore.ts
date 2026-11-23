/**
 * Uplink's key store (decision D-EX, E3, EX39–EX40): the person's Nostr key, held by Uplink so Starcom's
 * page never holds it, sealed under their passphrase with NIP-49 (scrypt, then XChaCha20-Poly1305).
 *
 * Sealed, it lives in Uplink's storage. Opened, it is kept in the browser's session storage, which the
 * browser clears when it closes and which outlives Uplink's background going to sleep: so the person types
 * their passphrase once per browser session (EX40). Only Uplink's own pages and background can read either.
 *
 * Pure but for nostr-tools, so the app's tests import it as it is.
 */
import { decrypt as openNcryptsec, encrypt as sealNcryptsec } from 'nostr-tools/nip49';
import { decode } from 'nostr-tools/nip19';
import { getPublicKey } from 'nostr-tools/pure';
import { uplinkEn } from '../../i18n/uplink/en';

/** Where Uplink keeps the sealed key, in its storage. */
export const STORED_KEY = 'signer-key';
/** Where the opened key waits, in the browser's session storage. */
export const UNLOCKED_KEY = 'signer-unlocked';
/** scrypt's cost, as a power of two: NIP-49's suggested 16 (64 MiB, about a second). */
export const SEAL_COST = 16;
/**
 * NIP-49's key security byte: 0x00 says the key was handled insecurely before it was sealed. A key moved
 * from Starcom's page sat there in the page's storage, readable by the page, so that is what it says.
 */
const MOVED_FROM_A_PAGE = 0x00;

export interface StoredKey {
  ncryptsec: string;
  pubkey: string;
  /** UTC, ISO 8601 ending Z. */
  savedAt: string;
}

/** Why a passphrase will not do, or null when it will. */
export function passphraseProblem(passphrase: unknown): string | null {
  if (typeof passphrase !== 'string') return 'A passphrase is words.';
  if (passphrase.normalize('NFKC').length < 10) return 'A passphrase needs at least 10 characters.';
  return null;
}

/** A secret key from its nsec, or its 64 hex digits. */
export function secretFromNsec(text: string): Uint8Array {
  const said = text.trim();
  if (/^[0-9a-f]{64}$/i.test(said)) return Uint8Array.from(said.match(/../g)!.map((b) => parseInt(b, 16)));
  try {
    const decoded = decode(said);
    if (decoded.type === 'nsec') return decoded.data;
  } catch { /* not bech32 */ }
  throw new Error('That is not a Nostr secret key.');
}

/** The key sealed under the passphrase, with its pubkey named beside it. */
export function sealKey(secret: Uint8Array, passphrase: string, now: Date, cost = SEAL_COST): StoredKey {
  return { ncryptsec: sealNcryptsec(secret, passphrase, cost, MOVED_FROM_A_PAGE), pubkey: getPublicKey(secret), savedAt: now.toISOString() };
}

/** The key, opened by its passphrase; refused when the passphrase is wrong or the key is not the one named. */
export function openKey(stored: StoredKey, passphrase: string): Uint8Array {
  let secret: Uint8Array;
  try { secret = openNcryptsec(stored.ncryptsec, passphrase); } catch { throw new Error(uplinkEn.key.wrongPassphrase); }
  if (getPublicKey(secret) !== stored.pubkey) throw new Error(uplinkEn.key.notThisKey);
  return secret;
}
