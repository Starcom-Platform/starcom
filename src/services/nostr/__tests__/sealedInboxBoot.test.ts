/**
 * The sealed inbox runs for the whole session (plan items 2.4 and 2.7), and listens
 * again whenever who it listens as, or where, changes: a key made here, an
 * extension answering, a team relay joined. Otherwise a person's first key,
 * made mid-session, would never hear what is sent to it.
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import { startSealedInboxAtBoot } from '../sealedInbox';
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

describe('the inbox at boot', () => {
  it('listens again when a key is made here, when an extension answers, and when a team relay is joined; and stops', async () => {
    const stops: Array<ReturnType<typeof vi.fn>> = [];
    const start = vi.fn(() => { const stop = vi.fn(); stops.push(stop); return stop; });
    const stopAll = startSealedInboxAtBoot({}, start);
    expect(start).toHaveBeenCalledTimes(1);

    nostrService.ensureIdentity('writing a report');
    expect(start).toHaveBeenCalledTimes(2);
    expect(stops[0]).toHaveBeenCalled();

    const secret = generateSecretKey();
    (globalThis as { nostr?: unknown }).nostr = { getPublicKey: async () => getPublicKey(secret), signEvent: async (e: never) => finalizeEvent(e, secret) };
    await nostrIdentityService.refreshSigner();
    expect(start).toHaveBeenCalledTimes(3);

    joinRelay({ url: 'wss://relay.newark.example', relayPubkey: '9'.repeat(64), team: 'Newark desk' });
    expect(start).toHaveBeenCalledTimes(4);

    stopAll();
    expect(stops[3]).toHaveBeenCalled();
    joinRelay({ url: 'wss://relay.other.example', relayPubkey: '8'.repeat(64), team: 'Other desk' });
    expect(start).toHaveBeenCalledTimes(4);
  });
});
