/**
 * A publisher's word on a report sealed to it (MX32), and its inbox list, each through the publish review: NavCom's
 * labels name the report and the mission, never who sent it; nothing is sent on a no.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentReview, decideReview } from '../publishReview';

const sent = vi.hoisted(() => ({ calls: [] as Array<{ template: { kind: number; tags: string[][]; content: string }; relays: readonly string[] }> }));
/** No relay answers: what is signed is kept (W1b). */
const offline = vi.hoisted(() => ({ now: false }));
vi.mock('../../nostr/sendSigned', () => {
  class NoRelayTookIt extends Error {
    constructor(readonly event: object, readonly said: readonly string[] = []) { super('No relay took it.'); }
  }
  return {
    NoRelayTookIt,
    sendSignedEvent: vi.fn(async (template: { kind: number; tags: string[][]; content: string }, relays: readonly string[]) => {
      if (offline.now) throw new NoRelayTookIt({ ...template, id: `kept-${template.kind}`, pubkey: 'a'.repeat(64), created_at: 1, sig: 'x' });
      sent.calls.push({ template, relays });
      return { relays: relays.length, event: {} };
    }),
  };
});

import { reportLabelTemplate, reviewInboxList, reviewReportLabel } from '../reportLabels';
import { eventOutbox } from '../../intel/outbox/EventOutbox';

const ME = 'a'.repeat(64);
const MISSION = { title: 'Test the taps', visibility: 'public' as const, publishedAs: `30079:${ME}:starcom_mission_package_m1` };
const REPORT = { id: 'r'.repeat(64), coordinate: MISSION.publishedAs, from: 'b'.repeat(64), day: '2026-10-22', counts: [{ line: 'Taps tested: a count', n: 12 }], at: 1_792_627_200 };

async function answer(yes: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, yes, { acknowledged: true });
  return shown;
}

beforeEach(async () => {
  sent.calls.length = 0;
  offline.now = false;
  for (const kept of await eventOutbox.waiting()) await eventOutbox.cancel(kept.id);
});

describe('reviewReportLabel', () => {
  it("is NavCom's label: one word, the report by the id inside its seal, the mission by its a, no text", () => {
    expect(reportLabelTemplate('settled', REPORT)).toEqual({
      kind: 1985, content: '',
      tags: [['L', 'navcom.mission'], ['l', 'settled', 'navcom.mission'], ['e', REPORT.id], ['a', MISSION.publishedAs]],
    });
  });

  it('shows what settling says, and sends it on a yes to where the mission went', async () => {
    const outcome = reviewReportLabel(MISSION, REPORT, 'settled');
    const shown = await answer(true);
    expect(shown.act).toBe('Settle report');
    expect(shown.content.body).toBe('Taps tested: 12\nDay: 2026-10-22');
    expect(shown.content.fields.find((f) => f.label === 'Names')?.value).toMatch(/Never who sent it/);
    expect(await outcome).toMatchObject({ status: 'sent' });
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0].template.tags[1]).toEqual(['l', 'settled', 'navcom.mission']);
  });

  it('says a challenge reverses nothing, and sends nothing on a no', async () => {
    const outcome = reviewReportLabel(MISSION, REPORT, 'challenged');
    const shown = await answer(false);
    expect(shown.act).toBe('Challenge report');
    expect(shown.content.fields.find((f) => f.label === 'Says')?.value).toMatch(/reverses nothing/);
    expect((await outcome).status).not.toBe('sent');
    expect(sent.calls).toEqual([]);
  });

  it('refuses a report on another mission, and a mission that goes nowhere, before any review', async () => {
    expect(await reviewReportLabel(MISSION, { ...REPORT, coordinate: `30079:${ME}:other` }, 'settled')).toEqual({ status: 'refused', reason: 'That report is not on this mission. Nothing was sent.' });
    expect((await reviewReportLabel({ ...MISSION, visibility: 'private' }, REPORT, 'settled')).status).toBe('refused');
    expect(currentReview()).toBeNull();
    expect(sent.calls).toEqual([]);
  });
});

describe('reviewInboxList', () => {
  it('shows the public relays this browser takes sealed messages on, and posts the list on a yes', async () => {
    const outcome = reviewInboxList();
    const shown = await answer(true);
    expect(shown.act).toBe('Post your inbox');
    expect(await outcome).toMatchObject({ status: 'sent' });
    const tags = sent.calls[0].template.tags;
    expect(sent.calls[0].template.kind).toBe(10050);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((t) => t[0] === 'relay' && /^wss:\/\//.test(t[1]))).toBe(true);
  });
});

describe('with no relay answering (W1b)', () => {
  it('keeps a settlement, and an inbox list, to go when a relay answers, and says so', async () => {
    offline.now = true;
    const settling = reviewReportLabel(MISSION, REPORT, 'settled');
    await answer(true);
    expect(await settling).toEqual({ status: 'sent', result: { relays: 0, kept: true } });
    const posting = reviewInboxList();
    const shown = await answer(true);
    expect(shown.act).toBe('Post your inbox');
    expect(await posting).toEqual({ status: 'sent', result: { relays: 0, kept: true } });
    expect((await eventOutbox.waiting()).map((r) => r.event.kind).sort((a, b) => a - b)).toEqual([1985, 10050]);
    expect(sent.calls).toEqual([]);
  });
});
