/**
 * Reporting across Mecha Jono's key change (D-MX, MX30; NavCom's sealTargetOf): once its next key has a start, a
 * report on a mission its first key posted, or a return from an adventure it called, is sealed to the next key, from
 * that key's inbox, and the review says so.
 * Rehearsed here with a start given in a stand-in for the config, as the cut-over day will give one.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nip19 } from 'nostr-tools';
import { currentReview, decideReview } from '../publishReview';
import { takenMissions, type TakeInput } from '../../intel/received/takenMissions';

const OLD = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const { NEXT } = vi.hoisted(() => ({ NEXT: '86f824c3f1e67c60b1dc15ce110648c4de5c3fb879022fbbcc5e8deb720e402c' }));

vi.mock('../../../config/publicInfrastructure', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config/publicInfrastructure')>();
  return { ...actual, KEY_STARTS: { ...actual.KEY_STARTS, [NEXT]: '2026-11-12T00:00:00Z' } };
});

const sent = vi.hoisted(() => ({ calls: [] as Array<{ recipient: string; relays: string[] }> }));
vi.mock('../../intel/received/sendReport', () => ({
  sendMissionReport: vi.fn(async (_template: unknown, recipient: string, relays: string[]) => {
    sent.calls.push({ recipient, relays });
    return { relays: 1, id: 'i'.repeat(64), author: 'b'.repeat(64) };
  }),
}));
const inbox = vi.hoisted(() => ({ asked: [] as string[] }));
vi.mock('../../nostr/inboxRelays', () => ({ inboxRelays: vi.fn(async (key: string) => { inbox.asked.push(key); return ['wss://nos.lol']; }) }));

import { reviewMissionReport } from '../missionReports';
import { reviewAdventureReturn } from '../adventureReturns';
import type { ReadRosterItem } from '../../roster/rosterItem';

const MISSION: TakeInput = {
  key: `${OLD}:starcom_mission_package_field-naloxone-NM`, coordinate: `30079:${OLD}:starcom_mission_package_field-naloxone-NM`,
  signer: OLD, packageId: 'field-naloxone-NM', relay: 'wss://record.cosmiccodex.app',
  title: 'Put naloxone in more pockets and first-aid kits in New Mexico.', where: 'field',
  counts: [{ id: 'kits', label: 'Naloxone kits carried or placed', line: 'Naloxone kits carried or placed: a count' }],
  steps: [{ id: 's1', ask: 'Get naloxone.' }],
};

beforeEach(() => { takenMissions.reset(); sent.calls.length = 0; inbox.asked.length = 0; });

describe('a report on a mission the old key posted', () => {
  it('is paused before the next key starts', async () => {
    const mission = takenMissions.take(MISSION);
    expect(await reviewMissionReport(mission, { kits: 2 }, Date.parse('2026-11-11T23:59:00Z'))).toMatchObject({
      status: 'refused', reason: expect.stringMatching(/^Reports to this publisher are paused\. The key it posted this under was exposed on 2026-09-28/),
    });
    expect(inbox.asked).toEqual([]);
    expect(sent.calls).toEqual([]);
  });

  it('goes to the next key once it has started, from its inbox, and the review names it as the newer key', async () => {
    const mission = takenMissions.take(MISSION);
    const outcome = reviewMissionReport(mission, { kits: 2 }, Date.parse('2026-11-12T09:00:00Z'));
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
    const shown = currentReview()!;
    expect(shown.content.fields.find((f) => f.label === 'To')?.value)
      .toBe(`Its publisher's newer key, which took over from the one that signed the package: ${nip19.npubEncode(NEXT)}`);
    decideReview(shown.id, true, { acknowledged: true });
    expect(await outcome).toMatchObject({ status: 'sent' });
    expect(inbox.asked).toEqual([NEXT]);
    expect(sent.calls).toEqual([{ recipient: NEXT, relays: ['wss://nos.lol'] }]);
  });
});

describe('a return from an adventure the old key called', () => {
  it('goes to the next key once it has started, and the review names it as the newer key', async () => {
    const called: ReadRosterItem = {
      d: 'adventure-aurora-mn', kind: 'adventure', title: 'Aurora tonight over Minnesota', limits: [], places: ['us-mn'], toward: [],
      counts: [], text: '', window: { from: '2026-11-12T02:00Z', until: '2026-11-12T09:00Z' },
      call: { what: 'Aurora likely', odds: 'Kp 7', source: 'https://www.swpc.noaa.gov/' },
      author: OLD, createdAt: 1, address: `30084:${OLD}:adventure-aurora-mn`,
    };
    const outcome = reviewAdventureReturn(called, true, [], Date.parse('2026-11-12T04:00:00Z'));
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
    const shown = currentReview()!;
    expect(shown.content.fields.find((f) => f.label === 'To')?.value)
      .toBe(`Its caller's newer key, which took over from the one that posted it: ${nip19.npubEncode(NEXT)}`);
    decideReview(shown.id, true, { acknowledged: true });
    expect(await outcome).toMatchObject({ status: 'sent' });
    expect(sent.calls).toEqual([{ recipient: NEXT, relays: ['wss://nos.lol'] }]);
  });
});

