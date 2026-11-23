/**
 * ManifestSigningKeyStore — Cycle 7.
 *
 * jsdom (this project's default vitest environment) has no IndexedDB —
 * the established workaround (see PrekeyBundleStore.test.ts and others)
 * is `import 'fake-indexeddb/auto'`, scoped to this file.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ManifestSigningKeyStore, type KeySealer } from '../ManifestSigningKeyStore';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('pqc-manifest-signing-key');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('ManifestSigningKeyStore', () => {
  let store: ManifestSigningKeyStore;

  beforeEach(async () => {
    await deleteDb();
    store = new ManifestSigningKeyStore();
  });

  // vitest's pool: 'forks'/singleFork:true shares one process (and one real
  // fake-indexeddb backing store) across every test FILE in the run, not
  // just tests within this file. The concurrent-calls test below persists a
  // deliberately fake, wrong-shaped (32-byte, not real ML-DSA-65's 4032-byte)
  // "secretKey" under this store's fixed 'local' record id — without this
  // cleanup, that fake key silently leaks into whichever other test file
  // runs next in the same process and happens to touch the real
  // manifestSigningKeyStore singleton (MissionService.publishToNavcom.test.ts
  // does exactly this), crashing ml_dsa65.getPublicKey with a byte-length
  // mismatch that has nothing to do with whatever that file is testing.
  afterEach(async () => {
    await deleteDb();
  });

  it('generates and persists a keypair on first call', async () => {
    const keys = await store.getOrCreate(() => ml_dsa65.keygen());
    expect(keys.secretKey.length).toBeGreaterThan(0);
    expect(keys.publicKey.length).toBeGreaterThan(0);
    // Real keypair: the public key really is derivable from the secret key.
    expect(ml_dsa65.getPublicKey(keys.secretKey)).toEqual(keys.publicKey);
  });

  it('returns the SAME keypair on a second call — not regenerated, matching a Starcom instance signing under one stable identity', async () => {
    const first = await store.getOrCreate(() => ml_dsa65.keygen());
    const second = await store.getOrCreate(() => ml_dsa65.keygen());
    expect(second.secretKey).toEqual(first.secretKey);
    expect(second.publicKey).toEqual(first.publicKey);
  });

  it('survives a reload — a fresh store instance reads the same persisted keypair', async () => {
    const original = await store.getOrCreate(() => ml_dsa65.keygen());
    const reloadedStore = new ManifestSigningKeyStore();
    const reloaded = await reloadedStore.getOrCreate(() => ml_dsa65.keygen());
    expect(reloaded.secretKey).toEqual(original.secretKey);
  });

  it('two concurrent first-ever calls resolve to the SAME keypair, not two different ones racing to persist', async () => {
    // A keygen that's obviously distinguishable per call (unlike two real
    // ml_dsa65.keygen() calls, which would also differ but be tedious to
    // tell apart in a failure message) — proves whichever call "wins" is
    // shared, not that they coincidentally matched.
    let calls = 0;
    const keygen = () => {
      calls += 1;
      const secretKey = new Uint8Array(32).fill(calls);
      const publicKey = new Uint8Array(32).fill(calls);
      return { secretKey, publicKey };
    };

    const [a, b] = await Promise.all([
      store.getOrCreate(keygen),
      store.getOrCreate(keygen),
    ]);

    expect(a.secretKey).toEqual(b.secretKey);
    expect(a.publicKey).toEqual(b.publicKey);
    // Without memoization, both calls would see no persisted key yet and
    // each invoke keygen() independently.
    expect(calls).toBe(1);

    // And what actually landed in IndexedDB matches what both callers got —
    // the losing caller in the old code signed with a key that was never
    // the one actually persisted.
    const persisted = await new ManifestSigningKeyStore().getOrCreate(keygen);
    expect(persisted.secretKey).toEqual(a.secretKey);
  });

  describe('rotation (P3.2)', () => {
    it('needsRotation is false when nothing has been generated yet', async () => {
      await expect(store.needsRotation(0)).resolves.toBe(false);
    });

    it('needsRotation reflects the caller-supplied threshold, not a hardcoded cadence', async () => {
      await store.getOrCreate(() => ml_dsa65.keygen());
      // Any elapsed time (even a few ms) clears a 0ms threshold.
      await expect(store.needsRotation(0)).resolves.toBe(true);
      // A key generated moments ago is nowhere near a year old.
      await expect(store.needsRotation(365 * 24 * 60 * 60 * 1000)).resolves.toBe(false);
    });

    it('rotate() makes a NEW key current — getOrCreate after rotation returns the new key, not the old one', async () => {
      const original = await store.getOrCreate(() => ml_dsa65.keygen());
      const rotated = await store.rotate(() => ml_dsa65.keygen());

      expect(rotated.secretKey).not.toEqual(original.secretKey);

      const currentAfterRotation = await store.getOrCreate(() => ml_dsa65.keygen());
      expect(currentAfterRotation.secretKey).toEqual(rotated.secretKey);
      expect(currentAfterRotation.secretKey).not.toEqual(original.secretKey);
    });

    it('rotate() demotes the old key to previous — retrievable for audit, not discarded', async () => {
      const original = await store.getOrCreate(() => ml_dsa65.keygen());
      await store.rotate(() => ml_dsa65.keygen());

      const previous = await store.getPrevious();
      expect(previous?.secretKey).toEqual(original.secretKey);
      expect(previous?.graceExpiresAt).toBeGreaterThan(Date.now());
    });

    it('getPrevious is undefined when this instance has never rotated', async () => {
      await store.getOrCreate(() => ml_dsa65.keygen());
      await expect(store.getPrevious()).resolves.toBeUndefined();
    });

    it('rotate() is safe to call on a store that has never generated a key — just creates the first current key, nothing to demote', async () => {
      const rotated = await store.rotate(() => ml_dsa65.keygen());
      expect(rotated.secretKey.length).toBeGreaterThan(0);
      await expect(store.getPrevious()).resolves.toBeUndefined();
    });

    it('migrates a pre-rotation legacy record (id "local") into the new current slot instead of generating a brand-new key', async () => {
      // Simulate an instance that persisted a key before rotation support
      // existed — under the old fixed record id, no createdAt field.
      const legacyKeys = ml_dsa65.keygen();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('pqc-manifest-signing-key', 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('ml-dsa-key')) {
            req.result.createObjectStore('ml-dsa-key', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('ml-dsa-key', 'readwrite');
        tx.objectStore('ml-dsa-key').put({
          id: 'local',
          secretKey: Array.from(legacyKeys.secretKey),
          publicKey: Array.from(legacyKeys.publicKey)
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();

      const migrated = await store.getOrCreate(() => ml_dsa65.keygen());
      expect(migrated.secretKey).toEqual(legacyKeys.secretKey);

      // A fresh store instance (simulating a reload) reads the migrated
      // 'current' record directly, confirming the legacy record was
      // actually rewritten, not just returned from an in-memory fallback.
      const reloadedStore = new ManifestSigningKeyStore();
      const reloaded = await reloadedStore.getOrCreate(() => ml_dsa65.keygen());
      expect(reloaded.secretKey).toEqual(legacyKeys.secretKey);
    });
  });
});

/**
 * Kept sealed to the person's own Nostr key (D-KL, KL7; the EIN transition audit, 21 Nov 2026, finding 6). The
 * secret was kept as plain numbers; now whatever protects the Nostr key protects it, and nobody is asked anything new.
 */
describe('ManifestSigningKeyStore, sealed to the Nostr key', () => {
  const ME = 'a'.repeat(64);
  const OTHER = 'b'.repeat(64);

  function rawCurrent(id = 'current'): Promise<Record<string, unknown> | undefined> {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('pqc-manifest-signing-key', 1);
      open.onsuccess = () => {
        const db = open.result;
        const get = db.transaction('ml-dsa-key', 'readonly').objectStore('ml-dsa-key').get(id);
        get.onsuccess = () => { db.close(); resolve(get.result as Record<string, unknown> | undefined); };
        get.onerror = () => { db.close(); reject(get.error); };
      };
      open.onerror = () => reject(open.error);
    });
  }

  /** A reversible stand-in for NIP-44 to self: what it seals names the key it was sealed to. */
  function sealer(state: { me: string | null; open: boolean; refuse?: boolean }) {
    const asked: string[] = [];
    const s: KeySealer = {
      identity: async () => state.me,
      sealTarget: async () => (state.open ? state.me : null),
      seal: async (to, plain) => `sealed:${to}:${plain}`,
      open: async (from, payload, reason) => {
        asked.push(reason);
        if (state.refuse) { const e = new Error('Nothing was done: your key is still locked.'); e.name = 'KeyLockedError'; throw e; }
        const [, to, plain] = payload.split(':');
        if (to !== from) throw new Error('not sealed to this key');
        return plain;
      },
    };
    return { s, asked };
  }

  beforeEach(deleteDb);
  afterEach(deleteDb);

  it('seals a new key to the person\'s Nostr key, keeps no plain secret, and opens it after a reload with the reason', async () => {
    const state = { me: ME, open: true };
    const first = await new ManifestSigningKeyStore(sealer(state).s).getOrCreate(() => ml_dsa65.keygen());
    const stored = await rawCurrent();
    expect(stored?.secretKey).toBeUndefined();
    expect((stored?.sealed as { to: string }).to).toBe(ME);
    const { s, asked } = sealer(state);
    const again = await new ManifestSigningKeyStore(s).getOrCreate(() => ml_dsa65.keygen());
    expect(again.secretKey).toEqual(first.secretKey);
    expect(again.publicKey).toEqual(first.publicKey);
    expect(asked).toEqual(['signing with your post-quantum key']);
  });

  it('stays as it is while there is no Nostr key, or it is locked, and is sealed once it can be without asking', async () => {
    const state = { me: null as string | null, open: false };
    const plain = await new ManifestSigningKeyStore(sealer(state).s).getOrCreate(() => ml_dsa65.keygen());
    expect((await rawCurrent())?.secretKey).toBeDefined();
    state.me = ME;
    const locked = new ManifestSigningKeyStore(sealer(state).s);
    await locked.sealNow();
    expect((await rawCurrent())?.secretKey).toBeDefined();
    state.open = true;
    await locked.sealNow();
    expect((await rawCurrent())?.secretKey).toBeUndefined();
    const reopened = await new ManifestSigningKeyStore(sealer(state).s).getOrCreate(() => ml_dsa65.keygen());
    expect(reopened.secretKey).toEqual(plain.secretKey);
  });

  it('fails the act when the person keeps their key locked, replaces nothing, and asks again next time', async () => {
    const state = { me: ME, open: true, refuse: false };
    const original = await new ManifestSigningKeyStore(sealer(state).s).getOrCreate(() => ml_dsa65.keygen());
    state.refuse = true;
    const store = new ManifestSigningKeyStore(sealer(state).s);
    await expect(store.getOrCreate(() => ml_dsa65.keygen())).rejects.toMatchObject({ name: 'KeyLockedError' });
    expect((await rawCurrent())?.sealed).toBeDefined();
    await expect(store.getPrevious()).resolves.toBeUndefined();
    state.refuse = false;
    expect((await store.getOrCreate(() => ml_dsa65.keygen())).secretKey).toEqual(original.secretKey);
  });

  it('makes a new key when the one here was sealed to a key this browser no longer holds, keeping only the old public half', async () => {
    const state = { me: ME, open: true };
    const old = await new ManifestSigningKeyStore(sealer(state).s).getOrCreate(() => ml_dsa65.keygen());
    state.me = OTHER;
    const store = new ManifestSigningKeyStore(sealer(state).s);
    const fresh = await store.getOrCreate(() => ml_dsa65.keygen());
    expect(fresh.publicKey).not.toEqual(old.publicKey);
    const previous = await store.getPrevious();
    expect(previous?.publicKey).toEqual(old.publicKey);
    expect(previous?.secretKey).toBeUndefined();
    expect(((await rawCurrent())?.sealed as { to: string }).to).toBe(OTHER);
  });

  it('retires a sealed key on rotation as its public half alone', async () => {
    const state = { me: ME, open: true };
    const store = new ManifestSigningKeyStore(sealer(state).s);
    const original = await store.getOrCreate(() => ml_dsa65.keygen());
    await store.rotate(() => ml_dsa65.keygen());
    const previous = await store.getPrevious();
    expect(previous?.publicKey).toEqual(original.publicKey);
    expect(previous?.secretKey).toBeUndefined();
    expect(await rawCurrent('previous')).not.toHaveProperty('sealed');
  });
});

