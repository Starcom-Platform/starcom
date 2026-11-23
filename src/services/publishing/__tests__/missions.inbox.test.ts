/**
 * A mission that asks for counts posts its publisher's inbox list beside its package, once (MX32): a report is sealed
 * to the publisher and sent only to the inbox they name (MX28), so without one no report could reach them. The review
 * shows it, and where it goes; a publisher who names an inbox already posts nothing more.
 */
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { missionService } from '../../intel/MissionService';
import { intelReportService } from '../../intel/IntelReportService';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { MissionStatus } from '../../../types/intel/MissionUI';
import { currentReview, decideReview } from '../publishReview';
import { reviewMissionPackage } from '../missions';

const publishMissionPackage = vi.fn();
vi.mock('../../intel/capability/missionCapability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../intel/capability/missionCapability')>();
  return { ...actual, mintRootGrantSigned: vi.fn(async () => ({ id: 'cap-root' })), verifyGrantChain: vi.fn(() => ({ ok: true, reason: undefined })) };
});
vi.mock('../../intel/MissionPackageBroadcastService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../intel/MissionPackageBroadcastService')>();
  return { ...actual, MissionPackageBroadcastService: class { publishMissionPackage(...args: unknown[]) { return publishMissionPackage(...args); } dispose() {} } };
});
const inbox = vi.hoisted(() => ({ named: [] as string[] }));
vi.mock('../../nostr/inboxRelays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../nostr/inboxRelays')>()),
  inboxRelays: vi.fn(async () => inbox.named),
}));
const signed = vi.hoisted(() => ({ calls: [] as Array<{ kind: number; tags: string[][]; to: readonly string[] }> }));
vi.mock('../../nostr/sendSigned', () => ({
  sendSignedEvent: vi.fn(async (template: { kind: number; tags: string[][] }, to: readonly string[]) => { signed.calls.push({ kind: template.kind, tags: template.tags, to }); return { relays: 1, event: {} }; }),
}));

async function readyMission(title: string, countLines?: string[]) {
  const created = await missionService.createMission({ title, briefing: 'Two of the five sites look closed.', relatedReports: ['report-fixture-1'], visibility: 'public' });
  if (countLines) await missionService.saveMission({ ...(await missionService.getMission(created.id))!, countLines });
  await missionService.updateStatus(created.id, MissionStatus.PLANNING);
  return (await missionService.updateStatus(created.id, MissionStatus.READY_FOR_PACKAGE))!;
}

beforeAll(async () => {
  await intelReportService.importReport({
    id: 'report-fixture-1', title: 'Fixture report', content: 'Two of the five sites look closed.',
    author: 'analyst-1', category: 'general', tags: [], createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT',
  } as IntelReportUI, { strategy: 'skip' });
});
beforeEach(() => {
  publishMissionPackage.mockReset();
  publishMissionPackage.mockResolvedValue({ success: true, eventId: 'evt', relaysOk: 1, relaysTried: 1, coordinate: '30079:x:y' });
  signed.calls.length = 0;
  inbox.named = [];
});
afterEach(async () => {
  for (let i = 0; i < 50 && currentReview(); i++) { decideReview(currentReview()!.id, false); await new Promise((r) => setTimeout(r, 0)); }
});

describe('a mission that asks for counts', () => {
  it('posts its publisher\'s inbox list beside its package when they name none, saying so in the review', async () => {
    const mission = await readyMission('Test the taps', ['Taps tested: a count']);
    const outcome = reviewMissionPackage(mission.id);
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
    const shown = currentReview()!;
    expect(shown.content.fields.find((f) => f.label === 'Your inbox')?.value).toMatch(/^Also posts where you take sealed messages, so its reports can reach you: wss:\/\//);
    decideReview(shown.id, true, { acknowledged: true });
    expect(await outcome).toMatchObject({ status: 'sent' });
    expect(publishMissionPackage).toHaveBeenCalledTimes(1);
    expect(signed.calls).toHaveLength(1);
    expect(signed.calls[0].kind).toBe(10050);
    expect(signed.calls[0].tags.every((t) => t[0] === 'relay')).toBe(true);
    expect(shown.destinations.map((d) => d.address)).toEqual(expect.arrayContaining(signed.calls[0].to as string[]));
  });

  it('posts nothing more when they name an inbox already, nor for a mission that asks no counts', async () => {
    inbox.named = ['wss://inbox.example'];
    const counting = await readyMission('Counting, inbox named', ['Taps tested: a count']);
    let outcome = reviewMissionPackage(counting.id);
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
    expect(currentReview()!.content.fields.some((f) => f.label === 'Your inbox')).toBe(false);
    decideReview(currentReview()!.id, true, { acknowledged: true });
    await outcome;
    inbox.named = [];
    const plain = await readyMission('Counting nothing');
    outcome = reviewMissionPackage(plain.id);
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
    decideReview(currentReview()!.id, true, { acknowledged: true });
    await outcome;
    expect(signed.calls).toEqual([]);
  });
});
