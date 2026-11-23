/**
 * An adventure's return through the review (decision D-RS, RS35): seen or not, with the counts given, shown as it
 * will be sealed to its caller, naming the call, before anything is signed; sent only on a yes; claiming nothing.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentReview, decideReview } from '../publishReview';
import { resetAdventures, returnOf } from '../../roster/adventure';
import type { ReadRosterItem } from '../../roster/rosterItem';

const sent = vi.hoisted(() => ({ calls: [] as Array<{ tags: string[][]; content: string; createdAt: number; recipient: string; relays: string[] }>, fail: false }));
vi.mock('../../intel/received/sendReport', () => ({
  sendMissionReport: vi.fn(async (template: { tags: string[][]; content: string; createdAt: number }, recipient: string, relays: string[]) => {
    if (sent.fail) throw new Error('No relay took it.');
    sent.calls.push({ ...template, recipient, relays });
    return { relays: 2 };
  }),
}));

const inbox = vi.hoisted(() => ({ relays: ['wss://nos.lol', 'wss://relay.primal.net'] as string[] }));
vi.mock('../../nostr/inboxRelays', () => ({ inboxRelays: vi.fn(async () => inbox.relays) }));

import { reviewAdventureReturn } from '../adventureReturns';

const CALLER = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00';
const AURORA: ReadRosterItem = {
  d: 'adventure-aurora-mn', kind: 'adventure', title: 'Aurora tonight over Minnesota', limits: [], places: ['us-mn'], toward: [],
  counts: [{ coordinate: `30079:${CALLER}:starcom_mission_package_aurora-watch`, relay: '' }], text: '',
  window: { from: '2026-10-17T02:00Z', until: '2026-10-17T09:00Z' },
  call: { what: 'Aurora likely', odds: 'Kp 7', source: 'https://www.swpc.noaa.gov/' },
  author: CALLER, createdAt: 1, address: `30084:${CALLER}:adventure-aurora-mn`,
};
const NOW = Date.parse('2026-10-17T04:10:00Z');

async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

beforeEach(() => { resetAdventures(); sent.calls.length = 0; sent.fail = false; inbox.relays = ['wss://nos.lol', 'wss://relay.primal.net']; });

describe('reviewAdventureReturn', () => {
  it('shows the return as it will be sealed to its caller, and sends it on a yes', async () => {
    const outcome = reviewAdventureReturn(AURORA, true, [{ label: 'Photos taken', n: 2 }], NOW);
    const shown = await answer(true);
    expect(shown.act).toBe('Send return');
    expect(shown.sealed).toBe(true);
    expect(shown.content.title).toBe('Return from: Aurora tonight over Minnesota');
    expect(shown.content.body).toBe('Seen it\nPhotos taken: 2\nDay: 2026-10-17');
    expect(shown.destinations.map((d) => d.address)).toEqual(['wss://nos.lol', 'wss://relay.primal.net']);
    expect(shown.content.fields.find((f) => f.label === 'To')?.value).toBe('Its caller, the key that posted it: npub1crl7uqxqllhqps8lacqvpllwqrq0lmsqcrl7uqxqllhqps8lacqq9fxs3l');
    expect(shown.content.fields.find((f) => f.label === 'Claims')?.value).toMatch(/^Nothing/);
    expect(await outcome).toEqual({ status: 'sent', result: { relays: 2 } });
    expect(sent.calls[0]).toMatchObject({
      recipient: CALLER,
      relays: ['wss://nos.lol', 'wss://relay.primal.net'],
      tags: [['a', AURORA.address]],
    });
    expect(JSON.parse(sent.calls[0].content)).toEqual({
      date: '2026-10-17', seen: true, counts: [{ line: 'Photos taken', n: 2 }], salt: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    expect(returnOf(AURORA.address)).toEqual({ seen: true, day: '2026-10-17', relays: 2 });
  });

  it('sends nothing, and keeps nothing, on cancel or when no relay took it', async () => {
    const cancelled = reviewAdventureReturn(AURORA, false, [], NOW);
    await answer(false);
    expect(await cancelled).toEqual({ status: 'cancelled' });
    sent.fail = true;
    const failed = reviewAdventureReturn(AURORA, false, [], NOW);
    await answer(true);
    await expect(failed).rejects.toThrow(/No relay took it/);
    expect(sent.calls).toEqual([]);
    expect(returnOf(AURORA.address)).toBeUndefined();
  });

  it('drops a count that is not a whole number, 0 or more', async () => {
    const outcome = reviewAdventureReturn(AURORA, false, [{ label: 'Photos taken', n: -1 }, { label: 'Clouds', n: 1.5 }, { label: 'Stars counted', n: 0 }], NOW);
    await answer(true);
    await outcome;
    expect(JSON.parse(sent.calls[0].content).counts).toEqual([{ line: 'Stars counted', n: 0 }]);
  });

  it('pauses a return to a caller whose key is exposed, before any review (NavCom §5.0)', async () => {
    const EXPOSED = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
    const called = { ...AURORA, author: EXPOSED, address: `30084:${EXPOSED}:adventure-aurora-mn` };
    expect(await reviewAdventureReturn(called, true, [], NOW)).toEqual({
      status: 'refused',
      reason: 'Returns to this caller are paused. The key it posted this under was exposed on 2026-09-28, so a sealed return could show who sent it. They resume when its new key starts. Nothing was sent.',
    });
    expect(sent.calls).toEqual([]);
    expect(returnOf(called.address)).toBeUndefined();
  });

  it('sends nothing to a caller that names no inbox for sealed messages', async () => {
    inbox.relays = [];
    expect(await reviewAdventureReturn(AURORA, true, [], NOW)).toEqual({
      status: 'refused', reason: 'Its caller names no inbox for sealed messages, so a return cannot reach it privately. Nothing was sent.',
    });
    expect(sent.calls).toEqual([]);
    expect(returnOf(AURORA.address)).toBeUndefined();
  });
});
