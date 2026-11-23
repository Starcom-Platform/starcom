/**
 * Sealed calls (decision D-PW, PW44, PW72, PW75), on Mecha Jono's `psi_call` shape: the seal carries the fingerprint
 * and nothing else, not the window's times; the reveal's salt and text hash to it, checked against the seal's author,
 * its address and its moment before the window; a call's state through time; the calls kept on this device.
 *
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import {
  addCall, callContent, callState, checkReveal, fingerprintOf, getCall, getCalls, newCall, PSI_CALL_KIND, readCallText, removeCall,
  resetCallsForTests, revealTemplate, sealTemplate, updateCall, windowMs, type CallText, type PsiCall,
} from '../calls';

const FROM = Date.UTC(2026, 10, 1, 12);
const UNTIL = Date.UTC(2026, 10, 2, 12);
const text: CallText = {
  window: { address: '31923:abc:w', title: 'Moon and Mars at change (square)', start: FROM / 1000, end: UNTIL / 1000 },
  place: { zone: 'zone:sahel-west', name: 'West Sahel Zone' }, expects: { kind: 'conflict' }, words: 'Escalation along the border.',
};
const SALT = '00112233445566778899aabbccddeeff';
const call: PsiCall = { id: '0123456789abcdef', text, salt: SALT, createdAt: FROM - 2 * 86_400_000 };
const KEY = 'a'.repeat(64);
const FAMILY = [
  ['t', 'psi_watch'], ['t', 'psi_call'], ['t', 'experimental'], ['t', 'role:context'], ['t', 'category:psi'], ['t', 'category:psi.call'],
  ['schema_version', '0'],
];
const seal = { id: 's'.repeat(64), pubkey: KEY, created_at: (FROM - 86_400_000) / 1000, ...sealTemplate(call) };
const reveal = { id: 'r'.repeat(64), pubkey: KEY, created_at: (UNTIL + 3_600_000) / 1000, ...revealTemplate(call, { eventId: seal.id, relay: 'wss://team.example' }) };

describe('a call\'s seal and reveal', () => {
  it('seals only the fingerprint, the SHA-256 of the salt and the exact text, in the psi family\'s tags', () => {
    expect(seal.kind).toBe(PSI_CALL_KIND);
    expect(seal.content).toBe('');
    const fingerprint = bytesToHex(sha256(utf8ToBytes(SALT + callContent(text))));
    expect(seal.tags).toEqual([['d', 'psi-call-0123456789abcdef'], ['x', fingerprint], ...FAMILY, ['alt', 'Psi Watch call (Experimental): its fingerprint.']]);
    expect(JSON.stringify(seal.tags)).not.toContain(String(text.window.start));
    expect(fingerprintOf(text, SALT)).not.toBe(fingerprintOf(text, 'ff'));
  });

  it('keeps the text in sorted keys, no spaces', () => {
    expect(callContent(text)).toBe('{"expects":{"kind":"conflict"},"place":{"name":"West Sahel Zone","zone":"zone:sahel-west"},'
      + `"window":{"address":"31923:abc:w","end":${UNTIL / 1000},"start":${FROM / 1000},"title":"Moon and Mars at change (square)"},`
      + '"words":"Escalation along the border."}');
  });

  it('reveals the exact text and the salt, which anyone can check against the seal', () => {
    expect(reveal.tags.slice(0, 4)).toEqual([
      ['d', 'psi-call-0123456789abcdef-reveal'], ['e', seal.id, 'wss://team.example'], ['x', fingerprintOf(text, SALT)], ['salt', SALT],
    ]);
    expect(reveal.content).toBe(callContent(text));
    expect(checkReveal(seal, reveal)).toEqual({ text });
  });

  it('refuses a reveal by another key, with other words or salt, for another call, or sealed after its window opened', () => {
    expect(checkReveal(seal, { ...reveal, pubkey: 'b'.repeat(64) })).toEqual({ refused: 'sealed and revealed by different keys' });
    expect(checkReveal(seal, { ...reveal, content: reveal.content.replace('border', 'coast') })).toEqual({ refused: 'the text does not hash to the fingerprint' });
    const otherSalt = reveal.tags.map((t) => (t[0] === 'salt' ? ['salt', 'ff'] : t));
    expect(checkReveal(seal, { ...reveal, tags: otherSalt })).toEqual({ refused: 'the text does not hash to the fingerprint' });
    expect(checkReveal({ ...seal, created_at: FROM / 1000 + 60 }, reveal)).toEqual({ refused: 'sealed after its window opened' });
    const otherSeal = reveal.tags.map((t) => (t[0] === 'e' ? ['e', 'other'] : t));
    expect(checkReveal(seal, { ...reveal, tags: otherSeal })).toEqual({ refused: 'the reveal names another seal' });
    const otherCall = reveal.tags.map((t) => (t[0] === 'd' ? ['d', 'psi-call-ffff-reveal'] : t));
    expect(checkReveal(seal, { ...reveal, tags: otherCall })).toEqual({ refused: 'not a seal and its reveal' });
    expect(checkReveal({ ...seal, kind: 1 }, reveal)).toEqual({ refused: 'not a seal and its reveal' });
  });

  it('reads a call\'s text back only when it is one', () => {
    expect(readCallText(callContent(text))).toEqual(text);
    expect(readCallText('{"words":"x"}')).toBeNull();
    expect(readCallText(callContent({ ...text, expects: { kind: 'weather' as never } }))).toBeNull();
    expect(readCallText('not json')).toBeNull();
  });

  it('makes a new call with a random id and salt', () => {
    let n = 0;
    const made = newCall(text, 5, (size) => new Uint8Array(size).fill(++n));
    expect(made).toEqual({ id: '0101010101010101', text, salt: '02'.repeat(16), createdAt: 5 });
    expect(windowMs(text)).toEqual({ fromMs: FROM, untilMs: UNTIL });
  });
});

describe('a call through time, and on this device', () => {
  beforeEach(() => resetCallsForTests());

  it('is unsealed, sealed, open, closed, then revealed or kept private', () => {
    expect(callState(call, FROM - 1)).toBe('unsealed');
    const sealed = { ...call, seal: { eventId: seal.id, relay: 'wss://team.example', at: FROM - 86_400_000 } };
    expect([callState(sealed, FROM - 1), callState(sealed, FROM + 1), callState(sealed, UNTIL + 1)]).toEqual(['sealed', 'open', 'closed']);
    expect(callState({ ...sealed, reveal: { eventId: reveal.id, at: UNTIL + 1 } }, UNTIL + 2)).toBe('revealed');
    expect(callState({ ...sealed, keptPrivate: UNTIL + 1 }, UNTIL + 2)).toBe('private');
  });

  it('keeps its calls, with their words and salt, only here', () => {
    addCall(call);
    updateCall(call.id, { keptPrivate: 5 });
    expect(getCall(call.id)?.keptPrivate).toBe(5);
    expect(getCalls()).toHaveLength(1);
    removeCall(call.id);
    expect(getCalls()).toEqual([]);
  });
});
