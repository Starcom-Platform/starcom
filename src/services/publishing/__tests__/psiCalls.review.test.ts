/**
 * Sealing and revealing a call (decision D-PW, PW44, PW72, PW75), through the review every publish passes: the seal
 * shows that only a fingerprint goes, to the team's relay, before the window opens; the reveal sends the exact text
 * and salt after the window closes; each recorded on the call kept here.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentReview, decideReview } from '../publishReview';

const sent = vi.hoisted(() => [] as Array<{ kind: number; tags: string[][]; content: string; relays: string[] }>);
vi.mock('../../nostr/sendSigned', () => ({
  sendSignedEvent: vi.fn(async (template: { kind: number; tags: string[][]; content: string }, relays: string[]) => {
    sent.push({ ...template, relays });
    return { relays: relays.length, event: { id: `event-${sent.length}` } };
  }),
}));

import { reviewCallReveal, reviewCallSeal } from '../psiCalls';
import { addCall, fingerprintOf, getCall, PSI_CALL_KIND, resetCallsForTests, type CallText } from '../../psiWatch/calls';

const FROM = Date.UTC(2026, 10, 1, 12);
const UNTIL = Date.UTC(2026, 10, 2, 12);
const TEAM = { relay: 'wss://team.example', name: 'Blue Team' };
const text: CallText = {
  window: { address: '31923:abc:w', title: 'Moon and Mars at change (square)', start: FROM / 1000, end: UNTIL / 1000 },
  place: { zone: 'zone:sahel-west', name: 'West Sahel Zone' }, expects: { kind: 'quakes' }, words: 'A strong one on the rift.',
};
const SALT = 'ab'.repeat(16);
const tagOf = (tags: string[][], name: string) => tags.find((t) => t[0] === name);

async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

beforeEach(() => {
  sent.length = 0;
  resetCallsForTests();
  addCall({ id: 'c1', text, salt: SALT, createdAt: FROM - 2 * 86_400_000 });
});

describe('reviewCallSeal', () => {
  it('shows that only the fingerprint goes, to the team\'s relay, and records the seal on a yes', async () => {
    const outcome = reviewCallSeal('c1', TEAM, FROM - 86_400_000);
    const shown = await answer(true);
    expect(shown.act).toBe('Seal the call');
    expect(shown.content.fields.find((f) => f.label === 'Fingerprint')?.value).toBe(fingerprintOf(text, SALT));
    expect(shown.content.fields.find((f) => f.label === 'Expected')?.value).toBe('Earthquakes M5.5+');
    expect(shown.destinations.map((d) => d.address)).toEqual(['wss://team.example']);
    expect(await outcome).toEqual({ status: 'sent', result: { relays: 1 } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: PSI_CALL_KIND, content: '', relays: ['wss://team.example'] });
    expect(tagOf(sent[0].tags, 'd')).toEqual(['d', 'psi-call-c1']);
    expect(tagOf(sent[0].tags, 'x')).toEqual(['x', fingerprintOf(text, SALT)]);
    // Neither the words, the Zone nor the window's times go with the seal.
    for (const word of ['rift', 'Sahel', String(FROM / 1000), String(UNTIL / 1000)]) expect(JSON.stringify(sent[0])).not.toContain(word);
    expect(getCall('c1')?.seal).toEqual({ eventId: 'event-1', relay: 'wss://team.example', at: FROM - 86_400_000 });
  });

  it('refuses once the window has opened, and sends nothing on a no', async () => {
    expect(await reviewCallSeal('c1', TEAM, FROM)).toMatchObject({ status: 'refused' });
    const outcome = reviewCallSeal('c1', TEAM, FROM - 1000);
    await answer(false);
    expect(await outcome).toEqual({ status: 'cancelled' });
    expect(sent).toEqual([]);
    expect(getCall('c1')?.seal).toBeUndefined();
  });
});

describe('reviewCallReveal', () => {
  it('reveals only after the window closes, the exact text beside its seal', async () => {
    const sealing = reviewCallSeal('c1', TEAM, FROM - 86_400_000);
    await answer(true);
    await sealing;
    expect(await reviewCallReveal('c1', UNTIL)).toMatchObject({ status: 'refused' });
    const outcome = reviewCallReveal('c1', UNTIL + 60_000);
    const shown = await answer(true);
    expect(shown.content.body).toBe('A strong one on the rift.');
    expect(await outcome).toEqual({ status: 'sent', result: { relays: 1 } });
    expect(sent[1].tags.slice(0, 4)).toEqual([['d', 'psi-call-c1-reveal'], ['e', 'event-1', 'wss://team.example'], ['x', fingerprintOf(text, SALT)], ['salt', SALT]]);
    expect(JSON.parse(sent[1].content)).toEqual(text);
    expect(getCall('c1')?.reveal).toEqual({ eventId: 'event-2', at: UNTIL + 60_000 });
  });
});
