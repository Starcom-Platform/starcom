/**
 * Posting a step label through the review every publish passes (decision D-RS, RS55–RS57): what it says, that only
 * the team's members read it, and the team's relay as its one destination; signed and sent on a yes, never on a no.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentReview, decideReview } from '../publishReview';

const sent = vi.hoisted(() => ({ signed: [] as Array<{ kind: number; tags: string[][]; content: string; relays: string[] }> }));
vi.mock('../../roster/sendRoster', () => ({
  sendSignedRoster: vi.fn(async (template: { kind: number; tags: string[][]; content: string }, relays: string[]) => {
    sent.signed.push({ ...template, relays }); return { relays: relays.length };
  }),
  sendSealedRoster: vi.fn(),
}));

import { reviewStepLabel } from '../stepPosts';

const MISSION = { coordinate: `30079:${'a'.repeat(64)}:starcom_mission_package_swifts`, title: 'Count the swifts' };
const TEAM = { relay: 'wss://team.example.org', name: 'Bay Area crew' };
const NOW = Date.parse('2026-10-18T20:00:00Z');
const SAM = 'c'.repeat(64);

async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

beforeEach(() => { sent.signed.length = 0; });

describe('reviewStepLabel', () => {
  it('shows a take as it will be posted, to the team only, for 24 hours, and sends it on a yes', async () => {
    const outcome = reviewStepLabel(TEAM, MISSION, { id: 's1', ask: 'Find a chimney roost.' }, 'taken', {}, NOW);
    const shown = await answer(true);
    expect(shown.act).toBe('Take this step');
    expect(shown.content.title).toBe('Count the swifts: Find a chimney roost.');
    expect(shown.content.fields.find((f) => f.label === 'Who can read it')?.value).toBe("Bay Area crew's members, on the team's own relay.");
    expect(shown.content.fields.find((f) => f.label === 'How long')?.value).toBe('24 hours, or until you release it.');
    expect(shown.destinations.map((d) => d.address)).toEqual(['wss://team.example.org']);
    expect(await outcome).toEqual({ status: 'sent', result: { relays: 1 } });
    expect(sent.signed).toHaveLength(1);
    expect(sent.signed[0]).toMatchObject({ kind: 1985, relays: ['wss://team.example.org'] });
    expect(sent.signed[0].tags).toEqual(expect.arrayContaining([['l', 'taken', 'starcom.step'], ['a', MISSION.coordinate], ['step', 's1'], ['expiration', String(NOW / 1000 + 86_400)]]));
  });

  it('a check names whose done it checks, its note shown and sent', async () => {
    const outcome = reviewStepLabel(TEAM, MISSION, { id: 's1', ask: 'Find a chimney roost.' }, 'checked', { doer: SAM, note: 'Saw it myself.' }, NOW);
    const shown = await answer(true);
    expect(shown.act).toBe('Check this step');
    expect(shown.content.body).toBe('Saw it myself.');
    await outcome;
    expect(sent.signed[0].tags).toEqual(expect.arrayContaining([['l', 'checked', 'starcom.step'], ['p', SAM]]));
    expect(sent.signed[0].content).toBe('Saw it myself.');
  });

  it('sends nothing on a no, and refuses a team relay that is not one', async () => {
    const outcome = reviewStepLabel(TEAM, MISSION, { id: 's1', ask: 'Find a chimney roost.' }, 'done', {}, NOW);
    await answer(false);
    expect(await outcome).toEqual({ status: 'cancelled' });
    expect(sent.signed).toHaveLength(0);
    expect(await reviewStepLabel({ relay: 'https://team.example.org', name: 'x' }, MISSION, { id: 's1', ask: 'x' }, 'taken', {}, NOW))
      .toEqual({ status: 'refused', reason: "A team's relay is a wss:// address." });
    expect(await reviewStepLabel(TEAM, MISSION, { id: 's1', ask: 'x' }, 'checked', {}, NOW))
      .toEqual({ status: 'refused', reason: 'A check names whose step it checks.' });
  });
});
