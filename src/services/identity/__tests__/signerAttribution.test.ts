/**
 * Attribution follows the signer (plan item 2.2).
 *
 * Records were attributed to this browser's local key, and authoring minted
 * one whenever there was none, even with a signer extension installed. So a
 * case created by a person whose extension signs everything was recorded under
 * a second key they had never seen, and the publish review named that key as
 * the signer while the extension signed with another.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nostrService from '../../nostrService';
import { nostrIdentityService } from '../NostrIdentityService';

function installStorageShim(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

const EXTENSION_PUBKEY = 'e'.repeat(64);
const withExtension = (getPublicKey: () => Promise<string>) => {
  (globalThis as { nostr?: unknown }).nostr = {
    getPublicKey,
    signEvent: async (event: Record<string, unknown>) => ({ ...event, pubkey: EXTENSION_PUBKEY, sig: 'x', id: 'y' }),
  };
};

beforeEach(() => {
  installStorageShim();
  nostrService.forgetIdentity();
  localStorage.clear();
});

afterEach(() => {
  delete (globalThis as { nostr?: unknown }).nostr;
  nostrService.forgetIdentity();
  localStorage.clear();
});

describe('who signs, known without asking each time', () => {
  it('is nobody before anything has signed, and asking creates nothing', async () => {
    expect(nostrIdentityService.signerPubkey()).toBeNull();
    expect(await nostrIdentityService.refreshSigner()).toBeNull();
    expect(nostrService.hasIdentity()).toBe(false);
  });

  it("is the extension's key once the extension has answered, and not this browser's before", async () => {
    nostrService.ensureIdentity('sending a chat message');
    await nostrIdentityService.refreshSigner();
    withExtension(async () => EXTENSION_PUBKEY);
    // It appeared after the last answer: who signs is not known until it is asked,
    // and this browser's key, which it will not sign with, is not the answer.
    expect(nostrIdentityService.signerPubkey()).toBeNull();

    await nostrIdentityService.refreshSigner();
    expect(nostrIdentityService.signerPubkey()).toBe(EXTENSION_PUBKEY);
  });

  it("follows this browser's key through an import and a delete", () => {
    const created = nostrService.ensureIdentity('sending a chat message');
    expect(nostrIdentityService.signerPubkey()).toBe(created);
    nostrService.forgetIdentity();
    expect(nostrIdentityService.signerPubkey()).toBeNull();
  });
});

describe('the key a record is authored under', () => {
  it("is the extension's, and no local key is made", async () => {
    withExtension(async () => EXTENSION_PUBKEY);
    expect(await nostrIdentityService.ensureSigner('creating a case')).toBe(EXTENSION_PUBKEY);
    expect(nostrService.hasIdentity()).toBe(false);
  });

  it("is this browser's, created for the reason given, when there is no extension", async () => {
    const pubkey = await nostrIdentityService.ensureSigner('creating a case');
    expect(pubkey).toBe(nostrService.getPublicKey());
    expect(nostrIdentityService.signerPubkey()).toBe(pubkey);
  });

  it("falls back to this browser's when the person declines the extension, as whoAmI does", async () => {
    withExtension(async () => { throw new Error('user rejected'); });
    const pubkey = await nostrIdentityService.ensureSigner('creating a case');
    expect(pubkey).toBe(nostrService.getPublicKey());
    expect(nostrIdentityService.signerPubkey()).toBe(pubkey);
  });
});
