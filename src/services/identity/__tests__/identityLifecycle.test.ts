/**
 * An identity is created when the person asks for something that needs one, they are
 * told it happened, and they can take it with them or delete it.
 *
 * ─── WHAT THIS REPLACES ────────────────────────────────────────────────────
 *
 * nostrService minted a secp256k1 secret key in its constructor — on module load —
 * and wrote it to localStorage in plain text. Opening the app therefore created a
 * cryptographic identity that nobody asked for, nobody was told about, that could
 * sign as them, that they could not export, and that any script on the origin could
 * read. Chat signs with that key, so it had already been published to public relays
 * before its owner knew it existed.
 *
 * Every case here is one of those sentences, made checkable.
 *
 * ─── WHY node, WITH A STORAGE SHIM ─────────────────────────────────────────
 *
 * Under jsdom, nostr-tools refuses to sign at all: @noble's byte check rejects a
 * Uint8Array created in jsdom's realm ("expected Uint8Array, got object"), which is
 * why the sibling nostrIdentity.test.ts already declares the node environment. So
 * these run in node, where signing is real, and localStorage — which node does not
 * have — is a shim of exactly the four methods this code uses. Measured, not
 * assumed: the same test file under jsdom fails on the signature, not on storage.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, verifyEvent } from 'nostr-tools';
import nostrService from '../../nostrService';
import { nostrIdentityService } from '../NostrIdentityService';
import { encodeNsec, decodeNsec, IdentityBackupError } from '../identityBackup';
import {
  pendingIdentityNotice, acknowledgeIdentityNotice, identityRecord, subscribeIdentityNotice,
} from '../identityNotice';
import { createRelayPool } from '../../nostr/relayPool';
import { standInRelay, stopStandInRelays } from '../../nostr/__tests__/standInRelay';

const KEY_STORAGE = 'nostr_secret_key';

/** The Web Storage surface this code actually uses, backed by a Map. */
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

beforeEach(() => {
  installStorageShim();
  // The service is a module singleton and outlives a test, so each case starts from
  // "this browser has never signed anything".
  nostrService.forgetIdentity();
  localStorage.clear();
});

afterEach(() => {
  nostrService.forgetIdentity();
  localStorage.clear();
});

describe('loading the app', () => {
  /*
   * The load-bearing case, and the one every other test here is blind to: they run
   * after the module was imported and each starts by clearing the key, so a key minted
   * in the CONSTRUCTOR would be wiped before they looked. Confirmed by mutation —
   * putting the old ensureIdentity call back in the constructor left all of them
   * green. So this imports the module afresh and looks at storage immediately.
   */
  it('does not create an identity, which is the whole point', async () => {
    installStorageShim();
    vi.resetModules();

    const fresh = (await import('../../nostrService')).default;

    expect(localStorage.getItem(KEY_STORAGE)).toBeNull();
    expect(fresh.hasIdentity()).toBe(false);
    expect(fresh.getPublicKey()).toBeNull();
    expect(pendingIdentityNotice()).toBeNull();
  });

  it('restores one this browser already has, without announcing it again', async () => {
    installStorageShim();
    // A key from an earlier visit, in the format this app has always stored.
    const existing = Array.from(new Uint8Array(32).fill(3));
    localStorage.setItem(KEY_STORAGE, JSON.stringify(existing));
    vi.resetModules();

    const fresh = (await import('../../nostrService')).default;

    expect(fresh.hasIdentity()).toBe(true);
    expect(fresh.getPublicKey()).toMatch(/^[0-9a-f]{64}$/);
    // Restoring is not creating: nobody needs to be told about a key they already had.
    expect(pendingIdentityNotice()).toBeNull();
  });

  it('leaves a stored value that is not a key alone rather than replacing it', async () => {
    installStorageShim();
    localStorage.setItem(KEY_STORAGE, JSON.stringify([1, 2, 3]));
    vi.resetModules();

    const fresh = (await import('../../nostrService')).default;

    // It is the only copy of whatever it is; overwriting it to make room for a fresh
    // key could destroy a recoverable identity.
    expect(fresh.hasIdentity()).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY_STORAGE)!)).toEqual([1, 2, 3]);
  });
});

describe('a browser that has not signed anything', () => {
  it('holds no key and says so, rather than making one', () => {
    expect(nostrService.hasIdentity()).toBe(false);
    expect(nostrService.getPublicKey()).toBeNull();
    expect(localStorage.getItem(KEY_STORAGE)).toBeNull();
  });

  it('tells a caller who it is without creating an identity to answer', async () => {
    const { pubkey, source } = await nostrIdentityService.whoAmI();

    expect(pubkey).toBeNull();
    expect(source).toBe('none');
    expect(localStorage.getItem(KEY_STORAGE)).toBeNull();
  });

  it('has nothing to export and refuses clearly', () => {
    expect(() => nostrService.exportNsec()).toThrow(IdentityBackupError);
    expect(() => nostrService.exportNsec()).toThrow(/no identity in this browser/i);
  });
});

describe('the first thing that needs a signature', () => {
  it('creates the identity, persists it, and records what asked for it', () => {
    const pubkey = nostrService.ensureIdentity('sending a chat message');

    expect(pubkey).toMatch(/^[0-9a-f]{64}$/);
    expect(localStorage.getItem(KEY_STORAGE)).not.toBeNull();

    const notice = pendingIdentityNotice();
    expect(notice?.reason).toBe('sending a chat message');
    expect(notice?.acknowledged).toBe(false);
    expect(Date.parse(notice!.createdAt)).toBeLessThanOrEqual(Date.now());
  });

  it('creates it once — a second signature is the same identity', () => {
    const first = nostrService.ensureIdentity('sending a chat message');
    const stored = localStorage.getItem(KEY_STORAGE);

    const second = nostrService.ensureIdentity('publishing a report');

    expect(second).toBe(first);
    expect(localStorage.getItem(KEY_STORAGE)).toBe(stored);
    // And the notice still names what FIRST caused it, not the latest thing.
    expect(pendingIdentityNotice()?.reason).toBe('sending a chat message');
  });

  it('signs verifiably under the identity it just created', () => {
    const event = nostrService.signEvent({
      kind: 1, content: 'hello', tags: [], created_at: Math.floor(Date.now() / 1000),
    });

    expect(verifyEvent(event)).toBe(true);
    expect(event.pubkey).toBe(nostrService.getPublicKey());
    // Signing is a first signing: it is where an identity comes from for most people.
    expect(pendingIdentityNotice()?.reason).toMatch(/signing/i);
  });

  it('stops telling them once they have acknowledged it', () => {
    nostrService.ensureIdentity('sending a chat message');
    acknowledgeIdentityNotice();

    expect(pendingIdentityNotice()).toBeNull();
    // The record stays: a settings surface should still be able to say when this
    // identity was created and why.
    expect(identityRecord()?.acknowledged).toBe(true);
  });

  it('reaches a surface that was already listening', () => {
    const seen: Array<string | null> = [];
    const stop = subscribeIdentityNotice((notice) => seen.push(notice?.reason ?? null));

    nostrService.ensureIdentity('publishing a report');
    stop();

    // The initial call (nothing yet), then the creation.
    expect(seen).toEqual([null, 'publishing a report']);
  });
});

describe('taking the identity elsewhere', () => {
  it('exports an nsec another client can read, and imports it back', () => {
    const original = nostrService.ensureIdentity('sending a chat message');
    const nsec = nostrService.exportNsec();

    expect(nsec.startsWith('nsec1')).toBe(true);
    // Real NIP-19, decoded by nostr-tools rather than by our own helper.
    const decoded = nip19.decode(nsec);
    expect(decoded.type).toBe('nsec');
    expect(getPublicKey(decoded.data as Uint8Array)).toBe(original);

    nostrService.forgetIdentity();
    expect(nostrService.hasIdentity()).toBe(false);

    expect(nostrService.importNsec(nsec)).toBe(original);
    expect(nostrService.getPublicKey()).toBe(original);
  });

  it('signs as the imported identity afterwards, not the one it replaced', () => {
    const replaced = nostrService.ensureIdentity('sending a chat message');
    const elsewhere = encodeNsec(decodeNsec(nip19.nsecEncode(
      // A key that is not this browser's, standing in for one made in another client.
      new Uint8Array(32).fill(7),
    )));

    const imported = nostrService.importNsec(elsewhere);
    const event = nostrService.signEvent({
      kind: 1, content: 'as me', tags: [], created_at: Math.floor(Date.now() / 1000),
    });

    expect(imported).not.toBe(replaced);
    expect(event.pubkey).toBe(imported);
    expect(verifyEvent(event)).toBe(true);
    expect(pendingIdentityNotice()?.imported).toBe(true);
  });

  it('refuses a public key, by name, instead of storing something unusable', () => {
    const pubkey = nostrService.ensureIdentity('sending a chat message');
    const npub = nip19.npubEncode(pubkey);

    expect(() => nostrService.importNsec(npub)).toThrow(/PUBLIC key/i);
    // And the existing identity is untouched — a refused import changes nothing.
    expect(nostrService.getPublicKey()).toBe(pubkey);
  });

  it('refuses a truncated nsec rather than a key that is 31 bytes of one', () => {
    const nsec = nostrService.exportNsec ? (() => {
      nostrService.ensureIdentity('sending a chat message');
      return nostrService.exportNsec();
    })() : '';

    expect(() => nostrService.importNsec(nsec.slice(0, -4))).toThrow(IdentityBackupError);
  });

  it('deletes the identity and the notice with it, and says what deleting cannot do', () => {
    nostrService.ensureIdentity('sending a chat message');

    nostrService.forgetIdentity();

    expect(nostrService.hasIdentity()).toBe(false);
    expect(localStorage.getItem(KEY_STORAGE)).toBeNull();
    expect(identityRecord()).toBeNull();
    // Nothing here can unpublish what that key signed; forgetIdentity's own comment
    // says so, and this test exists so the claim stays in the code.
  });
});

describe('a signing extension, when one is installed', () => {
  const withExtension = (signer: unknown) => {
    (globalThis as { nostr?: unknown }).nostr = signer;
    return () => { delete (globalThis as { nostr?: unknown }).nostr; };
  };

  it('is preferred, and this app never holds a key at all', async () => {
    const extensionPubkey = 'a'.repeat(64);
    const stop = withExtension({
      getPublicKey: async () => extensionPubkey,
      signEvent: async (event: Record<string, unknown>) => ({ ...event, pubkey: extensionPubkey, sig: 'x', id: 'y' }),
    });

    try {
      expect(nostrIdentityService.hasExtension()).toBe(true);
      const me = await nostrIdentityService.whoAmI();
      expect(me).toEqual({ pubkey: extensionPubkey, source: 'extension' });

      const signed = await nostrIdentityService.asSigner().signEvent({ kind: 1, content: 'hi', tags: [], created_at: 0 });
      expect(signed.pubkey).toBe(extensionPubkey);
      // The point: no local key was created to satisfy any of that.
      expect(nostrService.hasIdentity()).toBe(false);
      expect(localStorage.getItem(KEY_STORAGE)).toBeNull();
    } finally {
      stop();
    }
  });

  it('falls back to a local identity when the person declines the extension', async () => {
    const stop = withExtension({
      getPublicKey: async () => { throw new Error('user rejected'); },
      signEvent: async () => { throw new Error('user rejected'); },
    });

    try {
      const local = nostrService.ensureIdentity('sending a chat message');
      // A refusal is not an absence: it reports what it actually has, and says local.
      expect(await nostrIdentityService.whoAmI()).toEqual({ pubkey: local, source: 'local' });
    } finally {
      stop();
    }
  });
});

/*
 * Signing in to a relay the person joined (plan item 0.3) happens when the relay
 * asks, not when the person does. It is an automatic path, so it may use an
 * identity and must never create one.
 */
describe('a signature nobody asked for in person', () => {
  const signIn = {
    kind: 22242, content: '', created_at: 1,
    tags: [['relay', 'wss://team.relay.example'], ['challenge', 'c1']],
  };

  it('refuses when there is no identity, and creates none', async () => {
    await expect(nostrIdentityService.signWithExisting(signIn)).rejects.toThrow(/no identity/i);
    expect(nostrService.hasIdentity()).toBe(false);
    expect(localStorage.getItem(KEY_STORAGE)).toBeNull();
    expect(pendingIdentityNotice()).toBeNull();
  });

  it('signs as the identity this browser already has', async () => {
    const pubkey = nostrService.ensureIdentity('sending a chat message');
    const signed = await nostrIdentityService.signWithExisting(signIn);
    expect(signed.pubkey).toBe(pubkey);
    expect(verifyEvent(signed)).toBe(true);
  });

  it('signs with the extension when one is installed, and makes no local key', async () => {
    const extensionPubkey = 'b'.repeat(64);
    (globalThis as { nostr?: unknown }).nostr = {
      getPublicKey: async () => extensionPubkey,
      signEvent: async (event: Record<string, unknown>) => ({ ...event, pubkey: extensionPubkey, sig: 'x', id: 'y' }),
    };
    try {
      expect((await nostrIdentityService.signWithExisting(signIn)).pubkey).toBe(extensionPubkey);
      expect(nostrService.hasIdentity()).toBe(false);
      expect(localStorage.getItem(KEY_STORAGE)).toBeNull();
    } finally {
      delete (globalThis as { nostr?: unknown }).nostr;
    }
  });
});

describe('signing in to a relay the person joined', () => {
  afterEach(async () => {
    await stopStandInRelays();
    delete process.env.VITE_NOSTR_INTERNAL_RELAYS;
  });

  it('signs in as this browser\'s identity, and without one signs in as nobody and creates none', async () => {
    const team = await standInRelay({ requiresSignIn: true });
    process.env.VITE_NOSTR_INTERNAL_RELAYS = team.url;
    const pool = createRelayPool();
    try {
      const fromElsewhere = finalizeEvent({ kind: 1, created_at: 1, tags: [], content: 'x' }, generateSecretKey());
      await expect(pool.publish([team.url], fromElsewhere)[0]).rejects.toThrow(/auth-required/);
      expect(team.signIns).toEqual([]);
      expect(nostrService.hasIdentity()).toBe(false);

      const pubkey = nostrService.ensureIdentity('sending a chat message');
      const note = nostrIdentityService.sign({ kind: 1, created_at: 2, tags: [], content: 'hello team' });
      await Promise.all(pool.publish([team.url], note));
      expect(team.signIns.map((e) => e.pubkey)).toEqual([pubkey]);
    } finally {
      pool.destroy();
    }
  });
});
