/**
 * Uplink as the person's signer (decision D-EX, E3, EX39–EX42): it takes the key from Starcom under a
 * passphrase set in its own window, opens it once per session, asks before signing anything public and
 * signs private things quietly, seals and opens messages, and logs every use, a run of the same use as
 * one line.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { nsecEncode } from 'nostr-tools/nip19';
import * as nip44 from 'nostr-tools/nip44';
import type { ActivityEntry } from '../protocol';
import { handleToUplink, withEntry, type UplinkHost } from '../uplink/handlers';
import type { StoredKey } from '../uplink/keyStore';
import { uplinkEn } from '../../i18n/uplink/en';

const STARCOM = 'https://starcom.app/app/cases';
const PASS = 'correct horse battery';
const req = (capability: string, args: object, purpose = 'Publish the flood position you reviewed') => ({ kind: 'request', id: 'r1', capability, purpose, args });

function host(over: Partial<UplinkHost> = {}) {
  const log: ActivityEntry[] = [];
  const state = { stored: null as StoredKey | null, unlocked: null as Uint8Array | null, passphrases: [PASS] as Array<string | null>, signAnswers: ['sign'] as Array<'sign' | 'declined'> };
  const asked: string[] = [];
  const h: UplinkHost = {
    version: '0.2.0', now: () => 1_000,
    readActivity: async () => log, appendActivity: async (e) => { log.push(e); },
    grantedOrigins: async () => [], askToGrant: async () => 'declined',
    readCaptures: async () => [], releaseCaptures: async () => 0, setInboxCount: async () => {}, readInboxCount: async () => 0, rememberLanguage: async () => {}, words: async () => uplinkEn,
    readCaptureFile: async () => null, fetchSite: async () => ({ failed: 'not here' }),
    readStoredKey: async () => state.stored,
    saveStoredKey: async (k) => { state.stored = k; },
    readUnlocked: async () => state.unlocked,
    rememberUnlocked: async (s) => { state.unlocked = s; },
    askPassphrase: async (mode, _purpose, _pubkey, note) => { asked.push(`${mode}${note ? `: ${note}` : ''}`); return state.passphrases.shift() ?? null; },
    askToSign: async (summary) => { asked.push(`sign ${summary.what}`); return state.signAnswers.shift() ?? 'declined'; },
    sealCost: 1,
    ...over,
  };
  return { h, log, state, asked };
}

const moved = async (secret = generateSecretKey()) => {
  const t = host();
  const answer = await handleToUplink(req('signer.import', { nsec: nsecEncode(secret) }, 'Move your key into Uplink'), STARCOM, t.h);
  return { ...t, secret, answer };
};

describe('signer.import', () => {
  it('takes the key under a passphrase set in Uplink\'s window, sealed, and keeps it open for the session', async () => {
    const { answer, state, asked, secret } = await moved();
    expect(answer).toMatchObject({ ok: true, result: { pubkey: getPublicKey(secret) } });
    expect(asked).toEqual(['set']);
    expect(state.stored?.ncryptsec).toMatch(/^ncryptsec1/);
    expect(state.stored?.pubkey).toBe(getPublicKey(secret));
    expect(state.unlocked).toEqual(secret);
  });

  it('keeps nothing when the person cancels the passphrase', async () => {
    const t = host();
    t.state.passphrases = [null];
    expect(await handleToUplink(req('signer.import', { nsec: nsecEncode(generateSecretKey()) }), STARCOM, t.h)).toMatchObject({ ok: false, refusal: 'declined' });
    expect(t.state.stored).toBeNull();
  });

  it('refuses a second, different key: one person, one key', async () => {
    const t = await moved();
    expect(await handleToUplink(req('signer.import', { nsec: nsecEncode(generateSecretKey()) }), STARCOM, t.h)).toMatchObject({ ok: false, refusal: 'refused' });
    expect(await handleToUplink(req('signer.import', { nsec: nsecEncode(t.secret) }), STARCOM, t.h)).toMatchObject({ ok: true, result: { pubkey: getPublicKey(t.secret) } });
  });

  it('refuses what is not a secret key, and never logs the key', async () => {
    const t = host();
    expect(await handleToUplink(req('signer.import', { nsec: 'not-a-key' }), STARCOM, t.h)).toMatchObject({ ok: false, refusal: 'refused' });
    const secret = generateSecretKey();
    await handleToUplink(req('signer.import', { nsec: nsecEncode(secret) }), STARCOM, t.h);
    expect(JSON.stringify(t.log)).not.toContain(nsecEncode(secret));
  });
});

describe('signer.sign', () => {
  const NOTE = { kind: 30023, created_at: 1_760_000_000, tags: [['d', 'r1'], ['title', 'Flood levels']], content: 'The river rose 3 m.' };
  const CHAT = { kind: 14, created_at: 1_760_000_000, tags: [['p', 'b'.repeat(64)]], content: 'On my way.' };

  it('asks before signing anything public, and signs it as the person when they agree', async () => {
    const t = await moved();
    const answer = await handleToUplink(req('signer.sign', { event: NOTE }), STARCOM, t.h);
    expect(t.asked).toEqual(['set', 'sign an intel report']);
    expect(answer).toMatchObject({ ok: true });
    const event = (answer as { result: { event: Parameters<typeof verifyEvent>[0] } }).result.event;
    expect(event.pubkey).toBe(getPublicKey(t.secret));
    expect(verifyEvent({ ...event })).toBe(true);
    expect(t.log.at(-1)).toMatchObject({ capability: 'signer.sign', outcome: 'ok', target: 'an intel report', detail: 'you agreed' });
  });

  it('signs nothing when the person declines', async () => {
    const t = await moved();
    t.state.signAnswers = ['declined'];
    expect(await handleToUplink(req('signer.sign', { event: NOTE }), STARCOM, t.h)).toMatchObject({ ok: false, refusal: 'declined' });
  });

  it('signs a chat message quietly, and logs it', async () => {
    const t = await moved();
    expect(await handleToUplink(req('signer.sign', { event: CHAT }, 'Send your chat message'), STARCOM, t.h)).toMatchObject({ ok: true });
    expect(t.asked).toEqual(['set']);
    expect(t.log.at(-1)).toMatchObject({ capability: 'signer.sign', target: 'a chat message', detail: 'quietly: private' });
  });

  it('asks for the passphrase once per session, again when it was wrong', async () => {
    const t = await moved();
    t.state.unlocked = null; // a new browser session
    t.state.passphrases = ['wrong passphrase!', PASS];
    expect(await handleToUplink(req('signer.sign', { event: CHAT }, 'Send your chat message'), STARCOM, t.h)).toMatchObject({ ok: true });
    expect(t.asked).toEqual(['set', 'unlock', 'unlock: That passphrase does not open this key.']);
    expect(t.state.unlocked).toEqual(t.secret);
    await handleToUplink(req('signer.sign', { event: CHAT }, 'Send your chat message'), STARCOM, t.h);
    expect(t.asked).toHaveLength(3);
  });

  it('says it holds no key, rather than signing with another', async () => {
    expect(await handleToUplink(req('signer.sign', { event: CHAT }), STARCOM, host().h)).toMatchObject({ ok: false, refusal: 'not-found' });
  });

  it('refuses an event it cannot read before any key touches it', async () => {
    const t = await moved();
    expect(await handleToUplink(req('signer.sign', { event: { ...CHAT, kind: -3 } }), STARCOM, t.h)).toMatchObject({ ok: false, refusal: 'refused' });
  });
});

describe('signer.encrypt and signer.decrypt', () => {
  it('seals a message for someone, and opens one sealed for the person, with NIP-44', async () => {
    const t = await moved();
    const peer = generateSecretKey();
    const sealed = await handleToUplink(req('signer.encrypt', { peer: getPublicKey(peer), plaintext: 'Meet at the bridge.' }, 'Send your chat message'), STARCOM, t.h);
    const ciphertext = (sealed as { result: { ciphertext: string } }).result.ciphertext;
    expect(nip44.decrypt(ciphertext, nip44.getConversationKey(peer, getPublicKey(t.secret)))).toBe('Meet at the bridge.');
    const toMe = nip44.encrypt('Water at the gauge.', nip44.getConversationKey(peer, getPublicKey(t.secret)));
    expect(await handleToUplink(req('signer.decrypt', { peer: getPublicKey(peer), ciphertext: toMe }, 'Read your chat'), STARCOM, t.h))
      .toMatchObject({ ok: true, result: { plaintext: 'Water at the gauge.' } });
  });

  it('says it could not open a message not sealed for the person', async () => {
    const t = await moved();
    const a = generateSecretKey();
    const b = generateSecretKey();
    const notMine = nip44.encrypt('Not for you.', nip44.getConversationKey(a, getPublicKey(b)));
    expect(await handleToUplink(req('signer.decrypt', { peer: getPublicKey(a), ciphertext: notMine }, 'Read your chat'), STARCOM, t.h))
      .toMatchObject({ ok: false, refusal: 'refused' });
  });
});

describe('signer.status', () => {
  it('says whether it holds a key, whose, and whether it is locked', async () => {
    expect(await handleToUplink(req('signer.status', {}, 'Know who signs for you'), STARCOM, host().h)).toMatchObject({ ok: true, result: { held: false, locked: false } });
    const t = await moved();
    expect(await handleToUplink(req('signer.status', {}, 'Know who signs for you'), STARCOM, t.h)).toMatchObject({ ok: true, result: { held: true, pubkey: getPublicKey(t.secret), locked: false } });
    t.state.unlocked = null;
    expect(await handleToUplink(req('signer.status', {}, 'Know who signs for you'), STARCOM, t.h)).toMatchObject({ ok: true, result: { locked: true } });
  });
});

describe('withEntry', () => {
  const entry = (at: number, over: Partial<ActivityEntry> = {}): ActivityEntry => ({ at, capability: 'signer.decrypt', purpose: 'Read your chat', outcome: 'ok', ...over });

  it('makes a run of the same use within a minute one line, counted', () => {
    let log: ActivityEntry[] = [];
    for (const at of [0, 10_000, 20_000]) log = withEntry(log, entry(at));
    expect(log).toEqual([{ ...entry(20_000), times: 3 }]);
  });

  it('keeps a different use, or one after a minute, as its own line', () => {
    let log = withEntry([], entry(0));
    log = withEntry(log, entry(5_000, { outcome: 'refused', detail: 'not sealed for you' }));
    log = withEntry(log, entry(70_000, { outcome: 'refused', detail: 'not sealed for you' }));
    expect(log).toHaveLength(3);
  });
});
