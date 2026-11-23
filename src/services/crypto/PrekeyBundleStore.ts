/**
 * PrekeyBundleStore — IndexedDB persistence for the LOCAL user's own X3DH
 * prekey bundle secrets (Cycle B1).
 *
 * ForwardSecrecyService.generatePrekeyBundle() is real and tested, but
 * nothing previously persisted its output: every call to
 * SecureChatIntegrationService.sendMessage()/processIncomingMessage()
 * generated a throwaway keypair and threw it away immediately — the
 * private key needed to ever decrypt anything never existed anywhere by
 * the time it was needed. This is the missing persistence layer: generate
 * once, keep the private material locally, publish only the public bundle.
 *
 * Same IndexedDB-per-record-store pattern as PQCKeyStore (a distinct
 * database — this stores structurally different, richer material: a full
 * bundle of one-time-prekey secrets plus consumption bookkeeping, not a
 * single rotating KEM keypair).
 */

import { logger } from '../../utils';
import type { ForwardSecrecyService, PrekeyBundle } from './ForwardSecrecyService';

const DB_NAME = 'pqc-prekey-bundle-store';
const DB_VERSION = 1;
const STORE_NAME = 'local-bundle';
const LOCAL_RECORD_ID = 'local';

/**
 * P3.3 Part A — shrinks the OTK-collision race window. Before this, a
 * batch of 50 OTKs was published once and never refreshed: markOtkConsumed
 * only updated local bookkeeping, so the same stale public bundle stayed
 * live on relays indefinitely (documented as a real, reachable race in
 * SecureChatIntegrationService.ts). Republishing after every single
 * consumption would spam relays with a new event per message; batching to
 * every 10 keeps the exposure window bounded without that cost. This does
 * NOT eliminate the race — two people can still grab the same OTK in the
 * window before a threshold-triggered republish lands — only shrinks it
 * from "until the next full app restart" to "until the next batch of 10
 * consumptions." Full recovery when a collision still happens is P3.3 Part
 * B (a signed retry-without-OTK signal), deliberately not implemented yet.
 */
const REPLENISH_THRESHOLD = 10;

export interface LocalPrekeyBundleSecrets {
  identityPrivateKey: Uint8Array;
  signedPrekeyPrivateKey: Uint8Array;
  oneTimePrekeyPrivateKeys: Uint8Array[];
}

interface StoredLocalBundle {
  id: 'local';
  identity: string;
  bundle: PrekeyBundle;
  secrets: LocalPrekeyBundleSecrets;
  /** Indices into bundle.oneTimePrekeys / secrets.oneTimePrekeyPrivateKeys already
   *  used in an acceptSession() call — an OTK must never be reused, or an attacker
   *  who later compromises the long-term key could derive that one session's key. */
  consumedOtkIndices: number[];
  /**
   * This device's name, which its bundle is published under (plan item 9.11).
   * Kept with the bundle, and carried over when the key here changes. Absent on
   * a record an older build wrote, and given then.
   */
  deviceId?: string;
}

/** A name for this device: eight random bytes, hex. */
function newDeviceId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
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

function serializeBundle(bundle: PrekeyBundle) {
  return {
    ...bundle,
    identityKey: Array.from(bundle.identityKey),
    signedPrekey: Array.from(bundle.signedPrekey),
    signedPrekeySignature: Array.from(bundle.signedPrekeySignature),
    oneTimePrekeys: bundle.oneTimePrekeys.map(k => Array.from(k)),
  };
}

interface SerializedBundle {
  identity: string;
  identityKey: number[];
  signedPrekey: number[];
  signedPrekeyCreatedAt: number;
  signedPrekeySignature: number[];
  oneTimePrekeys: number[][];
}

function deserializeBundle(raw: SerializedBundle): PrekeyBundle {
  return {
    identity: raw.identity,
    identityKey: new Uint8Array(raw.identityKey),
    signedPrekey: new Uint8Array(raw.signedPrekey),
    signedPrekeyCreatedAt: raw.signedPrekeyCreatedAt,
    signedPrekeySignature: new Uint8Array(raw.signedPrekeySignature),
    oneTimePrekeys: raw.oneTimePrekeys.map(k => new Uint8Array(k)),
  };
}

export class PrekeyBundleStore {
  private async put(record: StoredLocalBundle): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        id: record.id,
        identity: record.identity,
        bundle: serializeBundle(record.bundle),
        secrets: {
          identityPrivateKey: Array.from(record.secrets.identityPrivateKey),
          signedPrekeyPrivateKey: Array.from(record.secrets.signedPrekeyPrivateKey),
          oneTimePrekeyPrivateKeys: record.secrets.oneTimePrekeyPrivateKeys.map(k => Array.from(k)),
        },
        consumedOtkIndices: record.consumedOtkIndices,
        ...(record.deviceId ? { deviceId: record.deviceId } : {}),
      });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  private async get(): Promise<StoredLocalBundle | undefined> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(LOCAL_RECORD_ID);
      req.onsuccess = () => {
        db.close();
        const raw = req.result;
        if (!raw) return resolve(undefined);
        resolve({
          id: 'local',
          identity: raw.identity,
          bundle: deserializeBundle(raw.bundle),
          secrets: {
            identityPrivateKey: new Uint8Array(raw.secrets.identityPrivateKey),
            signedPrekeyPrivateKey: new Uint8Array(raw.secrets.signedPrekeyPrivateKey),
            oneTimePrekeyPrivateKeys: raw.secrets.oneTimePrekeyPrivateKeys.map((k: number[]) => new Uint8Array(k)),
          },
          consumedOtkIndices: raw.consumedOtkIndices || [],
          ...(typeof raw.deviceId === 'string' ? { deviceId: raw.deviceId } : {}),
        });
      };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  /**
   * Return the local user's persisted bundle+secrets, generating and
   * persisting a fresh one (via the injected ForwardSecrecyService) if none
   * exists yet. Does NOT publish — callers that need the public half
   * announced call publishPrekeyBundle(bundle, deviceId) separately (matches the
   * existing generate/publish separation in ForwardSecrecyService/
   * PQCKeyPublisher).
   */
  async getOrCreateLocalBundle(
    identity: string,
    forwardSecrecy: ForwardSecrecyService
  ): Promise<{ bundle: PrekeyBundle; secrets: LocalPrekeyBundleSecrets; deviceId: string }> {
    const existing = await this.get();
    if (existing && existing.identity === identity) {
      if (existing.deviceId) return { bundle: existing.bundle, secrets: existing.secrets, deviceId: existing.deviceId };
      // Kept before devices had names: named now, and the bundle kept.
      const deviceId = newDeviceId();
      await this.put({ ...existing, deviceId });
      return { bundle: existing.bundle, secrets: existing.secrets, deviceId };
    }

    const { bundle, secrets } = await forwardSecrecy.generatePrekeyBundle(identity);
    // The device keeps its name when the key here changes: it is the same device.
    const deviceId = existing?.deviceId ?? newDeviceId();
    await this.put({ id: 'local', identity, bundle, secrets, consumedOtkIndices: [], deviceId });
    logger.info(`[PrekeyBundleStore] Generated and persisted new local prekey bundle for ${identity}`);
    return { bundle, secrets, deviceId };
  }

  /**
   * Whether a persisted local bundle for this identity still exists.
   *
   * Exists because a caller holding a bundle in memory has no other way to
   * find out that the store lost it. IndexedDB can be evicted — quota
   * pressure, "clear site data", private-mode teardown — and a service that
   * memoised its secrets would then decrypt against keys nothing else
   * recognises, failing every message silently and permanently.
   */
  async hasLocalBundle(bundle: PrekeyBundle): Promise<boolean> {
    const record = await this.get();
    if (!record || record.identity !== bundle.identity) return false;
    // Compare the BUNDLE, not just the identity. The identity is a long-lived
    // pubkey and survives the store being wiped, so an identity check returns
    // true for a freshly generated bundle belonging to the same person — which
    // is exactly the case this needs to catch.
    const a = record.bundle.signedPrekey;
    const b = bundle.signedPrekey;
    return a.length === b.length && a.every((byte, i) => byte === b[i]);
  }

  /** The private key for a specific one-time prekey index, or undefined if already consumed or out of range. */
  async getUnconsumedOtkPrivateKey(index: number): Promise<Uint8Array | undefined> {
    const record = await this.get();
    if (!record) return undefined;
    if (record.consumedOtkIndices.includes(index)) {
      logger.warn(`[PrekeyBundleStore] OTK index ${index} already consumed — refusing reuse`);
      return undefined;
    }
    return record.secrets.oneTimePrekeyPrivateKeys[index];
  }

  /** Mark a one-time prekey as consumed so it's never used to accept a second session. */
  async markOtkConsumed(index: number): Promise<void> {
    const record = await this.get();
    if (!record) return;
    if (!record.consumedOtkIndices.includes(index)) {
      record.consumedOtkIndices.push(index);
      await this.put(record);
    }
  }

  /**
   * Once REPLENISH_THRESHOLD OTKs have been consumed, generates fresh
   * replacements for exactly those slots and clears consumedOtkIndices —
   * returns the updated bundle (for the caller to republish) or null if
   * the threshold hasn't been reached yet, or there's no local bundle at
   * all.
   *
   * Replaces consumed slots IN PLACE at their existing array indices
   * rather than compacting the array and appending fresh ones at the end.
   * The OTK "index" is a sender's reference into this exact array
   * position — compacting would silently invalidate every in-flight
   * message that referenced a later, now-shifted index. A sender who
   * fetched the bundle before this republish and references a
   * since-replaced index will still fail to decrypt after this runs (the
   * responder's stored private key for that slot is now different from
   * what the sender actually encapsulated against) — an inherent
   * limitation of refreshing a fetch-once bundle at all, not something
   * this fix claims to solve; see this file's header comment.
   */
  async replenishConsumedOtksIfThresholdReached(forwardSecrecy: ForwardSecrecyService): Promise<PrekeyBundle | null> {
    const record = await this.get();
    if (!record) return null;
    if (record.consumedOtkIndices.length < REPLENISH_THRESHOLD) return null;

    const { publicKeys, privateKeys } = await forwardSecrecy.generateOneTimePrekeys(record.consumedOtkIndices.length);
    record.consumedOtkIndices.forEach((otkIndex, i) => {
      record.bundle.oneTimePrekeys[otkIndex] = publicKeys[i];
      record.secrets.oneTimePrekeyPrivateKeys[otkIndex] = privateKeys[i];
    });
    record.consumedOtkIndices = [];
    await this.put(record);

    logger.info(`[PrekeyBundleStore] Replenished ${publicKeys.length} consumed OTK slot(s)`);
    return record.bundle;
  }
}

export const prekeyBundleStore = new PrekeyBundleStore();
export { REPLENISH_THRESHOLD };
