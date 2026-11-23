/**
 * Starcom Uplink as the person's signer, in the app (decision D-EX, E3, EX39, K4): it signs when it holds
 * this person's key, ahead of any other signing extension, says why for each kind, passes a refusal on in
 * words, wires chat to it, and never overrules a different key the person keeps in this page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import * as uplink from '../useStarcomUplink';
import { refreshUplinkSigner, uplinkSigner } from '../uplinkSigner';
import nostrService from '../../services/nostrService';
import { nostrIdentityService } from '../../services/identity/NostrIdentityService';
import type { UplinkAnswer } from '../protocol';
import { setLanguage } from '../../i18n/app/i18n';

const uplinkKey = generateSecretKey();
const UPLINK_PUB = getPublicKey(uplinkKey);
const asked: Array<{ capability: string; purpose: string; args: unknown }> = [];
let held = true;

beforeEach(() => {
  asked.length = 0;
  held = true;
  vi.spyOn(uplink, 'uplinkNow').mockReturnValue({
    status: 'connected',
    hello: { kind: 'hello', id: 'h', extensionVersion: '0.2.0', protocol: 1, capabilities: ['signer.status', 'signer.sign', 'signer.encrypt', 'signer.decrypt'].map((id) => ({ id: id as never, ready: true })) },
  });
  vi.spyOn(uplink, 'askUplink').mockImplementation((async (capability: string, purpose: string, args: { event?: Parameters<typeof finalizeEvent>[0] }) => {
    asked.push({ capability, purpose, args });
    if (capability === 'signer.status') return { kind: 'answer', id: 'x', ok: true, result: held ? { held: true, pubkey: UPLINK_PUB, locked: false } : { held: false, locked: false } };
    if (capability === 'signer.sign') {
      if (args.event?.kind === 30023 && purpose.includes('refuse')) return { kind: 'answer', id: 'x', ok: false, refusal: 'declined', reason: 'you did not sign it' };
      return { kind: 'answer', id: 'x', ok: true, result: { event: finalizeEvent({ ...args.event! }, uplinkKey) } };
    }
    return { kind: 'answer', id: 'x', ok: false, refusal: 'unsupported', reason: 'not in this test' };
  }) as never);
});
afterEach(async () => {
  vi.restoreAllMocks();
  nostrService.useSigner(null);
  nostrService.forgetIdentity();
  delete (globalThis as { nostr?: unknown }).nostr;
  localStorage.clear();
});

describe('uplinkSigner', () => {
  it('is none until Uplink says it holds a key', async () => {
    held = false;
    await refreshUplinkSigner();
    expect(uplinkSigner()).toBeNull();
  });

  it('signs through Uplink, saying why by the kind, with only the event\'s own fields', async () => {
    await refreshUplinkSigner();
    const signer = uplinkSigner()!;
    expect(await signer.getPublicKey()).toBe(UPLINK_PUB);
    const signed = await signer.signEvent({ kind: 30023, created_at: 1_760_000_000, tags: [['d', 'r1']], content: 'The river rose.', pubkey: 'ignored' });
    expect(signed.pubkey).toBe(UPLINK_PUB);
    const sign = asked.find((a) => a.capability === 'signer.sign')!;
    expect(sign.purpose).toBe('Publish an intel report from Starcom, under your key');
    expect(sign.args).toEqual({ event: { kind: 30023, created_at: 1_760_000_000, tags: [['d', 'r1']], content: 'The river rose.' } });
  });

  it('never overrules a different key the person keeps in this page', async () => {
    nostrService.ensureIdentity('a test');
    await refreshUplinkSigner();
    expect(uplinkSigner()).toBeNull();
  });

  it('wires chat to Uplink, and comes ahead of another signing extension', async () => {
    (globalThis as { nostr?: unknown }).nostr = { getPublicKey: async () => 'other', signEvent: async () => { throw new Error('not this one'); } };
    await refreshUplinkSigner();
    expect(nostrService.ensureIdentity('sending a chat message')).toBe(UPLINK_PUB);
    expect((await nostrIdentityService.whoAmI()).pubkey).toBe(UPLINK_PUB);
    const event = await nostrIdentityService.signWithExisting({ kind: 14, created_at: 1_760_000_000, tags: [], content: 'On my way.' });
    expect(event.pubkey).toBe(UPLINK_PUB);
    expect(asked.find((a) => a.capability === 'signer.sign')?.purpose).toBe('Sign a chat message for Starcom');
  });

  it('asks in the language shown, the kind in Uplink\'s own words for it, with the English beside (D-ML, ML9)', async () => {
    await refreshUplinkSigner();
    await setLanguage('de', false);
    try {
      await uplinkSigner()!.signEvent({ kind: 30023, created_at: 1_760_000_000, tags: [['d', 'r1']], content: 'Der Fluss stieg.' });
      const call = vi.mocked(uplink.askUplink).mock.calls.find((c) => c[0] === 'signer.sign')!;
      expect(call[1]).toBe('Von Starcom aus einen Lagebericht veröffentlichen, unter Ihrem Schlüssel');
      expect(call[4]).toBe('Publish an intel report from Starcom, under your key');
    } finally {
      await setLanguage('en', false);
    }
  });

  it('passes a refusal on in the language shown, before the reason Uplink gave (D-ML, L5)', async () => {
    await refreshUplinkSigner();
    vi.mocked(uplink.askUplink).mockImplementationOnce((async () => ({ kind: 'answer', id: 'x', ok: false, refusal: 'declined', reason: 'Sie haben es nicht signiert' } as UplinkAnswer)) as never);
    await setLanguage('de', false);
    try {
      await expect(uplinkSigner()!.signEvent({ kind: 30023, created_at: 1, tags: [], content: '' })).rejects.toThrow('Sie haben abgelehnt: Sie haben es nicht signiert');
    } finally {
      await setLanguage('en', false);
    }
  });

  it('passes a refusal on in words', async () => {
    await refreshUplinkSigner();
    vi.mocked(uplink.askUplink).mockImplementationOnce((async () => ({ kind: 'answer', id: 'x', ok: false, refusal: 'declined', reason: 'you did not sign it' } as UplinkAnswer)) as never);
    await expect(uplinkSigner()!.signEvent({ kind: 30023, created_at: 1, tags: [], content: '' })).rejects.toThrow('You declined: you did not sign it');
  });
});
