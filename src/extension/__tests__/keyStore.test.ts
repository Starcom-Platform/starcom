/**
 * Uplink's key store and signing rules (decision D-EX, E3, EX39–EX41): the key sealed under the person's
 * passphrase (NIP-49) and opened only by it; public kinds asked before signing, private ones quiet; an
 * event to sign checked before any key touches it.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import { openKey, passphraseProblem, sealKey, secretFromNsec } from '../uplink/keyStore';
import { asksFirst, kindWords, unsignedProblem } from '../uplink/signerRules';

const CHEAP = 1; // scrypt's cost in tests; the real store uses NIP-49's 16
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

describe('keyStore', () => {
  it('seals a key under a passphrase and opens it with that passphrase alone', () => {
    const secret = generateSecretKey();
    const stored = sealKey(secret, 'correct horse battery', new Date('2026-10-12T08:00:00Z'), CHEAP);
    expect(stored.ncryptsec).toMatch(/^ncryptsec1/);
    expect(stored.pubkey).toBe(getPublicKey(secret));
    expect(stored.savedAt).toBe('2026-10-12T08:00:00.000Z');
    expect(JSON.stringify(stored)).not.toContain(hex(secret));
    expect(hex(openKey(stored, 'correct horse battery'))).toBe(hex(secret));
    expect(() => openKey(stored, 'wrong horse battery')).toThrow('That passphrase does not open this key.');
  });

  it('refuses a stored key whose named pubkey is not the key it holds', () => {
    const stored = sealKey(generateSecretKey(), 'correct horse battery', new Date(), CHEAP);
    expect(() => openKey({ ...stored, pubkey: 'f'.repeat(64) }, 'correct horse battery')).toThrow('This key is not the one Uplink says it holds.');
  });

  it('asks for a passphrase of at least ten characters', () => {
    expect(passphraseProblem('short')).toBe('A passphrase needs at least 10 characters.');
    expect(passphraseProblem(42)).toBe('A passphrase is words.');
    expect(passphraseProblem('long enough now')).toBeNull();
  });

  it('reads a secret key as nsec or hex, and nothing else', () => {
    const secret = generateSecretKey();
    expect(hex(secretFromNsec(nsecEncode(secret)))).toBe(hex(secret));
    expect(hex(secretFromNsec(hex(secret)))).toBe(hex(secret));
    expect(() => secretFromNsec('npub1xyz')).toThrow('That is not a Nostr secret key.');
    expect(() => secretFromNsec('abc')).toThrow('That is not a Nostr secret key.');
  });
});

describe('signerRules', () => {
  it('asks before anything public, and signs private and passing things quietly (EX41)', () => {
    for (const kind of [1, 0, 30023, 30082, 30083, 30079, 1111, 1985, 31337]) expect(asksFirst(kind), String(kind)).toBe(true);
    for (const kind of [4, 13, 14, 1059, 22242, 20091, 20095, 20097, 20098]) expect(asksFirst(kind), String(kind)).toBe(false);
  });

  it('names a kind in words, and an unknown one by its number', () => {
    expect(kindWords(30023)).toBe('an intel report');
    expect(kindWords(30082)).toBe('a published claim');
    expect(kindWords(31337)).toBe('an event of kind 31337');
  });

  it('checks an event before any key touches it', () => {
    const ok = { kind: 1, created_at: 1_760_000_000, tags: [['t', 'flood']], content: 'River at 4.2 m' };
    expect(unsignedProblem(ok)).toBeNull();
    expect(unsignedProblem({ ...ok, kind: -1 })).toMatch(/kind/);
    expect(unsignedProblem({ ...ok, created_at: 1.5 })).toMatch(/time/);
    expect(unsignedProblem({ ...ok, tags: [['t', 3]] })).toMatch(/tags/);
    expect(unsignedProblem({ ...ok, content: 'x'.repeat(300_000) })).toMatch(/longer/);
    expect(unsignedProblem({ ...ok, pubkey: 'a'.repeat(64) })).toBeNull();
    expect(unsignedProblem(null)).toMatch(/event/);
  });
});
