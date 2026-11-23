/**
 * Moving the key into Starcom Uplink (decision D-EX, E3, EX39, K6): Uplink takes it under a passphrase set
 * in its own window, then proves it signs as the same key, and only then does this page forget it. Any
 * step short of that moves nothing, and says why.
 *
 * Plain Node with a small localStorage, as nostrService's own tests run.
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
import { finalizeEvent, generateSecretKey, nip19 } from 'nostr-tools';
import { moveKeyToUplink } from '../moveKey';
import nostrService, { KEY_HELD_BY_UPLINK } from '../../services/nostrService';

afterEach(() => { nostrService.forgetIdentity(); localStorage.clear(); vi.restoreAllMocks(); });

const answer = (result: unknown) => ({ kind: 'answer', id: 'x', ok: true, result });
const no = (refusal: string, reason: string) => ({ kind: 'answer', id: 'x', ok: false, refusal, reason });

/** Uplink as it would answer, holding the key it was handed. */
function uplinkHolding(over: { importAs?: string; signWith?: Uint8Array; refuse?: ReturnType<typeof no> } = {}) {
  let held: Uint8Array | null = null;
  const asked: string[] = [];
  const ask = vi.fn(async (capability: string, purpose: string, args: { nsec?: string; event?: Parameters<typeof finalizeEvent>[0] }) => {
    asked.push(`${capability} | ${purpose}`);
    if (over.refuse) return over.refuse;
    if (capability === 'signer.import') {
      held = nip19.decode(args.nsec!).data as Uint8Array;
      return answer({ pubkey: over.importAs ?? nostrService.getPublicKey() });
    }
    return answer({ event: finalizeEvent({ ...args.event! }, over.signWith ?? held!) });
  });
  return { ask, asked };
}

describe('moveKeyToUplink', () => {
  it('moves the key once Uplink proves it signs as the same key, and only then forgets it here', async () => {
    const mine = nostrService.ensureIdentity('a test');
    const { ask, asked } = uplinkHolding();
    const refresh = vi.fn(async () => null);
    expect(await moveKeyToUplink({ ask: ask as never, refresh })).toBe(mine);
    expect(asked).toEqual([
      'signer.import | Move your key into Uplink, where Starcom\'s page cannot read it',
      'signer.sign | Check that Uplink signs as you, before Starcom forgets your key',
    ]);
    expect(nostrService.holdsOwnKey()).toBe(false);
    expect(localStorage.getItem(KEY_HELD_BY_UPLINK)).toBe(mine);
    expect(refresh).toHaveBeenCalled();
  });

  it('moves nothing when Uplink took a different key', async () => {
    nostrService.ensureIdentity('a test');
    const { ask } = uplinkHolding({ importAs: 'f'.repeat(64) });
    await expect(moveKeyToUplink({ ask: ask as never, refresh: async () => null })).rejects.toThrow('Uplink took a different key, so nothing was moved.');
    expect(nostrService.holdsOwnKey()).toBe(true);
  });

  it('moves nothing when Uplink does not sign as the person', async () => {
    nostrService.ensureIdentity('a test');
    const { ask } = uplinkHolding({ signWith: generateSecretKey() });
    await expect(moveKeyToUplink({ ask: ask as never, refresh: async () => null })).rejects.toThrow('Uplink did not sign as you, so nothing was moved.');
    expect(nostrService.holdsOwnKey()).toBe(true);
    expect(localStorage.getItem(KEY_HELD_BY_UPLINK)).toBeNull();
  });

  it('moves nothing when the person declines, and says so', async () => {
    nostrService.ensureIdentity('a test');
    const { ask } = uplinkHolding({ refuse: no('declined', 'you did not set a passphrase') });
    await expect(moveKeyToUplink({ ask: ask as never, refresh: async () => null })).rejects.toThrow('You declined: you did not set a passphrase');
    expect(nostrService.holdsOwnKey()).toBe(true);
  });

  it('says there is nothing to move when this browser holds no key', async () => {
    await expect(moveKeyToUplink({ ask: vi.fn() as never, refresh: async () => null })).rejects.toThrow('This browser holds no key to move.');
  });
});
