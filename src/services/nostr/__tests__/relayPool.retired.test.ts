/**
 * Nothing under a retired key reaches a reader (decision MX31): once a publisher's next key speaks, nothing signed
 * by its exposed key is read, whichever reader asked, and nothing sealed under it is opened. Real sockets against a
 * stand-in relay, with a stand-in for the config whose next key has started, as the cut-over day's config will say.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, type Event, type SimplePool } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils';

/** The publisher's two keys, as secrets: the first exposed, the next started on 1 October. */
const secrets = vi.hoisted(() => ({ old: '11'.repeat(32), next: '22'.repeat(32) }));
vi.mock('../../../config/publicInfrastructure', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config/publicInfrastructure')>();
  const tools = await import('nostr-tools');
  const utils = await import('@noble/hashes/utils');
  const old = tools.getPublicKey(utils.hexToBytes(secrets.old));
  const next = tools.getPublicKey(utils.hexToBytes(secrets.next));
  return {
    ...actual,
    MECHA_JONO_KEYS: [next, old],
    EXPOSED_KEYS: { [old]: '2026-09-28' },
    KEY_STARTS: { [old]: '2025-01-01T00:00:00Z', [next]: '2026-10-01T00:00:00Z' },
  };
});

import { createRelayPool } from '../relayPool';
import { standInRelay, stopStandInRelays } from './standInRelay';
import { sealAndWrap, unwrapGift } from '../giftWrap';
import nostrService from '../../nostrService';

const OLD = hexToBytes(secrets.old);
const NEXT = hexToBytes(secrets.next);
const note = (secretKey: Uint8Array, content: string): Event =>
  finalizeEvent({ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content }, secretKey);

const pools: SimplePool[] = [];
afterEach(async () => {
  for (const p of pools.splice(0)) p.destroy();
  await stopStandInRelays();
});

function readAll(relays: string[]): Promise<string[]> {
  const pool = createRelayPool();
  pools.push(pool);
  return new Promise((resolve) => {
    const contents: string[] = [];
    const sub = pool.subscribeMany(relays, { kinds: [1] }, {
      maxWait: 2000,
      onevent: (event) => contents.push(event.content),
      oneose: () => sub.close('read everything'),
      onclose: () => resolve(contents),
    });
  });
}

describe('a retired key', () => {
  it('reaches no reader through the pool; the publisher\'s next key and anyone else do', async () => {
    const relay = await standInRelay({ requiresSignIn: false, held: [note(OLD, 'under the old key'), note(NEXT, 'under the next key'), note(generateSecretKey(), 'from someone else')] });
    expect((await readAll([relay.url])).sort()).toEqual(['from someone else', 'under the next key']);
  });

  it('is not opened when it sealed a message', async () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); }, clear: () => store.clear(), key: () => null, get length() { return store.size; },
    };
    const reader = generateSecretKey();
    nostrService.forgetIdentity();
    await nostrService.importNsec(nip19.nsecEncode(OLD));
    const wrap = await sealAndWrap({ kind: 14, tags: [], content: 'hello' }, getPublicKey(reader));
    nostrService.forgetIdentity();
    await nostrService.importNsec(nip19.nsecEncode(reader));
    expect(await unwrapGift(wrap)).toEqual({ refused: 'Sealed under a key no longer read: its secret was exposed, and its publisher now signs with a newer key.' });
  });
});
