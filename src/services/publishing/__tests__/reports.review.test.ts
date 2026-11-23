/**
 * Publishing one report to the globe (decision D-RP), through the review every publish passes: the note as it
 * will be signed and its place as others read it; on a yes it goes to the public intel relays and the report
 * records where; publishing again keeps its first date and replaces it; a no, or a refusal, sends nothing.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentReview, decideReview } from '../publishReview';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const sent = vi.hoisted(() => [] as Array<{ kind: number; tags: string[][]; content: string; relays: string[]; at: number }>);
const refuseKinds = vi.hoisted(() => new Set<number>());
/** No relay answers at all: what is signed is kept (W1). */
const offline = vi.hoisted(() => ({ now: false, said: [] as string[] }));
vi.mock('../../nostr/sendSigned', () => {
  class NoRelayTookIt extends Error {
    constructor(readonly event: object, readonly said: readonly string[] = []) { super('No relay took it.'); }
  }
  return {
    NoRelayTookIt,
    sendSignedEvent: vi.fn(async (template: { kind: number; tags: string[][]; content: string }, relays: string[], at: number) => {
      if (offline.now) throw new NoRelayTookIt({ ...template, id: `kept-${template.kind}-${at}`, pubkey: 'f'.repeat(64), created_at: Math.floor(at / 1000), sig: 'x' }, offline.said);
      if (refuseKinds.has(template.kind)) throw new Error('No relay took it: blocked');
      sent.push({ ...template, relays, at });
      return { relays: relays.length, event: { id: `event-${sent.length}` } };
    }),
  };
});
const PUBKEY = 'f'.repeat(64);

import { reviewReportPublish, reviewReportWithdrawal } from '../reports';
import { nostrIdentityService } from '../../identity/NostrIdentityService';
import { publishRelays } from '../../nostr/publishTargets';
import { isOwnPublishedReport, publishedReport } from '../../intel/publishedReports';
import { eventOutbox, type WaitingEvent } from '../../intel/outbox/EventOutbox';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'Berth 4 cranes at night', content: 'Three cranes working after 02:00.', author: PUBKEY, category: 'GENERAL',
  tags: ['port'], visibility: 'public', latitude: 40.6895, longitude: -74.1745, geoPrecisionM: 2_000, confidence: 0.5,
  createdAt: new Date(Date.UTC(2026, 10, 19)), updatedAt: new Date(Date.UTC(2026, 10, 19, 1)), status: 'DRAFT', history: [], ...over,
});
const NOW = Date.UTC(2026, 10, 20, 12);

/** What the outbox keeps for a report, as the report panel finds it. */
const keptForReport = (records: readonly WaitingEvent[], report: string) => ({
  publish: records.find((r) => r.after && 'published' in r.after && r.after.published.report === report),
  withdrawal: records.find((r) => r.after && 'withdrawn' in r.after && r.after.withdrawn.report === report),
});

async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

beforeEach(async () => {
  sent.length = 0;
  refuseKinds.clear();
  offline.now = false;
  offline.said = [];
  for (const kept of await eventOutbox.waiting()) await eventOutbox.cancel(kept.id);
  localStorage.clear();
  vi.spyOn(nostrIdentityService, 'refreshSigner').mockResolvedValue(PUBKEY);
  vi.spyOn(nostrIdentityService, 'asSigner').mockReturnValue({ getPublicKey: async () => PUBKEY } as never);
});

describe('reviewReportPublish', () => {
  it('shows the note and where others will place it, then sends it to the public intel relays and records it', async () => {
    const outcome = reviewReportPublish(report(), NOW);
    const shown = await answer(true);
    expect(shown.act).toBe('Publish the report');
    expect(shown.content.body).toBe('Berth 4 cranes at night\n\nThree cranes working after 02:00.');
    const field = (label: string) => shown.content.fields.find((f) => f.label === label)?.value;
    expect(field('Place')).toMatch(/^Near 40\.69°, -74\.17°, as geohash [0-9a-z]{6}: other globes place it within 684 m of your point, known to within 2\.0 km\.$/);
    expect(field('Topics')).toBe('port');
    expect(field('Stays on this device')).toBe('its confidence.');
    expect(field('Who can read it')).toMatch(/cannot be recalled/);
    expect(shown.destinations.map((d) => d.address)).toEqual(publishRelays('INTEL'));
    expect(await outcome).toEqual({ status: 'sent', result: { relays: publishRelays('INTEL').length } });
    expect(sent).toHaveLength(1);
    expect(sent[0].kind).toBe(30023);
    expect(sent[0].relays).toEqual(publishRelays('INTEL'));
    expect(sent[0].tags).toContainEqual(['published_at', String(NOW / 1000)]);
    expect(publishedReport('r1')).toMatchObject({ address: `30023:${PUBKEY}:r1`, eventId: 'event-1', firstAt: NOW, at: NOW });
    expect(isOwnPublishedReport(`30023:${PUBKEY}:r1`)).toBe(true);
  });

  it('publishes again at the same address, keeping when it was first published', async () => {
    const first = reviewReportPublish(report(), NOW);
    await answer(true);
    await first;
    const later = NOW + 3_600_000;
    const again = reviewReportPublish(report({ content: 'Four cranes now.' }), later);
    const shown = await answer(true);
    expect(shown.act).toBe('Publish the report again');
    expect(shown.content.fields.find((f) => f.label === 'Replaces')?.value).toBe('The version published 2026-11-20 12:00 UTC');
    await again;
    expect(sent[1].tags).toContainEqual(['d', 'r1']);
    expect(sent[1].tags).toContainEqual(['published_at', String(NOW / 1000)]);
    expect(publishedReport('r1')).toMatchObject({ firstAt: NOW, at: later, eventId: 'event-2' });
  });

  it('sends nothing on a no, and nothing for a report that may not go', async () => {
    const outcome = reviewReportPublish(report(), NOW);
    await answer(false);
    expect(await outcome).toEqual({ status: 'cancelled' });
    expect(await reviewReportPublish(report({ visibility: 'limited' }), NOW)).toMatchObject({ status: 'refused' });
    expect(await reviewReportPublish(report({ sample: true }), NOW)).toMatchObject({ status: 'refused' });
    expect(sent).toEqual([]);
    expect(publishedReport('r1')).toBeNull();
  });
});

describe('reviewReportWithdrawal (RP7)', () => {
  async function publishFirst() {
    const first = reviewReportPublish(report(), NOW);
    await answer(true);
    await first;
    sent.length = 0;
  }

  it('asks relays to delete it, then replaces it a second later with a notice, and records the withdrawal', async () => {
    await publishFirst();
    const later = NOW + 600_000;
    const outcome = reviewReportWithdrawal(report(), later);
    const shown = await answer(true);
    expect(shown.act).toBe('Withdraw the report');
    expect(shown.content.body).toBe('Withdrawn by its author.');
    expect(shown.content.fields.find((f) => f.label === 'Replaces')?.value).toBe('The version published 2026-11-20 12:00 UTC');
    expect(await outcome).toEqual({ status: 'sent', result: { relays: publishRelays('INTEL').length } });
    expect(sent.map((e) => [e.kind, e.at])).toEqual([[5, later], [30023, later + 1000]]);
    expect(sent[0].tags).toEqual([['a', `30023:${PUBKEY}:r1`], ['e', 'event-1'], ['k', '30023']]);
    expect(sent[1].tags).toContainEqual(['t', 'retracted']);
    expect(JSON.stringify(sent)).not.toContain('cranes');
    expect(publishedReport('r1')).toMatchObject({ withdrawnAt: later, eventId: 'event-2', firstAt: NOW });
    expect(await reviewReportWithdrawal(report(), later)).toEqual({ status: 'refused', reason: 'This report is already withdrawn.' });
  });

  it('still replaces it when every relay refuses the deletion request', async () => {
    await publishFirst();
    refuseKinds.add(5);
    const outcome = reviewReportWithdrawal(report(), NOW + 1);
    await answer(true);
    expect(await outcome).toMatchObject({ status: 'sent' });
    expect(sent.map((e) => e.kind)).toEqual([30023]);
    expect(publishedReport('r1')?.withdrawnAt).toBe(NOW + 1);
  });

  it('refuses what was not published here, or under another key; publishing again clears the withdrawal', async () => {
    expect(await reviewReportWithdrawal(report(), NOW)).toMatchObject({ status: 'refused', reason: expect.stringMatching(/not published from this browser/) });
    await publishFirst();
    vi.spyOn(nostrIdentityService, 'refreshSigner').mockResolvedValue('a'.repeat(64));
    expect(await reviewReportWithdrawal(report(), NOW)).toMatchObject({ status: 'refused', reason: expect.stringMatching(/another key/) });
    vi.spyOn(nostrIdentityService, 'refreshSigner').mockResolvedValue(PUBKEY);
    const withdrawing = reviewReportWithdrawal(report(), NOW + 1);
    await answer(true);
    await withdrawing;
    const again = reviewReportPublish(report(), NOW + 2);
    await answer(true);
    await again;
    expect(publishedReport('r1')?.withdrawnAt).toBeUndefined();
    expect(sent.at(-1)?.tags).toContainEqual(['published_at', String(NOW / 1000)]);
  });
});

describe('with no relay answering (W1)', () => {
  it('keeps the note, as signed, to go when a relay answers; the report is not published until then', async () => {
    offline.now = true;
    const outcome = reviewReportPublish(report(), NOW);
    await answer(true);
    expect(await outcome).toEqual({ status: 'sent', result: { relays: 0, kept: true } });
    expect(publishedReport('r1')).toBeNull();
    const kept = keptForReport(await eventOutbox.waiting(), 'r1').publish;
    expect(kept).toMatchObject({
      id: `kept-30023-${NOW}`,
      relays: publishRelays('INTEL'),
      after: { published: { report: 'r1', address: `30023:${PUBKEY}:r1`, firstAt: NOW, reportUpdatedAt: Date.UTC(2026, 10, 19, 1) } },
    });
    expect(isOwnPublishedReport(`30023:${PUBKEY}:r1`)).toBe(false);
  });

  it('keeps nothing every relay refused for good, and says why, as before', async () => {
    offline.now = true;
    offline.said = ['blocked: this relay is not taking events from this key'];
    const outcome = reviewReportPublish(report(), NOW);
    await answer(true);
    await expect(outcome).rejects.toThrow('No relay took it.');
    expect(await eventOutbox.waiting()).toEqual([]);
    expect(publishedReport('r1')).toBeNull();
  });

  it('keeps a withdrawal\'s request and notice, and the report says withdrawn only once the notice goes', async () => {
    const first = reviewReportPublish(report(), NOW);
    await answer(true);
    await first;
    offline.now = true;
    const outcome = reviewReportWithdrawal(report(), NOW + 60_000);
    await answer(true);
    expect(await outcome).toEqual({ status: 'sent', result: { relays: 0, kept: true } });
    expect(publishedReport('r1')?.withdrawnAt).toBeUndefined();
    const waiting = await eventOutbox.waiting();
    expect(waiting.map((r) => r.event.kind)).toEqual([5, 30023]);
    expect(keptForReport(waiting, 'r1').withdrawal?.after).toEqual({ withdrawn: { report: 'r1', at: NOW + 60_000 } });
  });
});
