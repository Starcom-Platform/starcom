/**
 * The sealed inbox (plan items 2.4 and 2.7): each wrap addressed to this key
 * is opened once and handed on by the kind inside. Relays send the same wraps
 * again after a reload, and a post-quantum chat message cannot be opened
 * twice, so what was opened is remembered by id across reloads.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { acceptWrap, unreadableWraps } from '../sealedInbox';
import { sealAndWrap } from '../giftWrap';
import nostrService from '../../nostrService';
import { nostrIdentityService } from '../../identity/NostrIdentityService';

function installStorageShim(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  return store;
}
const become = (secret: Uint8Array) => { nostrService.forgetIdentity(); return nostrService.importNsec(nip19.nsecEncode(secret)); };

let aishaKey: Uint8Array;
let aisha: string;
beforeEach(() => {
  installStorageShim();
  aishaKey = generateSecretKey();
  aisha = getPublicKey(aishaKey);
});

describe('the sealed inbox', () => {
  it('hands each wrap on by the kind inside, once, even when a relay sends it again after a reload', async () => {
    const priya = become(generateSecretKey());
    const chatWrap = await sealAndWrap({ kind: 20095, tags: [['p', aisha]], content: 'hello' }, aisha);
    const partWrap = await sealAndWrap({ kind: 20094, tags: [['bundle', 'b'], ['part', '0', '1']], content: '{}' }, aisha);
    become(aishaKey);
    const chat = vi.fn();
    const part = vi.fn();
    const handlers = { 20095: chat, 20094: part };

    expect(await acceptWrap(chatWrap, aisha, handlers)).toBe(true);
    expect(await acceptWrap(partWrap, aisha, handlers)).toBe(true);
    expect(chat).toHaveBeenCalledWith(expect.objectContaining({ sender: priya, rumor: expect.objectContaining({ kind: 20095, content: 'hello' }) }));
    expect(part).toHaveBeenCalledTimes(1);

    // The same wraps again, as after a reload: nothing is opened twice.
    expect(await acceptWrap(chatWrap, aisha, handlers)).toBe(false);
    expect(await acceptWrap(JSON.parse(JSON.stringify(partWrap)), aisha, handlers)).toBe(false);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(part).toHaveBeenCalledTimes(1);
  });

  it('opens a wrap arriving twice at once, from two relays, only once', async () => {
    become(generateSecretKey());
    const wrap = await sealAndWrap({ kind: 20095, tags: [['p', aisha]], content: 'twice' }, aisha);
    become(aishaKey);
    const chat = vi.fn();
    const both = await Promise.all([acceptWrap(wrap, aisha, { 20095: chat }), acceptWrap(wrap, aisha, { 20095: chat })]);
    expect(both.filter(Boolean)).toHaveLength(1);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('keeps nothing addressed to someone else, and says why what it could not open was not opened', async () => {
    become(generateSecretKey());
    const forChen = await sealAndWrap({ kind: 20095, tags: [], content: 'for chen' }, getPublicKey(generateSecretKey()));
    const forAisha = await sealAndWrap({ kind: 20095, tags: [], content: 'for aisha' }, aisha);
    become(aishaKey);
    const chat = vi.fn();
    // Not even asked to decrypt: with an extension, that would be a prompt for nothing.
    const decrypt = vi.spyOn(nostrIdentityService, 'nip44Decrypt');
    const before = unreadableWraps().length;
    expect(await acceptWrap(forChen, aisha, { 20095: chat })).toBe(false);
    expect(decrypt).not.toHaveBeenCalled();
    // Nor listed as something that could not be opened: it was never this key's to open.
    expect(unreadableWraps().length).toBe(before);
    decrypt.mockRestore();
    const damaged = { ...JSON.parse(JSON.stringify(forAisha)), content: forAisha.content.slice(0, -8) + 'AAAAAAAA' };
    expect(await acceptWrap(damaged, aisha, { 20095: chat })).toBe(false);
    expect(chat).not.toHaveBeenCalled();
    expect(unreadableWraps().length).toBeGreaterThan(0);
  });
});
