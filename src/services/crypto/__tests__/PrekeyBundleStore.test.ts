/**
 * PrekeyBundleStore — Cycle B1.
 *
 * jsdom (this project's default vitest environment) has no IndexedDB — the
 * established workaround elsewhere in this codebase (see
 * SubmarineCableCacheStore.test.ts, EcoHistoryStore.test.ts) is
 * `import 'fake-indexeddb/auto'` at the top of the file, scoped to just
 * this test file. Also needs the node environment (like the other crypto
 * tests here): this exercises generatePrekeyBundle's Ed25519 signing, which
 * needs a real crypto.subtle — jsdom's own partial `crypto` global (which
 * has getRandomValues but no .subtle) would otherwise shadow the
 * node-environment webcrypto polyfill setupVitest.ts adds.
 *
 * @vitest-environment node
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { PrekeyBundleStore } from '../PrekeyBundleStore';
import { ForwardSecrecyService } from '../ForwardSecrecyService';

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('pqc-prekey-bundle-store');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // best-effort; no open connections held between tests
  });
}

describe('PrekeyBundleStore', () => {
  let store: PrekeyBundleStore;
  let fs: ForwardSecrecyService;

  beforeEach(async () => {
    // Real IndexedDB (via fake-indexeddb) has no automatic per-test
    // isolation — without this, a bundle persisted by an earlier test in
    // this file is still there for a later test that expects a clean slate.
    await deleteDb();
    store = new PrekeyBundleStore();
    fs = new ForwardSecrecyService();
  });

  it('generates and persists a bundle on first call', async () => {
    const { bundle, secrets } = await store.getOrCreateLocalBundle('alice-pubkey', fs);
    expect(bundle.identity).toBe('alice-pubkey');
    expect(bundle.identityKey.length).toBe(1184);
    expect(secrets.identityPrivateKey.length).toBe(2400);
    expect(secrets.oneTimePrekeyPrivateKeys.length).toBeGreaterThan(0);
  });

  it('returns the SAME bundle on a second call — not regenerated (this is the actual bug being fixed: the pre-fix code regenerated and discarded a keypair on every call)', async () => {
    const first = await store.getOrCreateLocalBundle('alice-pubkey', fs);
    const second = await store.getOrCreateLocalBundle('alice-pubkey', fs);

    expect(second.bundle.identityKey).toEqual(first.bundle.identityKey);
    expect(second.secrets.identityPrivateKey).toEqual(first.secrets.identityPrivateKey);
  });

  it('survives a reload — a fresh store instance reads the same persisted bundle', async () => {
    const original = await store.getOrCreateLocalBundle('alice-pubkey', fs);

    const reloadedStore = new PrekeyBundleStore();
    const reloaded = await reloadedStore.getOrCreateLocalBundle('alice-pubkey', fs);

    expect(reloaded.bundle.identityKey).toEqual(original.bundle.identityKey);
  });

  it('an unconsumed OTK index returns its private key', async () => {
    await store.getOrCreateLocalBundle('bob-pubkey', fs);
    const key = await store.getUnconsumedOtkPrivateKey(0);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key!.length).toBe(2400);
  });

  it('a consumed OTK index refuses reuse — real forward-secrecy hygiene, not just bookkeeping', async () => {
    await store.getOrCreateLocalBundle('bob-pubkey', fs);
    await store.markOtkConsumed(3);
    const key = await store.getUnconsumedOtkPrivateKey(3);
    expect(key).toBeUndefined();

    // A different, still-unconsumed index is unaffected.
    const otherKey = await store.getUnconsumedOtkPrivateKey(4);
    expect(otherKey).toBeInstanceOf(Uint8Array);
  });

  it('getUnconsumedOtkPrivateKey returns undefined when no local bundle exists yet', async () => {
    const key = await store.getUnconsumedOtkPrivateKey(0);
    expect(key).toBeUndefined();
  });

  describe('replenishConsumedOtksIfThresholdReached (P3.3 Part A)', () => {
    it('returns null (does nothing) below the threshold', async () => {
      await store.getOrCreateLocalBundle('bob-pubkey', fs);
      for (let i = 0; i < 5; i++) await store.markOtkConsumed(i); // fewer than REPLENISH_THRESHOLD (10)

      const result = await store.replenishConsumedOtksIfThresholdReached(fs);
      expect(result).toBeNull();

      // Still refuses reuse — nothing was replenished.
      expect(await store.getUnconsumedOtkPrivateKey(0)).toBeUndefined();
    });

    it('returns null when there is no local bundle at all', async () => {
      const result = await store.replenishConsumedOtksIfThresholdReached(fs);
      expect(result).toBeNull();
    });

    it('once the threshold is reached, replaces exactly the consumed slots with fresh keys and clears consumedOtkIndices', async () => {
      const { bundle: original } = await store.getOrCreateLocalBundle('bob-pubkey', fs);
      const consumedIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // exactly REPLENISH_THRESHOLD
      for (const i of consumedIndices) await store.markOtkConsumed(i);

      const refreshed = await store.replenishConsumedOtksIfThresholdReached(fs);
      expect(refreshed).not.toBeNull();

      // Replaced slots have DIFFERENT public keys than before — genuinely fresh, not reused.
      for (const i of consumedIndices) {
        expect(refreshed!.oneTimePrekeys[i]).not.toEqual(original.oneTimePrekeys[i]);
      }
      // An untouched slot is exactly unchanged.
      expect(refreshed!.oneTimePrekeys[15]).toEqual(original.oneTimePrekeys[15]);
      // The array length/index positions are stable — no compaction that
      // would invalidate an in-flight sender's reference to a later index.
      expect(refreshed!.oneTimePrekeys.length).toBe(original.oneTimePrekeys.length);

      // Previously-consumed slots are usable again, with real (not stale) private key material.
      for (const i of consumedIndices) {
        const key = await store.getUnconsumedOtkPrivateKey(i);
        expect(key).toBeInstanceOf(Uint8Array);
      }
    });

    it('replenished private keys actually match their replenished public keys — a real usable keypair, not mismatched halves', async () => {
      await store.getOrCreateLocalBundle('bob-pubkey', fs);
      for (let i = 0; i < 10; i++) await store.markOtkConsumed(i);
      const refreshed = await store.replenishConsumedOtksIfThresholdReached(fs);

      const privateKey = await store.getUnconsumedOtkPrivateKey(0);
      // Round-trip through the real KEM: encapsulating against the
      // refreshed public key and decapsulating with the refreshed private
      // key must agree — proves they're a genuine matched pair, not two
      // independently-generated keys that happen to share an index.
      const pqc = (fs as unknown as { pqc: { kemEncapsulate: (pk: Uint8Array) => Promise<{ ciphertext: Uint8Array; sharedSecret: Uint8Array }>; kemDecapsulate: (ct: Uint8Array, sk: Uint8Array) => Promise<Uint8Array> } }).pqc;
      const { ciphertext, sharedSecret: encapsulated } = await pqc.kemEncapsulate(refreshed!.oneTimePrekeys[0]);
      const decapsulated = await pqc.kemDecapsulate(ciphertext, privateKey!);
      expect(decapsulated).toEqual(encapsulated);
    });
  });

  /*
   * Each device publishes its bundle at its own address (plan item 9.11), so a
   * device needs a name of its own, kept with its bundle.
   */
  describe('the device', () => {
    it('is named once, and keeps its name across calls and a reload', async () => {
      const first = await store.getOrCreateLocalBundle('alice-pubkey', fs);
      expect(first.deviceId).toMatch(/^[0-9a-f]{16}$/);
      expect((await store.getOrCreateLocalBundle('alice-pubkey', fs)).deviceId).toBe(first.deviceId);
      expect((await new PrekeyBundleStore().getOrCreateLocalBundle('alice-pubkey', fs)).deviceId).toBe(first.deviceId);
    });

    it('keeps its name when the key here changes, as when one is imported', async () => {
      const alice = await store.getOrCreateLocalBundle('alice-pubkey', fs);
      const bob = await store.getOrCreateLocalBundle('bob-pubkey', fs);
      expect(bob.bundle.identity).toBe('bob-pubkey');
      expect(bob.deviceId).toBe(alice.deviceId);
    });

    it('is named when its bundle was kept before devices had names, and the bundle is not remade', async () => {
      const kept = await store.getOrCreateLocalBundle('alice-pubkey', fs);
      // The record as an older build wrote it: no device name.
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('pqc-prekey-bundle-store', 1);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('local-bundle', 'readwrite');
          const objects = tx.objectStore('local-bundle');
          const get = objects.get('local');
          get.onsuccess = () => { const { deviceId: _dropped, ...older } = get.result; objects.put(older); };
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
        };
        open.onerror = () => reject(open.error);
      });

      const named = await new PrekeyBundleStore().getOrCreateLocalBundle('alice-pubkey', fs);
      expect(named.deviceId).toMatch(/^[0-9a-f]{16}$/);
      expect(named.bundle.signedPrekey).toEqual(kept.bundle.signedPrekey);
      expect((await new PrekeyBundleStore().getOrCreateLocalBundle('alice-pubkey', fs)).deviceId).toBe(named.deviceId);
    });
  });
});

