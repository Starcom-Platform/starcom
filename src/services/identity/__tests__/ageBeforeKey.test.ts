/**
 * No key for anyone under 13 (decision D-RS, RS39): Starcom makes none and signs nothing with one it has, so nothing
 * is posted. The first time a key would be made, it is asked first, where something on screen can ask; where
 * nothing can (this test, a script), a key is made as before.
 *
 * Node, with a storage shim, as identityLifecycle.test.ts explains: under jsdom nostr-tools will not sign.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nostrService from '../../nostrService';
import { nostrIdentityService } from '../NostrIdentityService';
import { AgeNeededError, UNDER_13_REFUSAL, UnderThirteenError, registerAgeAsker, resetAge, setAgeAnswer } from '../ageAnswer';

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

const event = { kind: 1, content: 'hello', tags: [], created_at: 1_792_200_000 };

beforeEach(() => {
  installStorageShim();
  nostrService.forgetIdentity();
  resetAge();
  registerAgeAsker(null);
});
afterEach(() => { nostrService.forgetIdentity(); resetAge(); registerAgeAsker(null); });

describe('under 13', () => {
  it('makes no key', () => {
    setAgeAnswer('under_13');
    expect(() => nostrService.ensureIdentity('sending a chat message')).toThrow(UnderThirteenError);
    expect(nostrService.hasIdentity()).toBe(false);
    expect(() => nostrService.ensureIdentity('x')).toThrow(UNDER_13_REFUSAL);
  });

  it('signs nothing with a key this browser already has', async () => {
    nostrService.ensureIdentity('an earlier visit');
    setAgeAnswer('under_13');
    expect(() => nostrService.signEvent(event)).toThrow(UnderThirteenError);
    await expect(nostrIdentityService.signWithExisting(event)).rejects.toThrow(UnderThirteenError);
    await expect(nostrIdentityService.asSigner().signEvent(event)).rejects.toThrow(UnderThirteenError);
  });
});

describe('under 13, with a browser extension', () => {
  afterEach(() => { delete (globalThis as { nostr?: unknown }).nostr; });

  it('has nothing signed by the extension\'s key either', async () => {
    let signed = 0;
    (globalThis as { nostr?: unknown }).nostr = {
      getPublicKey: async () => 'e'.repeat(64),
      signEvent: async (e: Record<string, unknown>) => { signed += 1; return { ...e, id: 'x', pubkey: 'e'.repeat(64), sig: 'y' }; },
    };
    // With an answer kept that lets it sign, the extension signs.
    setAgeAnswer('18_plus');
    await nostrIdentityService.signWithExisting(event);
    expect(signed).toBe(1);
    resetAge();
    setAgeAnswer('under_13');
    await expect(nostrIdentityService.signWithExisting(event)).rejects.toThrow(UnderThirteenError);
    await expect(nostrIdentityService.asSigner().signEvent(event)).rejects.toThrow(UnderThirteenError);
    expect(signed).toBe(1);
  });
});

describe('before a first key', () => {
  it('asks, where something can, and makes none until it is answered', () => {
    let asked = 0;
    registerAgeAsker(async () => { asked += 1; return null; });
    expect(() => nostrService.ensureIdentity('sending a chat message')).toThrow(AgeNeededError);
    expect(asked).toBe(1);
    expect(nostrService.hasIdentity()).toBe(false);
    setAgeAnswer('16_17');
    expect(nostrService.ensureIdentity('sending a chat message')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('makes one as before where nothing can ask', () => {
    expect(nostrService.ensureIdentity('a script')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('asks nothing when a key is already there', () => {
    nostrService.ensureIdentity('an earlier visit');
    let asked = 0;
    registerAgeAsker(async () => { asked += 1; return null; });
    expect(nostrService.signEvent(event).sig).toMatch(/^[0-9a-f]{128}$/);
    expect(asked).toBe(0);
  });
});
