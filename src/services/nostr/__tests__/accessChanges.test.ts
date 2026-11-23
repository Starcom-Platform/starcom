/**
 * When what this browser can read changes (plan 0.3; the cohort audit of 2026-10-19): a key made here, an extension
 * answering, a team relay joined. Each long read starts again on it, since a relay that requires sign-in refuses a
 * read started before, and the read stays refused until it starts again.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { onAccessChange } from '../accessChanges';
import nostrService from '../../nostrService';
import { nostrIdentityService } from '../../identity/NostrIdentityService';
import { joinRelay } from '../joinedRelays';

function installStorageShim(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}

beforeEach(() => { installStorageShim(); nostrService.forgetIdentity(); delete (globalThis as { nostr?: unknown }).nostr; });

describe('onAccessChange', () => {
  it('is told when a key is made here, when an extension answers, and when a team relay is joined; never on subscribing', async () => {
    const told = vi.fn();
    const stop = onAccessChange(told);
    expect(told).not.toHaveBeenCalled();

    nostrService.ensureIdentity('writing a report');
    expect(told).toHaveBeenCalledTimes(1);

    const secret = generateSecretKey();
    (globalThis as { nostr?: unknown }).nostr = { getPublicKey: async () => getPublicKey(secret), signEvent: async (e: never) => finalizeEvent(e, secret) };
    await nostrIdentityService.refreshSigner();
    expect(told).toHaveBeenCalledTimes(2);

    joinRelay({ url: 'wss://relay.newark.example', relayPubkey: '9'.repeat(64), team: 'Newark desk' });
    expect(told).toHaveBeenCalledTimes(3);

    stop();
    joinRelay({ url: 'wss://relay.other.example', relayPubkey: '8'.repeat(64), team: 'Other desk' });
    expect(told).toHaveBeenCalledTimes(3);
  });
});
