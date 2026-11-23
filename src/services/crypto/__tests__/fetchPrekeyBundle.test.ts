/**
 * fetchPrekeyBundles — Cycle B1, and each device since plan item 9.11. The read counterpart to the already-real
 * publishPrekeyBundle: without this, a sender has no way to obtain a real
 * remote contact's public bundle to encapsulate against, so the X3DH flow
 * had no way to ever run against an actual peer.
 *
 * Real crypto (a genuine ForwardSecrecyService-generated bundle), only the
 * Nostr transport (pool.querySync) is swapped for a mock — same style as
 * MissionPackageBroadcastService.test.ts / nostrIntelBroadcast.integration.test.ts.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import nostrService from '../../nostrService';
import { fetchPrekeyBundles, publishPrekeyBundle, publishPQCPublicKey } from '../PQCKeyPublisher';
import { ForwardSecrecyService } from '../ForwardSecrecyService';
import type { PQCKeyStore, StoredKEMKey } from '../PQCKeyStore';

/*
 * An identity to publish for. Publishing encryption keys refuses when a browser has
 * none — keys are published for an identity a person already created, not one made
 * on the publisher's say-so — so the publish cases need one first, as the app does.
 * Node has no localStorage, so this key lives in memory for the file's run only.
 */
beforeAll(() => {
  nostrService.ensureIdentity('a test');
});

const toHex = (buf: Uint8Array) => Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');

describe('fetchPrekeyBundles', () => {
  const originalPool = nostrService.pool;

  afterEach(() => {
    nostrService.pool = originalPool;
  });

  const contentOf = (bundle: Awaited<ReturnType<ForwardSecrecyService['generatePrekeyBundle']>>['bundle']) => JSON.stringify({
    identityKey: toHex(bundle.identityKey),
    signedPrekey: toHex(bundle.signedPrekey),
    signedPrekeySignature: toHex(bundle.signedPrekeySignature),
    signedPrekeyCreatedAt: bundle.signedPrekeyCreatedAt,
    oneTimePrekeys: bundle.oneTimePrekeys.map(toHex),
  });
  const serve = (events: unknown[]) => {
    const querySync = vi.fn().mockResolvedValue(events);
    (nostrService as unknown as { pool: { querySync: typeof querySync } }).pool = { querySync };
  };
  const at = (d: string, content: string, pubkey = 'peer-pubkey') =>
    ({ kind: 30078, created_at: Math.floor(Date.now() / 1000), content, tags: [['d', d]], id: `evt-${d}-${pubkey}`, pubkey, sig: 'sig' });

  it('reconstructs the exact bundle from a real published-shaped event — full hex round trip', async () => {
    const { bundle } = await new ForwardSecrecyService().generatePrekeyBundle('peer-pubkey');
    serve([at('pqc-prekey-bundle:dev-a', contentOf(bundle))]);

    const [fetched] = await fetchPrekeyBundles('peer-pubkey');

    expect(fetched.device).toBe('dev-a');
    expect(fetched.bundle.identityKey).toEqual(bundle.identityKey);
    expect(fetched.bundle.signedPrekey).toEqual(bundle.signedPrekey);
    expect(fetched.bundle.signedPrekeySignature).toEqual(bundle.signedPrekeySignature);
    expect(fetched.bundle.oneTimePrekeys).toEqual(bundle.oneTimePrekeys);
    expect(fetched.bundle.signedPrekeyCreatedAt).toBe(bundle.signedPrekeyCreatedAt);
  });

  it('returns none, not a throw, when the peer has not published a bundle', async () => {
    serve([]);
    expect(await fetchPrekeyBundles('nobody-pubkey')).toEqual([]);
  });

  it("takes no bundle from another key, and none of the person's other app data", async () => {
    const { bundle } = await new ForwardSecrecyService().generatePrekeyBundle('peer-pubkey');
    serve([
      at('pqc-prekey-bundle:dev-m', contentOf(bundle), 'mallory-pubkey'),
      at('some-other-app:settings', contentOf(bundle)),
      at('pqc-prekey-bundle:dev-a', contentOf(bundle)),
    ]);
    expect((await fetchPrekeyBundles('peer-pubkey')).map((g) => g.device)).toEqual(['dev-a']);
  });

  it('leaves out a malformed bundle and keeps the rest', async () => {
    const { bundle } = await new ForwardSecrecyService().generatePrekeyBundle('peer-pubkey');
    serve([at('pqc-prekey-bundle:dev-bad', '{not json'), at('pqc-prekey-bundle:dev-a', contentOf(bundle))]);
    expect((await fetchPrekeyBundles('peer-pubkey')).map((g) => g.device)).toEqual(['dev-a']);
  });
});

/**
 * publishPrekeyBundle/publishPQCPublicKey — Cycle B1 hardening pass.
 *
 * Neither had a direct test before this: SecureChatIntegrationService only
 * ever calls publishPrekeyBundle fire-and-forget with its own errors
 * swallowed (`.catch(err => log.warn(...))`), so a real regression here
 * would never have surfaced as a test failure anywhere. While tracking down
 * an unrelated jsdom-only "expected Uint8Array, got object" artifact
 * (jsdom's own TextEncoder constructs Uint8Arrays in a different VM realm
 * than the outer Node process, which nostr-tools' bundled @noble/hashes
 * then rejects via instanceof — confirmed absent under the Node test
 * environment, and not reproducible in a real browser's single-realm
 * TextEncoder, so this is a jsdom test-environment artifact, not a
 * production bug) this file's dynamic `await import('nostr-tools')` was
 * also simplified to a static import — not the actual fix for that
 * artifact, but a legitimate cleanup (the "avoid circular deps" comment
 * was stale: nostr-tools is a third-party package with no path back into
 * this app's own modules, so no such cycle was ever possible).
 */
describe('publishPrekeyBundle', () => {
  const originalPool = nostrService.pool;
  afterEach(() => { nostrService.pool = originalPool; });

  it('publishes a real, signed event and returns its id', async () => {
    const fs = new ForwardSecrecyService();
    const { bundle } = await fs.generatePrekeyBundle('local-identity');

    const publish = vi.fn().mockReturnValue([Promise.resolve()]);
    (nostrService as unknown as { pool: { publish: typeof publish } }).pool = { publish };

    const eventId = await publishPrekeyBundle(bundle, 'dev-a');

    expect(typeof eventId).toBe('string');
    expect(eventId!.length).toBe(64);
    expect(publish).toHaveBeenCalledOnce();
    const [, publishedEvent] = publish.mock.calls[0];
    expect(publishedEvent.kind).toBe(30078);
    expect(publishedEvent.sig).toBeDefined();
    expect(JSON.parse(publishedEvent.content).oneTimePrekeys).toHaveLength(bundle.oneTimePrekeys.length);
  });

  it('returns null, not a throw, when every relay rejects the publish', async () => {
    const fs = new ForwardSecrecyService();
    const { bundle } = await fs.generatePrekeyBundle('local-identity');

    const publish = vi.fn().mockReturnValue([Promise.reject(new Error('relay closed'))]);
    (nostrService as unknown as { pool: { publish: typeof publish } }).pool = { publish };

    await expect(publishPrekeyBundle(bundle, 'dev-a')).resolves.toBeNull();
  });
});

describe('publishPQCPublicKey', () => {
  const originalPool = nostrService.pool;
  afterEach(() => { nostrService.pool = originalPool; });

  function makeFakeKeyStore(current: StoredKEMKey | undefined): PQCKeyStore & { putCalls: StoredKEMKey[] } {
    const putCalls: StoredKEMKey[] = [];
    return {
      putCalls,
      async get(id: string) { return id === 'current' ? current : undefined; },
      async put(key: StoredKEMKey) { putCalls.push(key); },
      async delete() {},
      async listAll() { return current ? [current] : []; },
      async needsRotation() { return false; },
      async rotate(pub: Uint8Array, priv: Uint8Array) {
        const rotated: StoredKEMKey = { id: 'current', publicKey: pub, privateKey: priv, algorithm: 'ML-KEM-768', createdAt: Date.now(), expiresAt: Date.now(), graceExpiresAt: Date.now() };
        return rotated;
      },
    } as PQCKeyStore & { putCalls: StoredKEMKey[] };
  }

  it('publishes the current key and records the event id back into the key store', async () => {
    const current: StoredKEMKey = {
      id: 'current',
      publicKey: new Uint8Array(1184).fill(7),
      privateKey: new Uint8Array(2400).fill(9),
      algorithm: 'ML-KEM-768',
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000,
      graceExpiresAt: Date.now() + 2000,
    };
    const keyStore = makeFakeKeyStore(current);

    const publish = vi.fn().mockReturnValue([Promise.resolve()]);
    (nostrService as unknown as { pool: { publish: typeof publish } }).pool = { publish };

    const eventId = await publishPQCPublicKey(keyStore);

    expect(typeof eventId).toBe('string');
    expect(keyStore.putCalls).toHaveLength(1);
    expect(keyStore.putCalls[0].nostrEventId).toBe(eventId);
  });

  it('returns null without publishing when there is no current key', async () => {
    const keyStore = makeFakeKeyStore(undefined);
    const publish = vi.fn();
    (nostrService as unknown as { pool: { publish: typeof publish } }).pool = { publish };

    const eventId = await publishPQCPublicKey(keyStore);

    expect(eventId).toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });
});

/*
 * Each device published its bundle at the same address, and senders took the
 * newest, so each device broke the other's post-quantum messages (plan item
 * 9.11). A device now publishes at its own address, and a sender seals to every
 * device of the person it writes to (decision G2).
 */
describe('fetchPrekeyBundles — one per device', () => {
  const originalPool = nostrService.pool;
  afterEach(() => { nostrService.pool = originalPool; });

  const now = Math.floor(Date.now() / 1000);
  const DAY = 24 * 60 * 60;
  const content = (b: Awaited<ReturnType<ForwardSecrecyService['generatePrekeyBundle']>>['bundle']) => JSON.stringify({
    identityKey: toHex(b.identityKey), signedPrekey: toHex(b.signedPrekey), signedPrekeySignature: toHex(b.signedPrekeySignature),
    signedPrekeyCreatedAt: b.signedPrekeyCreatedAt, oneTimePrekeys: b.oneTimePrekeys.map(toHex),
  });
  async function published(d: string, createdAt: number) {
    const { bundle } = await new ForwardSecrecyService().generatePrekeyBundle('peer-pubkey');
    return { bundle, event: { kind: 30078, created_at: createdAt, content: content(bundle), tags: [['d', d]], id: `evt-${d}-${createdAt}`, pubkey: 'peer-pubkey', sig: 'sig' } };
  }
  const serve = (events: unknown[]) => {
    const querySync = vi.fn().mockResolvedValue(events);
    (nostrService as unknown as { pool: { querySync: typeof querySync } }).pool = { querySync };
    return querySync;
  };

  it("asks for the person's own bundles, and returns the newest from each device", async () => {
    const aOld = await published('pqc-prekey-bundle:dev-a', now - 2 * DAY);
    const aNew = await published('pqc-prekey-bundle:dev-a', now - DAY);
    const b = await published('pqc-prekey-bundle:dev-b', now - 3 * DAY);
    const querySync = serve([aOld.event, aNew.event, b.event]);

    const got = await fetchPrekeyBundles('peer-pubkey');

    expect(querySync.mock.calls[0][1]).toMatchObject({ kinds: [30078], authors: ['peer-pubkey'] });
    expect(got.map((g) => g.device).sort()).toEqual(['dev-a', 'dev-b']);
    expect(got.find((g) => g.device === 'dev-a')!.bundle.identityKey).toEqual(aNew.bundle.identityKey);
  });

  it('leaves the old shared address alone once any device publishes its own', async () => {
    const legacy = await published('pqc-prekey-bundle', now);
    const a = await published('pqc-prekey-bundle:dev-a', now - DAY);
    serve([legacy.event, a.event]);
    expect((await fetchPrekeyBundles('peer-pubkey')).map((g) => g.device)).toEqual(['dev-a']);
  });

  it('uses the old shared address when no device has its own, as before', async () => {
    const legacy = await published('pqc-prekey-bundle', now);
    serve([legacy.event]);
    const got = await fetchPrekeyBundles('peer-pubkey');
    expect(got).toHaveLength(1);
    expect(got[0].device).toBeNull();
    expect(got[0].bundle.identityKey).toEqual(legacy.bundle.identityKey);
  });

  it('drops a device not seen for ninety days', async () => {
    const gone = await published('pqc-prekey-bundle:dev-gone', now - 91 * DAY);
    const here = await published('pqc-prekey-bundle:dev-here', now - DAY);
    serve([gone.event, here.event]);
    expect((await fetchPrekeyBundles('peer-pubkey')).map((g) => g.device)).toEqual(['dev-here']);
  });

  it('seals to at most five devices, the most recently seen', async () => {
    const events = [];
    for (let i = 0; i < 7; i++) events.push((await published(`pqc-prekey-bundle:dev-${i}`, now - i * DAY)).event);
    serve(events);
    expect((await fetchPrekeyBundles('peer-pubkey')).map((g) => g.device)).toEqual(['dev-0', 'dev-1', 'dev-2', 'dev-3', 'dev-4']);
  });

  it('publishes a device at its own address, and says which device it is', async () => {
    const { bundle } = await new ForwardSecrecyService().generatePrekeyBundle('local-identity');
    const publish = vi.fn().mockReturnValue([Promise.resolve()]);
    (nostrService as unknown as { pool: { publish: typeof publish } }).pool = { publish };
    await publishPrekeyBundle(bundle, 'dev-a');
    const [, event] = publish.mock.calls[0];
    expect(event.tags).toEqual(expect.arrayContaining([['d', 'pqc-prekey-bundle:dev-a'], ['device', 'dev-a']]));
  });
});
