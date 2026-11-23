/**
 * Posting a roster item where its author chose (decision D-RS, RS13–RS14): through the review every publish passes,
 * which shows the item as it will be signed or sealed, who can read it and the relays it goes over. Public, sealed
 * to invitees, or to a team's own relay; sent only on a yes, and kept with the draft where it went.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { currentReview, decideReview } from '../publishReview';

const sent = vi.hoisted(() => ({ signed: [] as Array<{ tags: string[][]; relays: string[] }>, sealed: [] as Array<{ tags: string[][]; to: readonly string[]; relays: string[] }> }));
vi.mock('../../roster/sendRoster', () => ({
  sendSignedRoster: vi.fn(async (template: { tags: string[][] }, relays: string[]) => { sent.signed.push({ tags: template.tags, relays }); return { relays: relays.length }; }),
  sendSealedRoster: vi.fn(async (template: { tags: string[][] }, to: readonly string[], relays: string[]) => { sent.sealed.push({ tags: template.tags, to, relays }); return { relays: 2, to: to.length }; }),
}));

import { reviewRosterPost } from '../rosterPosts';
import { saveDraft, getDraft, removeDraft } from '../../roster/rosterDrafts';
import { setPublishesAsAgent } from '../../identity/callsign';

const INVITEE_A = 'c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00';
const INVITEE_B = 'c'.repeat(64);
const NOW = Date.parse('2026-10-17T13:00:00Z');

async function answer(confirmed: boolean) {
  await vi.waitFor(() => expect(currentReview()?.state).toBe('deciding'));
  const shown = currentReview()!;
  decideReview(shown.id, confirmed, { acknowledged: true });
  return shown;
}

beforeEach(() => {
  sent.signed.length = 0; sent.sealed.length = 0;
  removeDraft('directive-1');
  saveDraft({
    d: 'directive-1', kind: 'directive', title: 'Map the drug supply at events', purpose: 'So that people know what is in circulation.',
    limits: ['Never name or place a person.'], places: ['us-ca'], toward: [], counts: [], text: 'What we look for.',
  });
});

describe('reviewRosterPost', () => {
  it('shows a public post as it will be signed, to anyone, for good, and posts it on a yes', async () => {
    const outcome = reviewRosterPost('directive-1', { kind: 'public' }, NOW);
    const shown = await answer(true);
    expect(shown.act).toBe('Post publicly');
    expect(shown.sealed).toBeFalsy();
    expect(shown.content.title).toBe('Directive: Map the drug supply at events');
    expect(shown.content.body).toBe('What we look for.');
    expect(shown.content.fields.find((f) => f.label === 'Who can read it')?.value).toBe('Anyone. A public relay keeps it, for good.');
    expect(shown.content.fields.find((f) => f.label === 'Limits')?.value).toBe('Never name or place a person.');
    expect(shown.destinations.map((d) => d.address)).toEqual(expect.arrayContaining(['wss://nos.lol']));
    expect(await outcome).toEqual({ status: 'sent', result: { relays: 5 } });
    expect(sent.signed).toHaveLength(1);
    expect(sent.signed[0].tags).toEqual(expect.arrayContaining([['d', 'directive-1'], ['roster', 'directive'], ['t', 'starcom_roster']]));
    expect(getDraft('directive-1')?.posts).toEqual([{ visibility: 'public', at: '2026-10-17T13:00:00.000Z', relays: 5 }]);
  });

  it('says so in the post when its key is marked an agent\'s, as a package does (MX14)', async () => {
    setPublishesAsAgent(true);
    const outcome = reviewRosterPost('directive-1', { kind: 'public' }, NOW);
    await answer(true);
    await outcome;
    const tags = sent.signed[0].tags;
    expect(tags.some((t) => t[0] === 'agent')).toBe(true);
    // Before its alt text, which stays last.
    expect(tags[tags.length - 1][0]).toBe('alt');
    setPublishesAsAgent(false);
  });

  it('seals an invite-only post to each invitee, saying only they can open it', async () => {
    const outcome = reviewRosterPost('directive-1', { kind: 'sealed', to: [INVITEE_A, INVITEE_B] }, NOW);
    const shown = await answer(true);
    expect(shown.act).toBe('Send to invitees');
    expect(shown.sealed).toBe(true);
    expect(shown.content.fields.find((f) => f.label === 'Who can read it')?.value)
      .toBe('Only the 2 people it is sealed to, by their keys: npub1crl7uqxqllhqps8lacqvpllwqrq0lmsqcrl7uqxqllhqps8lacqq9fxs3l, and one more.');
    expect(await outcome).toEqual({ status: 'sent', result: { relays: 2, to: 2 } });
    expect(sent.sealed[0].to).toEqual([INVITEE_A, INVITEE_B]);
    expect(sent.signed).toHaveLength(0);
    expect(getDraft('directive-1')?.posts).toEqual([{ visibility: 'sealed', at: '2026-10-17T13:00:00.000Z', relays: 2, to: 2 }]);
  });

  it('posts to a team\'s own relay, and nowhere else', async () => {
    const outcome = reviewRosterPost('directive-1', { kind: 'team', relay: 'wss://team.example.org', name: 'Bay Area crew' }, NOW);
    const shown = await answer(true);
    expect(shown.act).toBe('Post to the team');
    expect(shown.content.fields.find((f) => f.label === 'Who can read it')?.value).toBe("Bay Area crew's members, on the team's own relay.");
    expect(shown.destinations.map((d) => d.address)).toEqual(['wss://team.example.org']);
    await outcome;
    expect(sent.signed[0].relays).toEqual(['wss://team.example.org']);
  });

  it('sends nothing, and keeps no post, on a no', async () => {
    const outcome = reviewRosterPost('directive-1', { kind: 'public' }, NOW);
    await answer(false);
    expect(await outcome).toEqual({ status: 'cancelled' });
    expect(sent.signed).toHaveLength(0);
    expect(getDraft('directive-1')?.posts).toEqual([]);
  });

  it('refuses what it cannot post, before any review', async () => {
    expect(await reviewRosterPost('nothing-here', { kind: 'public' }, NOW)).toEqual({ status: 'refused', reason: 'There is no item "nothing-here" on this device.' });
    expect(await reviewRosterPost('directive-1', { kind: 'sealed', to: [] }, NOW)).toEqual({ status: 'refused', reason: 'Name at least one person to seal it to, by their key.' });
    expect(await reviewRosterPost('directive-1', { kind: 'sealed', to: ['not a key'] }, NOW)).toEqual({ status: 'refused', reason: 'Name at least one person to seal it to, by their key.' });
    expect(await reviewRosterPost('directive-1', { kind: 'team', relay: 'https://team.example.org', name: 'x' }, NOW)).toEqual({ status: 'refused', reason: "A team's relay is a wss:// address." });
    // A key whose secret is out: whoever holds it could open the seal and see who sent it (NavCom §5.0).
    expect(await reviewRosterPost('directive-1', { kind: 'sealed', to: [INVITEE_A, '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692'] }, NOW)).toEqual({
      status: 'refused', reason: expect.stringMatching(/^Nothing is sealed to this key\. Its secret was exposed on 2026-09-28.*Nothing was sent\.$/),
    });
  });

  it('refuses a story that names or places people, saying which line, however it is posted (RS51)', async () => {
    removeDraft('story-1');
    saveDraft({
      d: 'story-1', kind: 'story', title: 'After action: the aurora watch', limits: [], places: ['us-mn'], toward: [], counts: [],
      text: ['Clear skies by 02:00Z.', 'We stood at 44.98, -93.27 with @nightowl_42.'].join('\n'),
    });
    const said = [
      'Line 2 of its text: “@nightowl_42”. A story never names people: take out the handle.',
      'Line 2 of its text: “44.98, -93.27”. A story never places people: say the town or the state, not a point.',
    ].join('\n');
    for (const visibility of [{ kind: 'public' as const }, { kind: 'sealed' as const, to: [INVITEE_A] }]) {
      expect(await reviewRosterPost('story-1', visibility, NOW)).toEqual({ status: 'refused', reason: said });
    }
    expect(currentReview()).toBeNull();
    expect(sent.signed).toHaveLength(0);
    expect(sent.sealed).toHaveLength(0);
    removeDraft('story-1');
  });

  it('posts a story that names and places no one', async () => {
    removeDraft('story-2');
    saveDraft({ d: 'story-2', kind: 'story', title: 'After action: the aurora watch', limits: [], places: ['us-mn'], toward: [], counts: [], text: 'Clear skies over Duluth by 02:00Z; 12 of us saw it.' });
    const outcome = reviewRosterPost('story-2', { kind: 'public' }, NOW);
    await answer(true);
    expect(await outcome).toMatchObject({ status: 'sent' });
    removeDraft('story-2');
  });
});
