/**
 * The passphrase lock on this browser's key (decision D-KL): kept as a NIP-49 ncryptsec beside its pubkey, the
 * plain copy removed, never both; opened once a visit, in memory only, when something the person did needs it;
 * never asked for by what runs on its own.
 *
 * A reload is the modules loaded afresh over the same storage. Plain Node, with a small localStorage, for the reason
 * nostrService.sendMessageBackoff.test.ts gives. scrypt runs at cost 4 here; the app's is 16.
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
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, verifyEvent, type Event } from 'nostr-tools';

const PASS = 'correct horse battery staple';
const COST = 4;
const PLAIN = 'nostr_secret_key';
const LOCKED = 'nostr_locked_key';
const template = () => ({ kind: 1, content: 'On my way.', tags: [] as string[][], created_at: 1_700_000_000 });

/** This browser's modules, loaded afresh: a page load, reading what was stored. */
async function load() {
  vi.resetModules();
  const svc = (await import('../nostrService')).default;
  const lock = await import('../identity/keyLock');
  return { svc, lock };
}

/** A key locked here, then a reload: what the next visit starts with. */
async function lockedVisit(secret: Uint8Array = generateSecretKey()) {
  const first = await load();
  first.svc.importNsec(nip19.nsecEncode(secret));
  await first.svc.lock(PASS, COST);
  return { ...(await load()), secret, pubkey: getPublicKey(secret) };
}

afterEach(async () => {
  const lock = await import('../identity/keyLock');
  lock.registerUnlockAsker(null);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('locking', () => {
  it('stores the key only as an ncryptsec beside its pubkey, and keeps it open for this visit', async () => {
    const { svc } = await load();
    const pubkey = svc.ensureIdentity('a test');
    await svc.lock(PASS, COST);

    expect(localStorage.getItem(PLAIN)).toBeNull();
    const stored = JSON.parse(localStorage.getItem(LOCKED)!);
    expect(stored.ncryptsec).toMatch(/^ncryptsec1/);
    expect(stored.pubkey).toBe(pubkey);
    expect(svc.lockState()).toBe('unlocked');
    expect(svc.signEvent(template()).pubkey).toBe(pubkey);
  });

  it('refuses a passphrase under 10 characters, and changes nothing', async () => {
    const { svc } = await load();
    svc.ensureIdentity('a test');
    await expect(svc.lock('too short', COST)).rejects.toThrow('A passphrase needs at least 10 characters.');
    expect(localStorage.getItem(PLAIN)).not.toBeNull();
    expect(localStorage.getItem(LOCKED)).toBeNull();
    expect(svc.lockState()).toBe('none');
  });

  it('tells its listeners when the key is locked, unlocked and its lock removed', async () => {
    const { svc, lock } = await load();
    const told = vi.fn();
    lock.subscribeKeyLock(told);
    svc.ensureIdentity('a test');
    await svc.lock(PASS, COST);
    expect(told).toHaveBeenCalledTimes(1);
    await svc.removeLock();
    expect(told).toHaveBeenCalledTimes(2);
  });
});

describe('the next visit', () => {
  it('knows whose key it is, holds no secret, and makes no second key', async () => {
    const { svc, pubkey } = await lockedVisit();
    expect(svc.getPublicKey()).toBe(pubkey);
    expect(svc.lockState()).toBe('locked');
    expect(svc.isLocked()).toBe(true);
    expect(svc.hasIdentity()).toBe(true);
    expect(svc.holdsOwnKey()).toBe(true);
    expect(svc.ensureIdentity('sending a chat message')).toBe(pubkey);
    expect(localStorage.getItem(PLAIN)).toBeNull();
  });

  it('signs, encrypts, decrypts and exports nothing until it is unlocked', async () => {
    const { svc } = await lockedVisit();
    const peer = getPublicKey(generateSecretKey());
    expect(() => svc.signEvent(template())).toThrow(/locked/);
    expect(() => svc.nip44Encrypt(peer, 'x')).toThrow(/locked/);
    expect(() => svc.nip44Decrypt(peer, 'x')).toThrow(/locked/);
    expect(() => svc.exportNsec()).toThrow(/locked/);
  });

  it('opens with the passphrase, then signs as the same key, writing nothing', async () => {
    const { svc, pubkey } = await lockedVisit();
    await svc.unlock(PASS);
    expect(svc.lockState()).toBe('unlocked');
    const signed = svc.signEvent(template());
    expect(signed.pubkey).toBe(pubkey);
    expect(verifyEvent(signed)).toBe(true);
    expect(localStorage.getItem(PLAIN)).toBeNull();
  });

  it('refuses a wrong passphrase, saying so, and stays locked', async () => {
    const { svc } = await lockedVisit();
    await expect(svc.unlock('not the passphrase')).rejects.toThrow('That passphrase is wrong.');
    expect(svc.isLocked()).toBe(true);
  });
});

describe('asking for the passphrase', () => {
  it('asks once, for what the person did, however many things wait on it; a wrong answer is asked again', async () => {
    const { svc, lock, pubkey } = await lockedVisit();
    const reasons: string[] = [];
    lock.registerUnlockAsker(async ({ reason, attempt }) => {
      reasons.push(reason);
      await expect(attempt('not the passphrase')).rejects.toThrow('That passphrase is wrong.');
      await attempt(PASS);
      return true;
    });

    const [nsec] = await Promise.all([svc.exportNsecUnlocking('showing your key to back up'), svc.unlockFor('sending a chat message')]);
    expect(reasons).toEqual(['showing your key to back up']);
    expect(getPublicKey(nip19.decode(nsec).data as Uint8Array)).toBe(pubkey);
  });

  it('leaves the key locked when the person closes the prompt, and the action says so', async () => {
    const { svc, lock } = await lockedVisit();
    lock.registerUnlockAsker(async () => false);
    await expect(svc.exportNsecUnlocking()).rejects.toThrow('Nothing was done: your key is still locked.');
    expect(svc.isLocked()).toBe(true);
  });

  it('refuses rather than waits where nothing on screen can ask', async () => {
    const { svc } = await lockedVisit();
    await expect(svc.unlockFor('sending a chat message')).rejects.toThrow('nothing here can ask for its passphrase');
  });

  it('chat signs after the person unlocks, through the same prompt', async () => {
    const { svc, lock, pubkey } = await lockedVisit();
    const asked = vi.fn(async ({ attempt }: { attempt: (p: string) => Promise<void> }) => { await attempt(PASS); return true; });
    lock.registerUnlockAsker(asked);
    const published: Event[] = [];
    vi.spyOn(svc.pool, 'publish').mockImplementation((_relays, event) => { published.push(event as Event); return [Promise.resolve('ok')]; });

    expect(await svc.sendMessage('chan-1', 'On my way.')).toBe(true);
    expect(asked).toHaveBeenCalledTimes(1);
    expect(published[0].pubkey).toBe(pubkey);
  });
});

describe('removing the lock', () => {
  it('asks for the passphrase, stores the key unencrypted again, and drops the locked copy', async () => {
    const { svc, lock, pubkey } = await lockedVisit();
    lock.registerUnlockAsker(async ({ attempt }) => { await attempt(PASS); return true; });
    await svc.removeLock();
    expect(localStorage.getItem(LOCKED)).toBeNull();
    expect(localStorage.getItem(PLAIN)).not.toBeNull();
    expect(svc.lockState()).toBe('none');

    const next = await load();
    expect(next.svc.lockState()).toBe('none');
    expect(getPublicKey(nip19.decode(next.svc.exportNsec()).data as Uint8Array)).toBe(pubkey);
  });

  it('keeps the lock when the person closes the prompt', async () => {
    const { svc, lock } = await lockedVisit();
    lock.registerUnlockAsker(async () => false);
    await expect(svc.removeLock()).rejects.toThrow(/still locked/);
    expect(localStorage.getItem(LOCKED)).not.toBeNull();
    expect(localStorage.getItem(PLAIN)).toBeNull();
  });
});

describe('the key going elsewhere', () => {
  it('moving it into Starcom Uplink asks for the passphrase, and takes the locked copy too', async () => {
    const { svc, lock, secret, pubkey } = await lockedVisit();
    lock.registerUnlockAsker(async ({ attempt }) => { await attempt(PASS); return true; });
    const { moveKeyToUplink } = await import('../../extension/moveKey');
    const handed: string[] = [];
    const ask = vi.fn(async (verb: string, _said: unknown, params: Record<string, unknown>) => {
      if (verb === 'signer.import') {
        handed.push(params.nsec as string);
        return { ok: true, result: { pubkey } };
      }
      return { ok: true, result: { event: finalizeEvent((params as { event: Parameters<typeof finalizeEvent>[0] }).event, secret) } };
    });

    await moveKeyToUplink({ ask: ask as never, refresh: async () => undefined as never });
    expect(getPublicKey(nip19.decode(handed[0]).data as Uint8Array)).toBe(pubkey);
    expect(localStorage.getItem(LOCKED)).toBeNull();
    expect(localStorage.getItem(PLAIN)).toBeNull();
    expect(localStorage.getItem('starcom-key-held-by-uplink')).toBe(pubkey);
    expect(svc.lockState()).toBe('none');
    expect(svc.holdsOwnKey()).toBe(false);
  });

  it('deleting the key deletes the locked copy too', async () => {
    const { svc } = await lockedVisit();
    svc.forgetIdentity();
    expect(localStorage.getItem(LOCKED)).toBeNull();
    expect((await load()).svc.hasIdentity()).toBe(false);
  });

  it('a key brought from a backup replaces the locked one, stored unlocked', async () => {
    const { svc, secret, pubkey } = await lockedVisit();
    expect(svc.importNsec(nip19.nsecEncode(secret))).toBe(pubkey);
    expect(localStorage.getItem(LOCKED)).toBeNull();
    expect(svc.lockState()).toBe('none');
    expect(svc.signEvent(template()).pubkey).toBe(pubkey);
  });

  it('a lock stopped half-way leaves the key unlocked, never lost', async () => {
    const { secret, pubkey } = await lockedVisit();
    // Both copies of one key, as a lock interrupted between its two writes would leave them.
    localStorage.setItem(PLAIN, JSON.stringify(Array.from(secret)));
    const { svc } = await load();
    expect(svc.lockState()).toBe('none');
    expect(svc.getPublicKey()).toBe(pubkey);
    expect(localStorage.getItem(LOCKED)).toBeNull();
    expect(localStorage.getItem(PLAIN)).not.toBeNull();
  });
});

describe('what runs on its own', () => {
  it('a relay sign-in never asks: it is refused while locked, and signs once the person has unlocked', async () => {
    const { lock, pubkey } = await lockedVisit();
    const { nostrIdentityService } = await import('../identity/NostrIdentityService');
    const asked = vi.fn(async ({ attempt }: { attempt: (p: string) => Promise<void> }) => { await attempt(PASS); return true; });
    lock.registerUnlockAsker(asked);

    expect(nostrIdentityService.isLocked()).toBe(true);
    await expect(nostrIdentityService.signWithExisting(template())).rejects.toThrow(/locked/);
    expect(asked).not.toHaveBeenCalled();

    // A publish is the person's act: it asks, with what it is for.
    const signed = await nostrIdentityService.asSigner('publishing a report').signEvent(template());
    expect(asked).toHaveBeenCalledTimes(1);
    expect(asked.mock.calls[0][0]).toMatchObject({ reason: 'publishing a report' });
    expect(signed.pubkey).toBe(pubkey);
    expect((await nostrIdentityService.signWithExisting(template())).pubkey).toBe(pubkey);
  });

  it('opening what was sealed to the key never asks unless the person is opening it', async () => {
    const { lock } = await lockedVisit();
    const { nostrIdentityService } = await import('../identity/NostrIdentityService');
    const asked = vi.fn(async ({ attempt }: { attempt: (p: string) => Promise<void> }) => { await attempt(PASS); return true; });
    lock.registerUnlockAsker(asked);
    const peer = getPublicKey(generateSecretKey());

    await expect(nostrIdentityService.nip44Decrypt(peer, 'x')).rejects.toThrow(/locked/);
    expect(asked).not.toHaveBeenCalled();
    const sealed = await nostrIdentityService.nip44Encrypt(peer, 'hello', 'sending a bundle');
    expect(asked).toHaveBeenCalledTimes(1);
    expect(typeof sealed).toBe('string');
  });

  it('the sealed inbox does not read while the key is locked, so it never reads past what it cannot open', async () => {
    const { lock } = await lockedVisit();
    const { startSealedInbox } = await import('../nostr/sealedInbox');
    const subscribeMany = vi.fn(() => ({ close: () => {} }));
    const pool = { subscribeMany } as never;

    startSealedInbox({}, { relays: ['wss://relay.example'], pool })();
    expect(subscribeMany).not.toHaveBeenCalled();

    lock.registerUnlockAsker(async ({ attempt }) => { await attempt(PASS); return true; });
    const { nostrIdentityService } = await import('../identity/NostrIdentityService');
    await nostrIdentityService.unlockFor('reading what was sent to you');
    startSealedInbox({}, { relays: ['wss://relay.example'], pool })();
    expect(subscribeMany).toHaveBeenCalledTimes(1);
  });

  it('an unlock is told to whatever starts reads again when access changes', async () => {
    const { svc } = await lockedVisit();
    const { onAccessChange } = await import('../nostr/accessChanges');
    const changed = vi.fn();
    onAccessChange(changed);
    await svc.unlock(PASS);
    expect(changed).toHaveBeenCalled();
  });
});
