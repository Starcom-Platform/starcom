/**
 * ManifestSigningKeyStore — IndexedDB persistence for this Starcom
 * instance's ML-DSA-65 manifest-signing keypair (Cycle 7; rotation added
 * P3.2).
 *
 * A fresh keypair generated per manifest would only prove internal
 * self-consistency (whoever built the manifest also produced a matching
 * signature) — a verifier with no prior relationship to that key learns
 * nothing about provenance. Persisting one keypair per instance means every
 * Mission Package/Finding this Starcom instance ever publishes signs under
 * the same public key, so a verifier who has seen it before (or fetches it
 * once and pins it) can actually attribute later content to the same
 * source. rotate() lets that key change deliberately (e.g. after a
 * suspected compromise) without losing that continuity entirely — the
 * retired key stays retrievable for audit, and getOrCreate() always
 * returns whichever key is current.
 *
 * current/previous record shape follows PQCKeyStore's proven pattern, with
 * one real difference worth stating explicitly: PQCKeyStore's grace period
 * retains a private KEM key so already-received ciphertext stays
 * decryptable — that need doesn't exist here. A Mission Package/Finding
 * signature embeds its own public key (see exchange/signing.ts,
 * findings/signFinding.ts) and remains independently verifiable forever,
 * regardless of anything in this store. `previous`'s graceExpiresAt is
 * purely informational/audit metadata — "this instance still considers
 * itself to have been actively signing under this retired key until this
 * date" — not something anything currently reads to verify a signature.
 *
 * What this does NOT do (see docs/spec/starcom-navcom-interchange.spec.md
 * and ADR-0003 for the fuller context): tell an external verifier who
 * pinned the old key to distrust it. There's no real external consumer of
 * this key yet to notify — building a revocation-broadcast mechanism
 * against zero real consumers would be speculative protocol design ahead
 * of any actual need. Left as a documented open question, not solved here.
 *
 * ─── KEPT ENCRYPTED TO THE PERSON'S OWN NOSTR KEY (D-KL, KL7) ─────────────
 *
 * Its secret was kept in IndexedDB as plain numbers, so a copied browser
 * profile could sign Mission Packages and findings as this person, whatever
 * protected their Nostr key (the EIN transition audit, 21 Nov 2026, finding
 * 6). It is now kept sealed to that Nostr key with NIP-44, so whatever
 * protects the one protects the other: the passphrase lock, Starcom Uplink, or
 * a signing extension. Nothing new is asked of anyone. It is sealed when it can
 * be without asking (a key open in this page, or Uplink, which encrypts
 * quietly), and opened when the person signs, through the same unlock that
 * publishing already asks for, once a visit.
 *
 * Not backed up, and never sent anywhere. Each package's and finding's outer
 * Nostr signature vouches for the key that signed it inside, and no reader
 * here expects a person's key to stay the same, so a new device simply makes
 * a new one. A copy kept on relays would be sealed with today's elliptic-curve
 * encryption, which a quantum computer could open later: the one thing this
 * post-quantum key exists to withstand.
 */
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

/** What seals this key to the person's Nostr key, and opens it. Injected, so tests need no identity. */
export interface KeySealer {
  /** The person's Nostr key, or null when they have none yet. */
  identity(): Promise<string | null>;
  /** Their key, when sealing to it now asks nobody anything; else null. */
  sealTarget(): Promise<string | null>;
  seal(to: string, plaintext: string): Promise<string>;
  /** May ask to unlock: the person is signing. */
  open(from: string, payload: string, reason: string): Promise<string>;
}

/** The Nostr identity's sealer, loaded when first used so this module stays free of the identity stack. */
export const nostrKeySealer: KeySealer = {
  async identity() {
    const { nostrIdentityService } = await import('../identity/NostrIdentityService');
    return (await nostrIdentityService.whoAmI()).pubkey;
  },
  async sealTarget() {
    const { nostrIdentityService } = await import('../identity/NostrIdentityService');
    if (nostrIdentityService.isLocked()) return null;
    return (await nostrIdentityService.whoAmI()).pubkey;
  },
  async seal(to, plaintext) {
    const { nostrIdentityService } = await import('../identity/NostrIdentityService');
    return nostrIdentityService.nip44Encrypt(to, plaintext, 'keeping your post-quantum signing key');
  },
  async open(from, payload, reason) {
    const { nostrIdentityService } = await import('../identity/NostrIdentityService');
    return nostrIdentityService.nip44Decrypt(from, payload, reason);
  },
};

/** The person kept their key locked: nothing is replaced, and the act fails as D-KL says. */
const keptLocked = (error: unknown): boolean => (error as { name?: string } | null)?.name === 'KeyLockedError';

const OPEN_REASON = 'signing with your post-quantum key';

const DB_NAME = 'pqc-manifest-signing-key';
const DB_VERSION = 1;
const STORE_NAME = 'ml-dsa-key';

/** Legacy record id from before rotation existed — a single fixed slot, never versioned. Migrated on first read, not silently orphaned. */
const LEGACY_RECORD_ID = 'local';

// Informational only — see this file's header comment on why no local
// decrypt capability depends on it, unlike PQCKeyStore's identically-named
// field. No hardcoded rotation CADENCE is defined here (see needsRotation's
// own doc comment for why); this only governs how long a demoted key is
// still described as "recently active" once rotate() is actually called.
const RETIRED_KEY_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface ManifestSigningKeyPair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

/** The secret, sealed to a Nostr key with NIP-44 (KL7). */
export interface SealedSecret {
  to: string;
  payload: string;
}

export interface StoredManifestSigningKey {
  id: 'current' | 'previous';
  /** Absent once sealed, and on a retired key, which never signs again. */
  secretKey?: Uint8Array;
  publicKey: Uint8Array;
  sealed?: SealedSecret;
  createdAt: number;
  /** Set only on a demoted 'previous' record. See this file's header comment. */
  graceExpiresAt?: number;
}

interface StoredKeyRaw {
  id: string;
  secretKey?: number[];
  publicKey: number[];
  sealed?: SealedSecret;
  createdAt?: number;
  graceExpiresAt?: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function fromRaw(raw: StoredKeyRaw): StoredManifestSigningKey {
  return {
    id: raw.id === 'previous' ? 'previous' : 'current',
    ...(raw.secretKey ? { secretKey: new Uint8Array(raw.secretKey) } : {}),
    publicKey: new Uint8Array(raw.publicKey),
    ...(raw.sealed ? { sealed: raw.sealed } : {}),
    createdAt: raw.createdAt ?? 0,
    graceExpiresAt: raw.graceExpiresAt
  };
}

export class ManifestSigningKeyStore {
  /**
   * Memoized in-flight promise, not a boolean/re-check-after-await guard:
   * two concurrent getOrCreate calls (e.g. publishToNavcom on two missions
   * fired close together) would otherwise both read `existing === undefined`
   * before either write lands, each generate its OWN random keypair via
   * keygen(), and each persist — last write wins, so the losing caller
   * signs its manifest with a secret key that never ends up in the store.
   * Same in-flight-promise pattern already used by
   * IntelWorkspaceManager.ensure()/WorkspaceBackedMissionService.ensure().
   * rotate() resets this to the freshly-rotated key so a getOrCreate() call
   * immediately after a rotation can't return a stale cached value.
   */
  private getOrCreatePromise: Promise<ManifestSigningKeyPair> | null = null;

  constructor(private readonly sealer: KeySealer = nostrKeySealer) {}

  private async getRaw(id: 'current' | 'previous' | typeof LEGACY_RECORD_ID): Promise<StoredKeyRaw | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => { db.close(); resolve(req.result as StoredKeyRaw | undefined); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  private async put(key: StoredManifestSigningKey): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        id: key.id,
        ...(key.secretKey ? { secretKey: Array.from(key.secretKey) } : {}),
        publicKey: Array.from(key.publicKey),
        ...(key.sealed ? { sealed: key.sealed } : {}),
        createdAt: key.createdAt,
        graceExpiresAt: key.graceExpiresAt
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  private async delete(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  /**
   * Migrates a pre-rotation record (stored under the fixed legacy id
   * 'local') into the new 'current' slot the first time it's encountered,
   * rather than silently orphaning it — an instance that already
   * persisted a key and published content under it must keep signing
   * under that same key until it explicitly rotates, not start signing
   * under a brand-new one just because the storage schema changed.
   */
  private async migrateLegacyIfNeeded(): Promise<StoredManifestSigningKey | undefined> {
    const legacy = await this.getRaw(LEGACY_RECORD_ID);
    if (!legacy) return undefined;
    if (!legacy.secretKey) return undefined;
    const migrated: StoredManifestSigningKey = {
      id: 'current',
      secretKey: new Uint8Array(legacy.secretKey),
      publicKey: new Uint8Array(legacy.publicKey),
      createdAt: legacy.createdAt ?? 0
    };
    await this.put(migrated);
    await this.delete(LEGACY_RECORD_ID);
    return migrated;
  }

  private async get(id: 'current' | 'previous'): Promise<StoredManifestSigningKey | undefined> {
    const raw = await this.getRaw(id);
    if (raw) return fromRaw(raw);
    if (id === 'current') return this.migrateLegacyIfNeeded();
    return undefined;
  }

  /** Returns the current persisted keypair, generating and persisting one via the injected keygen if none exists yet (including migrating a pre-rotation legacy record — see migrateLegacyIfNeeded). */
  async getOrCreate(keygen: () => { secretKey: Uint8Array; publicKey: Uint8Array }): Promise<ManifestSigningKeyPair> {
    if (!this.getOrCreatePromise) {
      // Held for the visit once open, as the Nostr key is (D-KL); a refusal is not held, so the next act asks again.
      this.getOrCreatePromise = this.load(keygen).catch((error: unknown) => {
        this.getOrCreatePromise = null;
        throw error;
      });
    }
    return this.getOrCreatePromise;
  }

  private async load(keygen: () => { secretKey: Uint8Array; publicKey: Uint8Array }): Promise<ManifestSigningKeyPair> {
    const existing = await this.get('current');
    if (existing?.sealed) {
      const me = await this.sealer.identity();
      if (me && me === existing.sealed.to) {
        try {
          const secretKey = hexToBytes(await this.sealer.open(me, existing.sealed.payload, OPEN_REASON));
          return { secretKey, publicKey: existing.publicKey };
        } catch (error) {
          if (keptLocked(error)) throw error;
          // Unreadable here: replaced below, as when it was sealed to another key.
        }
      }
      // Sealed to a key this browser no longer holds, or unreadable: it cannot sign here again. A new key takes its
      // place, and its public half stays as the previous key, so what it signed is still recognised as ours.
      return this.replace(existing, keygen);
    }
    if (existing?.secretKey) {
      await this.sealIfQuiet(existing);
      return { secretKey: existing.secretKey, publicKey: existing.publicKey };
    }
    const generated = keygen();
    await this.put(await this.sealedIfQuiet({ id: 'current', ...generated, createdAt: Date.now() }));
    return generated;
  }

  /** The record sealed when that asks nobody anything; as it was otherwise, to be sealed on a later try. */
  private async sealedIfQuiet(key: StoredManifestSigningKey): Promise<StoredManifestSigningKey> {
    if (!key.secretKey) return key;
    try {
      const to = await this.sealer.sealTarget();
      if (!to) return key;
      const payload = await this.sealer.seal(to, bytesToHex(key.secretKey));
      const { secretKey: _secret, ...rest } = key;
      return { ...rest, sealed: { to, payload } };
    } catch {
      return key;
    }
  }

  /** Seals the current key, and drops the retired key's secret, when that asks nobody anything. */
  private async sealIfQuiet(current: StoredManifestSigningKey): Promise<void> {
    const sealed = await this.sealedIfQuiet(current);
    if (!sealed.sealed) return;
    await this.put(sealed);
    const previous = await this.get('previous');
    if (previous?.secretKey) {
      const { secretKey: _secret, ...rest } = previous;
      await this.put(rest);
    }
  }

  /**
   * Seals the current key now if it is still plain and that asks nobody anything: called when the person locks or
   * unlocks their Nostr key, so locking it protects this key too, at once.
   */
  async sealNow(): Promise<void> {
    try {
      const current = await this.get('current');
      if (current?.secretKey) await this.sealIfQuiet(current);
    } catch {
      // Tried again on the next signature.
    }
  }

  private async replace(old: StoredManifestSigningKey, keygen: () => { secretKey: Uint8Array; publicKey: Uint8Array }): Promise<ManifestSigningKeyPair> {
    const now = Date.now();
    await this.put({ id: 'previous', publicKey: old.publicKey, createdAt: old.createdAt, graceExpiresAt: now + RETIRED_KEY_GRACE_MS });
    const generated = keygen();
    await this.put(await this.sealedIfQuiet({ id: 'current', ...generated, createdAt: now }));
    return generated;
  }

  /** The most recently retired key, if this instance has ever rotated — for audit/introspection. Not needed to verify an old signature (see this file's header comment). */
  async getPrevious(): Promise<StoredManifestSigningKey | undefined> {
    return this.get('previous');
  }

  /**
   * True once the current key is at least maxAgeMs old. Deliberately takes
   * the threshold as a parameter rather than hardcoding one the way
   * PQCKeyStore hardcodes 30 days for chat prekeys — a manifest-signing
   * key is used far less often and carries different risk, and there's no
   * real usage data yet to justify a specific cadence. Nothing in this
   * codebase calls this automatically; it exists so a future policy can,
   * once one is actually decided.
   */
  async needsRotation(maxAgeMs: number): Promise<boolean> {
    const current = await this.get('current');
    if (!current) return false; // nothing generated yet — not "needs rotating"
    return Date.now() - current.createdAt >= maxAgeMs;
  }

  /**
   * Generates a new keypair via the injected keygen, demotes the current
   * key to 'previous' (stamped with an informational grace window — see
   * this file's header comment), and makes the new keypair current.
   * Never called automatically anywhere in this codebase — manual/
   * caller-triggered only, per this pass's decision not to invent an
   * automatic cadence.
   */
  async rotate(keygen: () => { secretKey: Uint8Array; publicKey: Uint8Array }): Promise<ManifestSigningKeyPair> {
    const now = Date.now();
    const current = await this.get('current');
    if (current) {
      // A sealed key retires as its public half alone: it never signs again, so its secret is kept nowhere.
      const { sealed: _sealed, ...retired } = current;
      await this.put({ ...retired, ...(current.sealed ? { secretKey: undefined } : {}), id: 'previous', graceExpiresAt: now + RETIRED_KEY_GRACE_MS });
    }
    const generated = keygen();
    await this.put(await this.sealedIfQuiet({ id: 'current', ...generated, createdAt: now }));
    const result: ManifestSigningKeyPair = { secretKey: generated.secretKey, publicKey: generated.publicKey };
    this.getOrCreatePromise = Promise.resolve(result);
    return result;
  }
}

export const manifestSigningKeyStore = new ManifestSigningKeyStore();
