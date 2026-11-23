/**
 * Calling an adventure posts its caller's inbox list beside it, once (RS41, after MX32): a return is sealed to the
 * caller and sent only to the inbox they name, so without one no return could reach them.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentReview, decideReview } from '../publishReview';

vi.mock('../../roster/sendRoster', () => ({
  sendSignedRoster: vi.fn(async (_t: unknown, relays: string[]) => ({ relays: relays.length })),
  sendSealedRoster: vi.fn(async () => ({ relays: 1, to: 1 })),
}));
const inbox = vi.hoisted(() => ({ named: [] as string[] }));
vi.mock('../../nostr/inboxRelays', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../nostr/inboxRelays')>()),
  inboxRelays: vi.fn(async () => inbox.named),
}));
const signed = vi.hoisted(() => ({ calls: [] as Array<{ kind: number }> }));
vi.mock('../../nostr/sendSigned', () => ({
  sendSignedEvent: vi.fn(async (template: { kind: number }) => { signed.calls.push({ kind: template.kind }); return { relays: 1, event: {} }; }),
}));

import { reviewRosterPost } from '../rosterPosts';
import { saveDraft, removeDraft } from '../../roster/rosterDrafts';
import nostrService from '../../nostrService';

const NOW = Date.parse('2026-10-17T00:00:00Z');
const ADVENTURE = {
  d: 'adventure-aurora-mn', kind: 'adventure' as const, title: 'Aurora tonight over Minnesota', purpose: 'Look north from a dark public place.',
  places: ['us-mn'], toward: [], counts: [{ coordinate: `30079:${'b'.repeat(64)}:starcom_mission_package_aurora-watch`, relay: '' }], limits: [], text: '',
  window: { from: '2026-10-17T02:00Z', until: '2026-10-17T09:00Z' },
  call: { what: 'Aurora likely as far south as Minnesota', odds: 'Kp 7 forecast', source: 'https://www.swpc.noaa.gov/' },
  hazards: ['Cold after midnight'], access: 'public' as const, fromHome: "Watch NOAA's live oval.",
};

async function postAndSay(yes = true) {
  const outcome = reviewRosterPost(ADVENTURE.d, { kind: 'public' }, NOW);
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, yes, { acknowledged: true });
  return { shown, outcome: await outcome };
}

beforeEach(() => {
  // A caller with a key: one with none yet is offered the inbox from the adventure's view instead.
  if (!nostrService.hasIdentity()) nostrService.ensureIdentity('calling an adventure');
  signed.calls.length = 0;
  inbox.named = [];
  removeDraft(ADVENTURE.d);
  expect(saveDraft(ADVENTURE)).toEqual({ ok: true });
});

describe('calling an adventure', () => {
  it("posts its caller's inbox list beside it when they name none, saying so in the review", async () => {
    const { shown, outcome } = await postAndSay();
    expect(shown.content.fields.find((f) => f.label === 'Your inbox')?.value).toMatch(/^Also posts where you take sealed messages, so its returns can reach you: wss:\/\//);
    expect(outcome.status).toBe('sent');
    expect(signed.calls).toEqual([{ kind: 10050 }]);
  });

  it('posts nothing more when they name an inbox already, and nothing on a no', async () => {
    inbox.named = ['wss://inbox.example'];
    const { shown } = await postAndSay();
    expect(shown.content.fields.some((f) => f.label === 'Your inbox')).toBe(false);
    inbox.named = [];
    removeDraft(ADVENTURE.d);
    saveDraft(ADVENTURE);
    await postAndSay(false);
    expect(signed.calls).toEqual([]);
  });
});

describe('posting anything else', () => {
  it('posts no inbox list beside it', async () => {
    removeDraft('directive-x');
    saveDraft({ d: 'directive-x', kind: 'directive', title: 'Map the supply', purpose: 'So that people know.', limits: [], places: [], toward: [], counts: [], text: '' });
    const outcome = reviewRosterPost('directive-x', { kind: 'public' }, NOW);
    await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
    const shown = currentReview()!;
    expect(shown.content.fields.some((f) => f.label === 'Your inbox')).toBe(false);
    decideReview(shown.id, true, { acknowledged: true });
    await outcome;
    expect(signed.calls).toEqual([]);
  });
});

