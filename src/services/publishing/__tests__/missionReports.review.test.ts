/**
 * Reporting back through the review (decision D-MF, MF11–MF13): the report shown as it will be sealed, who alone
 * can open it and where it goes, before anything is signed; sent only on a yes; claiming nothing. Since D-MX MX28 it
 * is NavCom's kind 1912 with a salt, sent only to the inbox relays the publisher's kind 10050 list names.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentReview, decideReview } from '../publishReview';
import { takenMissions, type TakeInput } from '../../intel/received/takenMissions';

const sent = vi.hoisted(() => ({ calls: [] as Array<{ tags: string[][]; content: string; createdAt: number; recipient: string; relays: string[] }>, fail: false }));
vi.mock('../../intel/received/sendReport', () => ({
  sendMissionReport: vi.fn(async (template: { tags: string[][]; content: string; createdAt: number }, recipient: string, relays: string[]) => {
    if (sent.fail) throw new Error('No relay took it.');
    sent.calls.push({ ...template, recipient, relays });
    return { relays: 2, id: 'i'.repeat(64), author: 'b'.repeat(64) };
  }),
}));

const inbox = vi.hoisted(() => ({ relays: ['wss://nos.lol', 'wss://relay.primal.net'] as string[] }));
vi.mock('../../nostr/inboxRelays', () => ({ inboxRelays: vi.fn(async () => inbox.relays) }));

import { reviewMissionReport } from '../missionReports';

const PUBLISHER = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00';
const NALOXONE: TakeInput = {
  key: `${PUBLISHER}:starcom_mission_package_field-naloxone-NM`, coordinate: `30079:${PUBLISHER}:starcom_mission_package_field-naloxone-NM`,
  signer: PUBLISHER, packageId: 'field-naloxone-NM', relay: 'wss://record.cosmiccodex.app',
  title: 'Put naloxone in more pockets and first-aid kits in New Mexico.', where: 'field',
  counts: [{ id: 'kits', label: 'Naloxone kits carried or placed', line: 'Naloxone kits carried or placed: a count' }, { id: 'trainings', label: 'Trainings run', line: 'Trainings run: a count.' }],
  steps: [{ id: 's1', ask: 'Get naloxone.' }],
};
const NOW = Date.parse('2026-10-16T21:14:00Z');

async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

beforeEach(() => { takenMissions.reset(); sent.calls.length = 0; sent.fail = false; inbox.relays = ['wss://nos.lol', 'wss://relay.primal.net']; });

describe('reviewMissionReport', () => {
  it('shows the report as it will be sealed, to whom and over which relays, and sends it on a yes', async () => {
    const mission = takenMissions.take(NALOXONE);
    const outcome = reviewMissionReport(mission, { kits: 3, trainings: 1 }, NOW);
    const shown = await answer(true);
    expect(shown.act).toBe('Send report');
    expect(shown.sealed).toBe(true);
    expect(shown.content.title).toBe('Report on: Put naloxone in more pockets and first-aid kits in New Mexico.');
    expect(shown.content.body).toBe('Naloxone kits carried or placed: 3\nTrainings run: 1\nDay: 2026-10-16');
    expect(shown.content.fields.find((f) => f.label === 'To')?.value).toBe('The key that signed the package: npub1crl7uqxqllhqps8lacqvpllwqrq0lmsqcrl7uqxqllhqps8lacqq9fxs3l');
    expect(shown.content.fields.find((f) => f.label === 'Sealed')?.value).toMatch(/Only they can open it/);
    expect(shown.content.fields.find((f) => f.label === 'Claims')?.value).toMatch(/^Nothing/);
    expect(shown.content.fields.find((f) => f.label === 'Where')?.value).toMatch(/inbox relays the publisher names/);
    // Its inbox, and nowhere else: never The Record, never a public relay it did not name.
    expect(shown.destinations.map((d) => d.address)).toEqual(['wss://nos.lol', 'wss://relay.primal.net']);
    expect(await outcome).toEqual({ status: 'sent', result: { relays: 2, id: 'i'.repeat(64), author: 'b'.repeat(64) } });
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0]).toMatchObject({
      recipient: PUBLISHER,
      relays: ['wss://nos.lol', 'wss://relay.primal.net'],
      tags: [['a', NALOXONE.coordinate]],
      createdAt: Date.parse('2026-10-16T00:00:00Z') / 1000,
    });
    const content = JSON.parse(sent.calls[0].content);
    expect(content).toEqual({
      date: '2026-10-16',
      counts: [{ line: 'Naloxone kits carried or placed: a count', n: 3 }, { line: 'Trainings run: a count.', n: 1 }],
      salt: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    // With the id inside its seal and the key that sealed it, so how it settles can be read (NavCom §5.3).
    expect(takenMissions.get(NALOXONE.key)!.reports).toEqual([{ day: '2026-10-16', values: { kits: 3, trainings: 1 }, sentAt: '2026-10-16T21:14:00.000Z', relays: 2, id: 'i'.repeat(64), author: 'b'.repeat(64) }]);
  });

  it('sends nothing, and keeps no report, on cancel', async () => {
    const mission = takenMissions.take(NALOXONE);
    const outcome = reviewMissionReport(mission, { kits: 3 }, NOW);
    await answer(false);
    expect(await outcome).toEqual({ status: 'cancelled' });
    expect(sent.calls).toEqual([]);
    expect(takenMissions.get(NALOXONE.key)!.reports).toBeUndefined();
  });

  it('keeps no report when no relay took it', async () => {
    sent.fail = true;
    const mission = takenMissions.take(NALOXONE);
    const outcome = reviewMissionReport(mission, { kits: 3 }, NOW);
    await answer(true);
    await expect(outcome).rejects.toThrow(/No relay took it/);
    expect(takenMissions.get(NALOXONE.key)!.reports).toBeUndefined();
  });

  it('sends nothing to a publisher that names no inbox for sealed messages, and says so before any review', async () => {
    inbox.relays = [];
    const mission = takenMissions.take(NALOXONE);
    expect(await reviewMissionReport(mission, { kits: 3 }, NOW)).toEqual({
      status: 'refused', reason: 'The publisher names no inbox for sealed messages, so a report cannot reach it privately. Nothing was sent.',
    });
    expect(currentReview()).toBeNull();
    expect(sent.calls).toEqual([]);
  });

  it('pauses a report to a publisher whose key is exposed, before any review, even when it names an inbox (NavCom §5.0)', async () => {
    const EXPOSED = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
    const mission = takenMissions.take({ ...NALOXONE, key: `${EXPOSED}:x`, coordinate: `30079:${EXPOSED}:x`, signer: EXPOSED });
    expect(await reviewMissionReport(mission, { kits: 3 }, NOW)).toEqual({
      status: 'refused',
      reason: 'Reports to this publisher are paused. The key it posted this under was exposed on 2026-09-28, so a sealed report could show who sent it. They resume when its new key starts. Nothing was sent.',
    });
    expect(currentReview()).toBeNull();
    expect(sent.calls).toEqual([]);
    expect(takenMissions.get(mission.key)!.reports).toBeUndefined();
  });

  it('refuses, before any review, a mission that names no counts, or a report that gives none', async () => {
    const bare = takenMissions.take({ ...NALOXONE, key: 'k:bare', counts: [] });
    expect(await reviewMissionReport(bare, { kits: 3 }, NOW)).toEqual({ status: 'refused', reason: 'This mission names no counts to report.' });
    const mission = takenMissions.take(NALOXONE);
    expect(await reviewMissionReport(mission, { kits: -1, trainings: 1.5 }, NOW)).toMatchObject({ status: 'refused' });
    expect(currentReview()).toBeNull();
    expect(sent.calls).toEqual([]);
  });
});
