/**
 * The passphrase lock on this browser's own key (decision D-KL, KL1–KL6, in
 * docs/missions/01-architecture-decisions/key-lock.md).
 *
 * A key this browser holds sits in localStorage. Unlocked, it is there in plain text: anyone who copies the browser
 * profile, reads its backup, or sits at the computer can sign as the person. Locked, it is kept as a NIP-49
 * `ncryptsec` (scrypt, then XChaCha20-Poly1305), with its pubkey beside it, and opened by the passphrase once per
 * visit, in memory only. Starcom Uplink seals its key the same way (src/extension/uplink/keyStore.ts).
 *
 * What it does not do: a script running on the page while the key is unlocked can still use it. Only a key that
 * never enters the page (Uplink, a NIP-07 extension) stops that.
 *
 * This module holds the stored form, the asking and the telling. nostrService decides when.
 */
import { decrypt as openNcryptsec, encrypt as sealNcryptsec } from 'nostr-tools/nip49';
import { getPublicKey } from 'nostr-tools/pure';

/** Where the locked key is kept. The plain key's entry (`nostr_secret_key`) is gone while this one is there. */
export const LOCKED_KEY_STORAGE = 'nostr_locked_key';
/** scrypt's cost, as a power of two: NIP-49's suggested 16 (64 MiB, about a second), as Uplink uses. */
export const LOCK_COST = 16;
/** The shortest passphrase taken, as Uplink takes. */
export const PASSPHRASE_MIN = 10;
/**
 * NIP-49's key security byte. 0x00 says the key was handled insecurely before it was sealed, and it was: every key
 * locked here sat in this page's storage in plain text first.
 */
const HANDLED_IN_PLAIN = 0x00;

export interface LockedKey {
  ncryptsec: string;
  pubkey: string;
  /** UTC, ISO 8601. */
  lockedAt: string;
}

/** Said where something needs the key while it is locked and nothing asked for the passphrase. */
export const KEY_LOCKED = 'Your key is locked. Unlock it with your passphrase, then try again.';
/** Said when the person closed the passphrase prompt. */
export const STILL_LOCKED = 'Nothing was done: your key is still locked.';
export const WRONG_PASSPHRASE = 'That passphrase is wrong.';
/** Said where nothing on screen can ask for the passphrase: a test, a script. */
export const NOBODY_TO_ASK = 'Your key is locked, and nothing here can ask for its passphrase.';

/** Thrown where the key is needed and is locked. */
export class KeyLockedError extends Error {
  constructor(message: string = KEY_LOCKED) { super(message); this.name = 'KeyLockedError'; }
}

export class WrongPassphraseError extends Error {
  constructor() { super(WRONG_PASSPHRASE); this.name = 'WrongPassphraseError'; }
}

/** Why a passphrase will not do, or null when it will. */
export function passphraseProblem(passphrase: unknown): string | null {
  if (typeof passphrase !== 'string') return 'A passphrase is words.';
  if (passphrase.normalize('NFKC').length < PASSPHRASE_MIN) return `A passphrase needs at least ${PASSPHRASE_MIN} characters.`;
  return null;
}

/** The key sealed under the passphrase, its pubkey named beside it. */
export function sealWithPassphrase(secret: Uint8Array, passphrase: string, cost: number = LOCK_COST, now: Date = new Date()): LockedKey {
  return {
    ncryptsec: sealNcryptsec(secret, passphrase, cost, HANDLED_IN_PLAIN),
    pubkey: getPublicKey(secret),
    lockedAt: now.toISOString(),
  };
}

/** The key, opened by its passphrase. Refused when the passphrase is wrong, or the key is not the one named. */
export function openWithPassphrase(locked: LockedKey, passphrase: string): Uint8Array {
  let secret: Uint8Array;
  try {
    secret = openNcryptsec(locked.ncryptsec, passphrase);
  } catch {
    throw new WrongPassphraseError();
  }
  if (getPublicKey(secret) !== locked.pubkey) throw new Error('The locked key is not the key it names, so it was not used.');
  return secret;
}

/* ── Stored ─────────────────────────────────────────────────────────────── */

/** The locked key kept here, or null. A stored value that is not one is not one, and is left as it is. */
export function readLockedKey(): LockedKey | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCKED_KEY_STORAGE) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LockedKey>;
    return typeof parsed?.ncryptsec === 'string' && parsed.ncryptsec.startsWith('ncryptsec1')
      && typeof parsed.pubkey === 'string' && /^[0-9a-f]{64}$/.test(parsed.pubkey)
      ? { ncryptsec: parsed.ncryptsec, pubkey: parsed.pubkey, lockedAt: String(parsed.lockedAt ?? '') }
      : null;
  } catch {
    return null;
  }
}

/** Keeps the locked key, and reads it back: throws when it did not stay. */
export function writeLockedKey(locked: LockedKey): void {
  localStorage.setItem(LOCKED_KEY_STORAGE, JSON.stringify(locked));
  if (readLockedKey()?.ncryptsec !== locked.ncryptsec) throw new Error('The locked key could not be saved in this browser.');
}

export function removeLockedKey(): void {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(LOCKED_KEY_STORAGE); } catch { /* nothing to remove */ }
}

/* ── Asking, through whatever on screen can ─────────────────────────────── */

export interface UnlockRequest {
  /** What needs the key, as a person would say it: "sending a chat message". */
  reason: string;
  /** Tries a passphrase: resolves once the key is open, throws WrongPassphraseError when it is not the one. */
  attempt: (passphrase: string) => Promise<void>;
}

/** Resolves true once the key is open, false when the person closed the prompt. */
type Asker = (request: UnlockRequest) => Promise<boolean>;
let asker: Asker | null = null;

/** What on screen asks for the passphrase (KeyUnlockRoot); null when it goes. */
export function registerUnlockAsker(next: Asker | null): void {
  asker = next;
}

/** Asks for the passphrase. Throws when nothing on screen can ask. */
export async function askToUnlock(reason: string, attempt: UnlockRequest['attempt']): Promise<boolean> {
  if (!asker) throw new KeyLockedError(NOBODY_TO_ASK);
  return asker({ reason, attempt });
}

/* ── Telling ────────────────────────────────────────────────────────────── */

const listeners = new Set<() => void>();

/** Told when the key is locked, unlocked, or the lock is removed. Returns the function that stops it. */
export function subscribeKeyLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyKeyLock(): void {
  for (const listener of [...listeners]) listener();
}
