/**
 * Starcom Uplink holding the person's key (decision D-EX, E3, EX39, K5–K6): with Uplink's signer set,
 * chat signs through it and never with a key in this page; the key is handed over only to the same key,
 * and once it is, this browser never makes a second one while Uplink is away. Bringing the key back from
 * a backup ends that.
 *
 * Plain Node, with a small localStorage, for the reason nostrService.sendMessageBackoff.test.ts gives.
 *
 * @vitest-environment node
 */
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string): void { this.store.set(key, value); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, type EventTemplate } from 'nostr-tools';
import nostrService, { KEY_HELD_BY_UPLINK } from '../nostrService';

afterEach(() => {
  nostrService.useSigner(null);
  nostrService.forgetIdentity();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('nostrService with Uplink holding the key', () => {
  it('signs chat through Uplink, holding no key in this page', async () => {
    const uplinkKey = generateSecretKey();
    const signed: EventTemplate[] = [];
    nostrService.useSigner(async (template) => { signed.push(template); return finalizeEvent(template, uplinkKey); }, getPublicKey(uplinkKey));
    const published: Array<{ pubkey: string; kind: number }> = [];
    vi.spyOn(nostrService.pool, 'publish').mockImplementation((_relays, event) => { published.push(event as never); return [Promise.resolve('ok')]; });

    expect(await nostrService.sendMessage('chan-1', 'On my way.')).toBe(true);
    expect(signed).toHaveLength(1);
    expect(signed[0].kind).toBe(42);
    expect(published[0].pubkey).toBe(getPublicKey(uplinkKey));
    expect(localStorage.getItem('nostr_secret_key')).toBeNull();
    expect(nostrService.ensureIdentity('sending a chat message')).toBe(getPublicKey(uplinkKey));
  });

  it('hands the key over only to the same key, then forgets it here and keeps whose it was', () => {
    const mine = nostrService.ensureIdentity('a test');
    expect(() => nostrService.handOverToUplink('f'.repeat(64))).toThrow('Uplink holds a different key than this browser.');
    nostrService.handOverToUplink(mine);
    expect(localStorage.getItem('nostr_secret_key')).toBeNull();
    expect(localStorage.getItem(KEY_HELD_BY_UPLINK)).toBe(mine);
    expect(nostrService.getPublicKey()).toBe(mine);
    expect(() => nostrService.exportNsec()).toThrow();
  });

  it('never makes a second key while Uplink holds the first and is away', () => {
    const mine = nostrService.ensureIdentity('a test');
    nostrService.handOverToUplink(mine);
    expect(() => nostrService.ensureIdentity('sending a chat message')).toThrow(/Your key is in Starcom Uplink/);
    expect(localStorage.getItem('nostr_secret_key')).toBeNull();
    expect(nostrService.getPublicKey()).toBe(mine);
  });

  it('says where the key is when asked to sign or seal while Uplink is away, and makes none', () => {
    const mine = nostrService.ensureIdentity('a test');
    nostrService.handOverToUplink(mine);
    const event = { kind: 1, content: 'x', tags: [], created_at: 1 };
    expect(() => nostrService.signEvent(event)).toThrow(/Your key is in Starcom Uplink/);
    expect(() => nostrService.nip44Encrypt('a'.repeat(64), 'x')).toThrow(/Your key is in Starcom Uplink/);
    expect(localStorage.getItem('nostr_secret_key')).toBeNull();
  });

  it('holds the key here again when the person brings it back from a backup', () => {
    const secret = generateSecretKey();
    const mine = getPublicKey(secret);
    localStorage.setItem(KEY_HELD_BY_UPLINK, mine);
    expect(nostrService.importNsec(nip19.nsecEncode(secret))).toBe(mine);
    expect(localStorage.getItem(KEY_HELD_BY_UPLINK)).toBeNull();
    expect(nostrService.ensureIdentity('a test')).toBe(mine);
  });
});
