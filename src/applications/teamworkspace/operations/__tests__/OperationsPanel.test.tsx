/**
 * Operations, the roster's tab in the Missions app (decision D-RS, RS13–RS22): a Directive or an Epic made and kept
 * on this device, posted through the review publicly, sealed to invitees or to a team; everyone's public items
 * shown unmarked, each publisher followed with a click and theirs put first; an item opened with its two kinds of
 * link said apart.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import type { ReadRosterItem } from '../../../../services/roster/rosterItem';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const read = vi.hoisted(() => ({ items: [] as ReadRosterItem[], listeners: new Set<() => void>(), status: { loaded: true, error: null as string | null, at: 1 } }));
vi.mock('../../../../services/roster/rosterRead', () => ({
  rosterItems: () => read.items,
  rosterReadStatus: () => read.status,
  subscribeRoster: (l: () => void) => { read.listeners.add(l); return () => read.listeners.delete(l); },
  startRosterRead: () => () => {},
}));
const posted = vi.hoisted(() => ({ calls: [] as Array<{ d: string; visibility: unknown }> }));
vi.mock('../../../../services/publishing/rosterPosts', () => ({
  reviewRosterPost: vi.fn(async (d: string, visibility: unknown) => { posted.calls.push({ d, visibility }); return { status: 'sent', result: { relays: 5 } }; }),
}));
vi.mock('../../../../services/identity/signerProfiles', () => ({ verifySigners: vi.fn(async () => undefined) }));
vi.mock('../../../../services/RealTimeTeamService', () => ({
  realTimeTeamService: { getTeams: () => [
    { id: 't1', name: 'Bay Area crew', relayUrl: 'wss://team.example.org', members: [] },
    { id: 't2', name: 'Not joined', relayUrl: 'wss://other.example.org', members: [] },
  ] },
}));
vi.mock('../../../../services/nostr/joinedRelays', () => ({
  isJoinedRelay: (url: string) => url === 'wss://team.example.org',
  joinedRelays: () => [],
  subscribeJoinedRelays: () => () => {},
}));
// The caller's inbox, asked of relays by an adventure's returns: none reached from a test.
vi.mock('../../../../services/nostr/inboxRelays', () => ({ inboxRelays: async () => ['wss://inbox.example'] }));

const totals = vi.hoisted(() => ({ store: null as null | { of: (c: string) => unknown } }));
vi.mock('../../../../services/roster/missionTotals', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../services/roster/missionTotals')>();
  return {
    ...real,
    missionTotals: () => totals.store ?? new real.MissionTotalsStore(),
    missionTotalsVersion: () => 1,
    subscribeMissionTotals: () => () => {},
    startMissionTotalsRead: () => () => {},
  };
});

const received = vi.hoisted(() => ({ accepted: [] as unknown[] }));
vi.mock('../../../../services/intel/useReceivedPackages', () => ({
  useReceivedPackages: () => ({ accepted: received.accepted, refused: [], counters: {}, publishers: [], loaded: true }),
}));
vi.mock('../../../../services/intel/received/missionCard', () => ({
  missionCardOf: (p: { headline: string; where?: string }) => ({ headline: p.headline, ...(p.where ? { where: p.where } : {}) }),
}));
const nws = vi.hoisted(() => ({ answer: { warnings: [] as unknown[], failed: [] as string[] }, asked: [] as string[][] }));
vi.mock('../../../../services/roster/adventureWarnings', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../services/roster/adventureWarnings')>();
  return { ...real, fetchWarnings: vi.fn(async (states: string[]) => { nws.asked.push(states); return nws.answer; }) };
});
const returned = vi.hoisted(() => ({ calls: [] as Array<{ address: string; seen: boolean; counts: unknown }> }));
vi.mock('../../../../services/publishing/adventureReturns', () => ({
  reviewAdventureReturn: vi.fn(async (item: { address: string }, seen: boolean, counts: unknown) => {
    returned.calls.push({ address: item.address, seen, counts });
    return { status: 'sent', result: { relays: 2 } };
  }),
}));
// Taking a mission is the Missions tab's own dialog, tested there; here, which mission it is offered for.
vi.mock('../../missions/TakeMission', () => ({
  TakeMission: ({ pkg }: { pkg: { headline: string } }) => <button type="button">{`Take on ${pkg.headline}`}</button>,
}));

import OperationsPanel from '../OperationsPanel';
import { MissionTotalsStore } from '../../../../services/roster/missionTotals';
import { nostrIdentityService } from '../../../../services/identity/NostrIdentityService';
import { listDrafts, removeDraft } from '../../../../services/roster/rosterDrafts';
import { isFollowed, unfollow } from '../../../../services/roster/follows';
import { takenMissions } from '../../../../services/intel/received/takenMissions';
import { leaveQuestLine, startedQuestLines } from '../../../../services/roster/questProgress';
import { resetAdventures, recordReturn, agreeToWarning, GOING_OUT_AGREEMENT } from '../../../../services/roster/adventure';
import { ageAnswer, resetAge, setAgeAnswer } from '../../../../services/identity/ageAnswer';

const item = (over: Partial<ReadRosterItem> = {}): ReadRosterItem => ({
  d: 'directive-x', kind: 'directive', title: 'Map the drug supply at events', purpose: 'So that people know.',
  limits: ['Never name a person.'], places: [], toward: [], counts: [], text: 'Why.',
  author: B, createdAt: 1_792_200_000, address: `30084:${B}:directive-x`, ...over,
});

beforeEach(() => {
  // Whose key signs here: an item kept on this device is addressed by it.
  vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(A);
  for (const d of listDrafts()) removeDraft(d.d);
  unfollow(A); unfollow(B);
  read.items = [];
  posted.calls.length = 0;
  takenMissions.reset();
  for (const s of startedQuestLines()) leaveQuestLine(s.address);
  received.accepted = [];
  resetAge();
  resetAdventures();
});

describe('OperationsPanel', () => {
  it('says plainly when nothing is kept here, and offers a directive or an epic', () => {
    render(<OperationsPanel />);
    expect(screen.getByTestId('operations-own').textContent).toContain('Nothing on this device yet.');
    expect(screen.getByRole('button', { name: 'New directive' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New epic' })).toBeTruthy();
    expect(screen.getByTestId('operations-everyone').textContent).toContain('None posted yet.');
    expect(screen.getByTestId('operations-quests').textContent).toContain('No quests yet. Set one, or start a quest line.');
  });

  it('makes a directive and keeps it on this device', () => {
    render(<OperationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'New directive' }));
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Map the drug supply at events' } });
    fireEvent.change(within(form).getByLabelText('Intent'), { target: { value: 'So that people know what is in circulation.' } });
    fireEvent.change(within(form).getByLabelText('End state'), { target: { value: 'Every big event has a check.' } });
    fireEvent.change(within(form).getByLabelText('Limits, one a line'), { target: { value: 'Never name a person.\nPublic places only.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    const [kept] = listDrafts();
    expect(kept).toMatchObject({ kind: 'directive', title: 'Map the drug supply at events', endState: 'Every big event has a check.', limits: ['Never name a person.', 'Public places only.'] });
    expect(screen.getByTestId('operations-own').textContent).toContain('Map the drug supply at events');
    expect(screen.getByTestId('operations-own').textContent).toContain('Not posted');
  });

  it('makes an epic with its criteria as counts, and says why one cannot be kept', () => {
    render(<OperationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'New epic' }));
    const form = screen.getByTestId('roster-editor');
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(within(form).getByRole('alert').textContent).toBe('Give it a title.');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Every Bay Area venue checked' } });
    fireEvent.change(within(form).getByLabelText('So that'), { target: { value: 'No one buys blind.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add a criterion' }));
    fireEvent.change(within(form).getByLabelText('Criterion 1'), { target: { value: 'Venues checked' } });
    fireEvent.change(within(form).getByLabelText('Target 1'), { target: { value: '40' } });
    fireEvent.change(within(form).getByLabelText('Evidence standard'), { target: { value: 'A named lab result, linked.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(listDrafts()[0]).toMatchObject({ kind: 'epic', criteria: [{ label: 'Venues checked', target: 40 }], evidence: 'A named lab result, linked.' });
  });

  it('posts a kept item through the review, publicly, to invitees or to a team', async () => {
    render(<OperationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'New directive' }));
    fireEvent.change(within(screen.getByTestId('roster-editor')).getByLabelText('Title'), { target: { value: 'Map the drug supply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep on this device' }));
    const d = listDrafts()[0].d;
    fireEvent.click(within(screen.getByTestId('operations-own')).getByRole('button', { name: 'Post' }));
    const dialog = screen.getByTestId('roster-post');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(posted.calls).toEqual([{ d, visibility: { kind: 'public' } }]));
    expect((await screen.findByTestId('roster-post-outcome')).textContent).toBe('Posted: 5 relays took it.');

    fireEvent.click(within(screen.getByTestId('operations-own')).getByRole('button', { name: 'Post' }));
    const again = screen.getByTestId('roster-post');
    fireEvent.click(within(again).getByLabelText('Invite-only'));
    fireEvent.change(within(again).getByLabelText('Their keys'), { target: { value: `${A}, npub1vvquf5y6q9ysnedy3d7sex4gt8hvrzqyct7g0645us225k33j6fqfhv9ue` } });
    fireEvent.click(within(again).getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(posted.calls[1]).toEqual({ d, visibility: { kind: 'sealed', to: [A, '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692'] } }));

    fireEvent.click(within(screen.getByTestId('operations-own')).getByRole('button', { name: 'Post' }));
    const third = screen.getByTestId('roster-post');
    fireEvent.click(within(third).getByLabelText('A team'));
    fireEvent.click(within(third).getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(posted.calls[2]).toEqual({ d, visibility: { kind: 'team', relay: 'wss://team.example.org', name: 'Bay Area crew' } }));
  });

  it('shows everyone\'s public items unmarked, and puts a followed publisher\'s first, marked', () => {
    read.items = [item(), item({ d: 'epic-y', kind: 'epic', title: 'Another epic', author: A, address: `30084:${A}:epic-y` })];
    render(<OperationsPanel />);
    const everyone = screen.getByTestId('operations-everyone');
    expect(within(everyone).getAllByTestId('roster-row')).toHaveLength(2);
    expect(screen.queryByTestId('operations-following')).toBeNull();
    fireEvent.click(within(within(everyone).getAllByTestId('roster-row')[0]).getByRole('button', { name: 'Follow' }));
    expect(isFollowed(B)).toBe(true);
    const following = screen.getByTestId('operations-following');
    expect(following.textContent).toContain('Map the drug supply at events');
    expect(within(following).getByRole('button', { name: 'Following' })).toBeTruthy();
    expect(within(screen.getByTestId('operations-everyone')).getAllByTestId('roster-row')).toHaveLength(1);
  });

  it("says what Starcom held back of another app's story, where it was and what it held (RS58)", () => {
    read.items = [item({ d: 'story-x', kind: 'story', title: 'The night we counted', purpose: undefined, limits: [], address: `30084:${B}:story-x`,
      text: 'Twelve kits.\n[held back: a phone number]', heldBack: ['Line 2 of its text: a phone number'] })];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'The night we counted' }));
    const view = screen.getByTestId('roster-item');
    expect(within(view).getByText('Held back').nextSibling?.textContent).toBe('Starcom held back what names or places people:\nLine 2 of its text: a phone number');
    expect(within(view).getByText('Text').nextSibling?.textContent).toBe('Twelve kits.\n[held back: a phone number]');
  });

  it('opens an item, saying which links its author counts and which work claims to be toward it', () => {
    const parent = item();
    const claim = item({ d: 'epic-c', kind: 'epic', title: 'A claimed epic', author: A, address: `30084:${A}:epic-c`, toward: [{ coordinate: parent.address, relay: '' }] });
    const counted = item({ d: 'epic-k', kind: 'epic', title: 'A counted epic', author: B, address: `30084:${B}:epic-k` });
    read.items = [{ ...parent, counts: [{ coordinate: counted.address, relay: '' }] }, claim, counted];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Map the drug supply at events' }));
    const view = screen.getByTestId('roster-item');
    expect(within(view).getByText('Intent').nextSibling?.textContent).toBe('So that people know.');
    expect(view.textContent).toContain('Never name a person.');
    const under = within(view).getByTestId('roster-under');
    expect(under.textContent).toContain('A counted epic');
    expect(under.textContent).toContain('counted by its author');
    expect(under.textContent).toContain('A claimed epic');
    expect(under.textContent).toContain('claimed by the work');
  });

  it('shows an epic\'s progress from its missions\' posted totals, and says how many have posted', () => {
    const MISSION = `30079:${B}:starcom_mission_package_naloxone-sf`;
    const OTHER = `30079:${B}:starcom_mission_package_naloxone-la`;
    const store = new MissionTotalsStore();
    store.accept({ id: '1'.padStart(64, '0'), kind: 30023, pubkey: B, created_at: 1, sig: '', content: '',
      tags: [['d', 'mission-totals-sf'], ['t', 'mission_totals'], ['a', MISSION], ['total', 'Kits placed', '120'], ['as_of', '2026-10-17']] } as never);
    totals.store = store;
    read.items = [item({ d: 'epic-p', kind: 'epic', title: 'Naloxone across the West', address: `30084:${B}:epic-p`,
      criteria: [{ label: 'Kits placed', target: 500 }], counts: [{ coordinate: MISSION, relay: '' }, { coordinate: OTHER, relay: '' }] })];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Naloxone across the West' }));
    const progress = screen.getByTestId('roster-progress');
    expect(progress.textContent).toContain('Kits placed: 120 of 500');
    expect(progress.textContent).toContain('From the totals 1 of its 2 missions\' signers have posted, as of 2026-10-17.');
    totals.store = null;
  });

  it('says plainly when none of an epic\'s missions has totals posted', () => {
    totals.store = null;
    read.items = [item({ d: 'epic-q', kind: 'epic', title: 'An epic with no totals', address: `30084:${B}:epic-q`,
      criteria: [{ label: 'Kits placed', target: 500 }], counts: [{ coordinate: `30079:${B}:x`, relay: '' }] })];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'An epic with no totals' }));
    expect(screen.getByTestId('roster-progress').textContent).toContain('None of its 1 mission\'s signers has posted totals yet.');
  });

  it('names a mission it counts by its headline, from the packages received', () => {
    const MISSION = `30079:${B}:starcom_mission_package_naloxone-sf`;
    received.accepted = [{ event: { id: 'e1', pubkey: B, tags: [['d', 'starcom_mission_package_naloxone-sf']] }, headline: 'Put naloxone in more pockets in San Francisco.' }];
    read.items = [item({ d: 'epic-n', kind: 'epic', title: 'An epic naming its mission', address: `30084:${B}:epic-n`, counts: [{ coordinate: MISSION, relay: '' }] })];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'An epic naming its mission' }));
    expect(screen.getByTestId('roster-under').textContent).toContain('Put naloxone in more pockets in San Francisco., counted by its author');
    received.accepted = [];
  });

  /* Campaigns and Operations (RS5, RS6, RS26, RS27). */
  it('keeps a campaign or an operation only with a window and a place', () => {
    render(<OperationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'New operation' }));
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Count the Geminids from dark sites' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(within(form).getByRole('alert').textContent).toBe('An operation needs a window and a place.');
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: '2026-12-13' } });
    fireEvent.change(within(form).getByLabelText('Until'), { target: { value: '2026-12-15' } });
    fireEvent.change(within(form).getByLabelText('Places, a comma between'), { target: { value: 'us-ca' } });
    fireEvent.change(within(form).getByLabelText('Coordinator, if not you'), { target: { value: B } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(listDrafts()[0]).toMatchObject({ kind: 'operation', window: { from: '2026-12-13', until: '2026-12-15' }, places: ['us-ca'], coordinator: B });
    expect(screen.getByRole('button', { name: 'New campaign' })).toBeTruthy();
  });

  it('says one\'s own operation is coordinated by them, and why its story is not linked yet, before they have a key', () => {
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(null);
    render(<OperationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'New operation' }));
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'No key yet' } });
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: '2026-10-01' } });
    fireEvent.change(within(form).getByLabelText('Until'), { target: { value: '2026-10-31' } });
    fireEvent.change(within(form).getByLabelText('Places, a comma between'), { target: { value: 'us-mn' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    fireEvent.click(within(screen.getByTestId('operations-own')).getByRole('button', { name: 'No key yet' }));
    expect(within(screen.getByTestId('roster-item')).getByText('Coordinated by').nextSibling?.textContent).toBe('you');
    fireEvent.click(screen.getByRole('button', { name: 'Mark it ended' }));
    fireEvent.click(screen.getByRole('button', { name: 'End it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Write its after-action story' }));
    expect(screen.getByTestId('roster-editor').textContent).toContain('It links to its operation once you have a key: post the operation first.');
  });

  it('shows an operation\'s coordinator, and its counts a day late and rounded', () => {
    read.items = [item({ d: 'operation-o', kind: 'operation', title: 'An operation', address: `30084:${B}:operation-o`, coordinator: A,
      window: { from: '2026-10-01', until: '2026-12-31' }, places: ['us-ca'], criteria: [{ label: 'Kits placed', target: 500 }], counts: [] })];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'An operation' }));
    const view = screen.getByTestId('roster-item');
    expect(within(view).getByText('Coordinated by')).toBeTruthy();
    expect(screen.getByTestId('roster-progress').textContent).toContain('A day late, rounded down, so no one is followed as they go.');
  });

  it('ends one\'s own operation with the date and why, then offers its after-action story', () => {
    render(<OperationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'New operation' }));
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Clean-up at the lake' } });
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: '2026-10-01' } });
    fireEvent.change(within(form).getByLabelText('Until'), { target: { value: '2026-10-31' } });
    fireEvent.change(within(form).getByLabelText('Places, a comma between'), { target: { value: 'us-mn' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    fireEvent.click(within(screen.getByTestId('operations-own')).getByRole('button', { name: 'Clean-up at the lake' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark it ended' }));
    fireEvent.change(screen.getByLabelText('Why it ended'), { target: { value: 'Done early: the lake is clean.' } });
    fireEvent.click(screen.getByRole('button', { name: 'End it' }));
    const [kept] = listDrafts();
    expect(kept.ended?.why).toBe('Done early: the lake is clean.');
    expect(kept.ended?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByRole('button', { name: 'Write its after-action story' }));
    const story = screen.getByTestId('roster-editor');
    expect(story.textContent).toContain('A story never names or places people.');
    expect((within(story).getByLabelText('Works toward, one address a line') as HTMLTextAreaElement).value).toBe(`30084:${A}:${kept.d}`);
    expect((within(story).getByLabelText('Title') as HTMLInputElement).value).toBe('After action: Clean-up at the lake');
  });

  it('opens the item a click on the globe asked for, once it is read', () => {
    const it1 = item({ d: 'operation-g', kind: 'operation', title: 'Opened from the globe', address: `30084:${B}:operation-g` });
    const { rerender } = render(<OperationsPanel openAddress={it1.address} />);
    expect(screen.queryByTestId('roster-item')).toBeNull();
    read.items = [it1];
    act(() => { read.listeners.forEach((l) => l()); });
    rerender(<OperationsPanel openAddress={it1.address} />);
    expect(screen.getByTestId('roster-item').textContent).toContain('Opened from the globe');
  });
});

/* Quest lines and quests (RS8, RS9, RS29–RS31). */
describe('OperationsPanel: quest lines and quests', () => {
  const M = (n: number) => `30079:${B}:starcom_mission_package_step-${n}`;
  const pkg = (n: number, headline: string) => ({ event: { id: `e${n}`, pubkey: B, tags: [['d', `starcom_mission_package_step-${n}`]] }, headline });
  const taken = (n: number, title: string, steps: Array<{ id: string; ask: string }>) => takenMissions.take({
    key: `${B}:step-${n}`, coordinate: M(n), signer: B, packageId: `step-${n}`, relay: 'wss://record.example', title, steps,
  });
  const QUEST_LINE = item({
    d: 'quest_line-birds', kind: 'quest_line', title: 'Learn to count birds', purpose: 'Counting birds, a survey at a time.',
    address: `30084:${B}:quest_line-birds`, counts: [1, 2, 3].map((n) => ({ coordinate: M(n), relay: '' })),
  });
  const steps = () => screen.getAllByTestId('quest-step');

  it('makes a quest line, its skill named, its missions in order, one taken here added with a click', () => {
    taken(1, 'Learn the four calls', [{ id: 's1', ask: 'Listen.' }]);
    render(<OperationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'New quest line' }));
    const form = screen.getByTestId('roster-editor');
    expect(within(form).queryByText('Criteria, as counts')).toBeNull();
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Learn to count birds' } });
    fireEvent.change(within(form).getByLabelText('Skill it teaches'), { target: { value: 'Counting birds.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Add “Learn the four calls”' }));
    const field = within(form).getByLabelText('Its missions, in order, one address a line') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: `${field.value}\n${M(2)}` } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(listDrafts()[0]).toMatchObject({ kind: 'quest_line', purpose: 'Counting birds.', counts: [{ coordinate: M(1), relay: '' }, { coordinate: M(2), relay: '' }] });
    expect(screen.getByTestId('operations-quests').textContent).toContain('Learn to count birds');
    expect(screen.getByTestId('operations-quests').textContent).toContain('0 of 2 finished');
  });

  it('opens a quest line: one finished, the next to take, each later one after the one before it', () => {
    received.accepted = [pkg(1, 'Learn the four calls'), pkg(2, 'Count a park'), pkg(3, 'Count a lake')];
    takenMissions.markFinished(M(1), '2026-10-12T09:00:00Z');
    read.items = [QUEST_LINE];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Learn to count birds' }));
    const view = screen.getByTestId('roster-item');
    expect(within(view).getByText('Skill it teaches')).toBeTruthy();
    expect(screen.getByTestId('quest-steps').textContent).toContain('1 of 3 finished. Kept on this device, never posted.');
    expect(steps().map((s) => s.getAttribute('data-state'))).toEqual(['finished', 'next', 'after']);
    expect(steps()[0].textContent).toContain('Learn the four calls');
    expect(steps()[0].textContent).toContain('Finished 2026-10-12');
    expect(within(steps()[1]).getByRole('button', { name: 'Take on Count a park' })).toBeTruthy();
    expect(steps()[2].textContent).toContain('After “Count a park”');
    expect(within(steps()[2]).queryByRole('button')).toBeNull();
    // Its missions are listed once, as its steps, not again under it.
    expect(screen.queryByTestId('roster-under')).toBeNull();
  });

  it('a next mission taken here says how far along it is; with no steps, marked finished, it unlocks the next', () => {
    received.accepted = [pkg(1, 'Learn the four calls'), pkg(2, 'Count a park'), pkg(3, 'Count a lake')];
    taken(1, 'Learn the four calls', [{ id: 's1', ask: 'Listen.' }, { id: 's2', ask: 'Write them down.' }]);
    read.items = [QUEST_LINE];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Learn to count birds' }));
    expect(steps()[0].textContent).toContain('Taken on: 0 of 2 steps ticked. Tick them in Missions.');
    act(() => { takenMissions.setStepDone(`${B}:step-1`, 's1', true); takenMissions.setStepDone(`${B}:step-1`, 's2', true, '2026-10-17T10:00:00Z'); });
    expect(steps().map((s) => s.getAttribute('data-state'))).toEqual(['finished', 'next', 'after']);
    act(() => { taken(2, 'Count a park', []); });
    fireEvent.click(within(steps()[1]).getByRole('button', { name: 'Mark finished' }));
    expect(steps().map((s) => s.getAttribute('data-state'))).toEqual(['finished', 'finished', 'next']);
    fireEvent.click(within(steps()[1]).getByRole('button', { name: 'Mark not finished' }));
    expect(steps().map((s) => s.getAttribute('data-state'))).toEqual(['finished', 'next', 'after']);
  });

  it('a field mission next in a quest line passes the same gate before it can be taken', () => {
    received.accepted = [{ ...pkg(1, 'Learn the four calls'), where: 'field' }, pkg(2, 'Count a park'), pkg(3, 'Count a lake')];
    read.items = [QUEST_LINE];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Learn to count birds' }));
    expect(within(steps()[0]).getByTestId('age-question')).toBeTruthy();
    expect(within(steps()[0]).queryByRole('button', { name: 'Take on Learn the four calls' })).toBeNull();
  });

  it('says plainly when a mission in it is not read here', () => {
    read.items = [QUEST_LINE];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Learn to count birds' }));
    expect(steps()[0].textContent).toContain('Not read here yet.');
    // Named by its own id, not its whole address.
    expect(steps()[0].textContent).toContain('step-1');
    expect(steps()[0].textContent).not.toContain('30079:');
  });

  it('a mission taken here and not read now is named as it was taken', () => {
    taken(1, 'Learn the four calls', [{ id: 's1', ask: 'Listen.' }]);
    read.items = [QUEST_LINE];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Learn to count birds' }));
    expect(steps()[0].textContent).toContain('Learn the four calls');
    expect(steps()[0].textContent).toContain('Taken on: 0 of 1 step ticked. Tick it in Missions.');
    expect(steps()[1].textContent).toContain('After “Learn the four calls”');
  });

  it('starts someone\'s quest line, which then heads Your quests with its progress, and leaves it', () => {
    read.items = [QUEST_LINE];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Learn to count birds' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start this quest line' }));
    expect(screen.getByTestId('roster-item').textContent).toMatch(/Started \d{4}-\d{2}-\d{2}/);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const quests = screen.getByTestId('operations-quests');
    expect(quests.textContent).toContain('Learn to count birds');
    expect(quests.textContent).toContain('0 of 3 finished');
    fireEvent.click(within(quests).getByRole('button', { name: 'Learn to count birds' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave it' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('operations-quests').textContent).toContain('No quests yet.');
  });

  it('one\'s own quest line is not started: it is theirs, in Your quests already', () => {
    read.items = [{ ...QUEST_LINE, author: A, address: `30084:${A}:quest_line-birds` }];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Learn to count birds' }));
    expect(screen.queryByRole('button', { name: 'Start this quest line' })).toBeNull();
  });

  it('a quest: its reason, its missions in no order, each open to take', () => {
    received.accepted = [pkg(1, 'Learn the four calls'), pkg(2, 'Count a park')];
    render(<OperationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'New quest' }));
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Know the birds near me' } });
    fireEvent.change(within(form).getByLabelText('Why'), { target: { value: 'My grandmother knew them all.' } });
    fireEvent.change(within(form).getByLabelText('Its missions, one address a line'), { target: { value: `${M(1)}\n${M(2)}` } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    fireEvent.click(within(screen.getByTestId('operations-quests')).getByRole('button', { name: 'Know the birds near me' }));
    expect(within(screen.getByTestId('roster-item')).getByText('Why').nextSibling?.textContent).toBe('My grandmother knew them all.');
    expect(steps().map((s) => s.getAttribute('data-state'))).toEqual(['open', 'open']);
    expect(within(steps()[1]).getByRole('button', { name: 'Take on Count a park' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start this quest line' })).toBeNull();
  });
});

/* Adventures (RS10, RS33–RS36). */
describe('OperationsPanel: adventures', () => {
  const TRIAL = `30079:${B}:starcom_mission_package_aurora-watch`;
  const trialPkg = (where: 'field' | 'desk') => ({ event: { id: 'e1', pubkey: B, tags: [['d', 'starcom_mission_package_aurora-watch']] }, headline: 'Watch for the aurora', where });
  const AURORA = item({
    d: 'adventure-aurora-mn', kind: 'adventure', title: 'Aurora tonight over Minnesota', purpose: 'Look north from a dark public place.',
    address: `30084:${B}:adventure-aurora-mn`, places: ['us-mn'], counts: [{ coordinate: TRIAL, relay: '' }],
    window: { from: '2026-10-17T02:00Z', until: '2026-10-17T09:00Z' },
    call: { what: 'Aurora likely as far south as Minnesota', odds: 'Kp 7 forecast', source: 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast' },
    hazards: ['Cold after midnight', 'Dark roads'], access: 'public', fromHome: 'Watch NOAA\'s live aurora oval.',
  });
  const open = () => fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Aurora tonight over Minnesota' }));
  const trial = () => screen.getByTestId('adventure-trials');

  beforeEach(() => {
    resetAdventures();
    resetAge();
    returned.calls.length = 0;
    nws.answer = { warnings: [], failed: [] };
    nws.asked.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T03:30:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('makes an adventure: its call, a window in UTC, a place and its trials, and says why one without a call is not kept', () => {
    render(<OperationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'New adventure' }));
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Aurora tonight over Minnesota' } });
    fireEvent.change(within(form).getByLabelText('From, UTC'), { target: { value: '2026-10-17T02:00' } });
    fireEvent.change(within(form).getByLabelText('Until, UTC'), { target: { value: '2026-10-17T09:00' } });
    fireEvent.change(within(form).getByLabelText('Places, a comma between'), { target: { value: 'us-mn' } });
    fireEvent.change(within(form).getByLabelText('Its trials, mission packages, one address a line'), { target: { value: TRIAL } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(within(form).getByRole('alert').textContent).toBe('An adventure needs a call: what, its odds and their source.');
    fireEvent.change(within(form).getByLabelText('What is happening'), { target: { value: 'Aurora likely as far south as Minnesota' } });
    fireEvent.change(within(form).getByLabelText('Its odds, as its source states them'), { target: { value: 'Kp 7 forecast' } });
    fireEvent.change(within(form).getByLabelText('Its source, a link'), { target: { value: 'https://www.swpc.noaa.gov/' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(within(form).getByRole('alert').textContent).toBe('An adventure needs its hazards, public access and a way to take part from home.');
    fireEvent.change(within(form).getByLabelText('Its hazards, one a line'), { target: { value: 'Cold after midnight\nDark roads' } });
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Its places are public, and open and lawful to be in at that hour' }));
    fireEvent.change(within(form).getByLabelText('A way to take part from home'), { target: { value: 'Watch NOAA\'s live oval.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(listDrafts()[0]).toMatchObject({
      hazards: ['Cold after midnight', 'Dark roads'], access: 'public', fromHome: 'Watch NOAA\'s live oval.',
      kind: 'adventure', window: { from: '2026-10-17T02:00Z', until: '2026-10-17T09:00Z' }, places: ['us-mn'],
      call: { what: 'Aurora likely as far south as Minnesota', odds: 'Kp 7 forecast', source: 'https://www.swpc.noaa.gov/' },
      counts: [{ coordinate: TRIAL, relay: '' }],
    });
  });

  it('shows its caller the returns sealed to them, and nobody else (RS41)', () => {
    read.items = [AURORA, { ...AURORA, d: 'adventure-mine', title: 'My own aurora call', author: A, address: `30084:${A}:adventure-mine` }];
    render(<OperationsPanel />);
    open();
    expect(screen.queryByTestId('adventure-returns')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'My own aurora call' }));
    expect(screen.getByTestId('adventure-returns')).toHaveTextContent('Returns (0: 0 seen it)');
  });

  it('opens an adventure: where it stands, its call quoting its source, and the rules every one keeps', () => {
    read.items = [AURORA];
    render(<OperationsPanel />);
    open();
    const view = screen.getByTestId('roster-item');
    expect(screen.getByTestId('adventure-state').textContent).toBe('On now, until 2026-10-17 09:00 Z');
    expect(view.textContent).toContain('Aurora likely as far south as Minnesota');
    expect(view.textContent).toContain('Kp 7 forecast');
    const link = within(view).getByRole('link', { name: 'www.swpc.noaa.gov' });
    expect(link.getAttribute('href')).toBe('https://www.swpc.noaa.gov/products/aurora-30-minute-forecast');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByTestId('adventure-rules').textContent).toContain('never while driving or riding');
    expect(within(view).getByText('Its hazards').nextSibling?.textContent).toBe('Cold after midnight\nDark roads');
    expect(within(view).getByText('From home').nextSibling?.textContent).toBe('Watch NOAA\'s live aurora oval.');
    expect(view.textContent).toContain('2026-10-17 02:00 Z to 2026-10-17 09:00 Z');
  });

  it('reads the NWS for its states, and says so when nothing is warned', async () => {
    read.items = [AURORA];
    render(<OperationsPanel />);
    open();
    await waitFor(() => expect(screen.getByTestId('adventure-warnings').textContent).toContain('No NWS warning for Minnesota now.'));
    expect(nws.asked).toEqual([['MN']]);
  });

  it('quotes a local warning, called off where it covers; a blizzard calls it off in the whole state', async () => {
    nws.answer = { warnings: [{ event: 'Flood Warning', area: 'Hennepin; Carver', until: '2026-10-18T00:00:00.000Z', sender: 'NWS Twin Cities MN', state: 'MN' }], failed: [] };
    read.items = [AURORA];
    const { unmount } = render(<OperationsPanel />);
    open();
    await waitFor(() => expect(screen.getByTestId('adventure-warnings').textContent)
      .toContain('Flood Warning, NWS Twin Cities MN: Hennepin; Carver, until 2026-10-18 00:00 Z. Called off there.'));
    expect(screen.getByTestId('adventure-state').textContent).toBe('On now, until 2026-10-17 09:00 Z');
    unmount();
    nws.answer = { warnings: [{ event: 'Blizzard Warning', area: 'All of it', until: '2026-10-17T18:00:00.000Z', sender: 'NWS Duluth MN', state: 'MN' }], failed: [] };
    received.accepted = [trialPkg('desk')];
    render(<OperationsPanel />);
    open();
    await waitFor(() => expect(screen.getByTestId('adventure-state').textContent).toBe('Called off by the NWS: Blizzard Warning for Minnesota, until 2026-10-17 18:00 Z'));
    expect(within(trial()).queryByRole('button', { name: 'Take on Watch for the aurora' })).toBeNull();
  });

  it('says when the NWS could not be read, and that outside the US only its caller and window call it off', async () => {
    nws.answer = { warnings: [], failed: ['MN'] };
    read.items = [{ ...AURORA, places: ['us-mn', 'ca'] }];
    render(<OperationsPanel />);
    open();
    const block = () => screen.getByTestId('adventure-warnings').textContent;
    await waitFor(() => expect(block()).toContain('The NWS could not be read for Minnesota. Check weather.gov before you go.'));
    expect(block()).toContain('Outside the US no authority is read here: only its caller and its window call it off in ca.');
  });

  const gateReady = () => waitFor(() => expect(within(trial()).getByTestId('field-gate')).toBeTruthy());
  const DAY = { ...AURORA, d: 'adventure-day-mn', address: `30084:${B}:adventure-day-mn`, title: 'Count the geese over Minnesota',
    window: { from: '2026-10-17T16:00Z', until: '2026-10-17T20:00Z' } };
  const openDay = () => fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Count the geese over Minnesota' }));

  it('asks how old, neutrally and once, then the warning ticked to agree; after dark, not for anyone under 18', async () => {
    received.accepted = [trialPkg('field')];
    read.items = [AURORA];
    render(<OperationsPanel />);
    open();
    await gateReady();
    const ask = within(trial()).getByTestId('age-question');
    expect(ask.textContent).toContain('How old are you?');
    expect(within(ask).getAllByRole('radio').map((r) => (r as HTMLInputElement).checked)).toEqual([false, false, false, false, false]);
    expect(within(ask).getByRole('button', { name: 'Keep my answer' })).toHaveProperty('disabled', true);
    fireEvent.click(within(ask).getByLabelText('16 to 17'));
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep my answer' }));
    expect(ageAnswer()).toMatchObject({ bracket: '16_17', method: 'self_declared' });
    // Locked: not asked again, and no way here to pick another.
    expect(within(trial()).queryByTestId('age-question')).toBeNull();
    expect(within(trial()).queryByRole('button', { name: /change/i })).toBeNull();
    const warning = within(trial()).getByTestId('going-out-warning');
    expect(warning.textContent).toContain('You are responsible for your own safety');
    const agree = within(warning).getByRole('checkbox', { name: GOING_OUT_AGREEMENT }) as HTMLInputElement;
    expect(agree.checked).toBe(false);
    expect(within(warning).getByRole('button', { name: 'Go on' })).toHaveProperty('disabled', true);
    fireEvent.click(agree);
    fireEvent.click(within(warning).getByRole('button', { name: 'Go on' }));
    expect(within(trial()).queryByTestId('going-out-warning')).toBeNull();
    // Its window is night in Minnesota.
    expect(trial().textContent).toContain('After dark: not for anyone under 18.');
    expect(within(trial()).queryByRole('button', { name: 'Take on Watch for the aurora' })).toBeNull();
    expect(trial().textContent).toContain('You said you are 16 to 17. Starcom asked; it did not check.');
  });

  it('13 to 17 in daylight: offered only after ticking a parent or guardian', async () => {
    setAgeAnswer('13_15');
    agreeToWarning();
    received.accepted = [trialPkg('field')];
    read.items = [DAY];
    render(<OperationsPanel />);
    openDay();
    await gateReady();
    expect(within(trial()).queryByRole('button', { name: 'Take on Watch for the aurora' })).toBeNull();
    fireEvent.click(within(trial()).getByRole('checkbox', { name: 'I am going with my parent or guardian, or an adult they have authorised, in daylight' }));
    expect(within(trial()).getByRole('button', { name: 'Take on Watch for the aurora' })).toBeTruthy();
  });

  it('pauses field trials when the NWS cannot be read: failing safe', async () => {
    setAgeAnswer('18_plus');
    agreeToWarning();
    nws.answer = { warnings: [], failed: ['MN'] };
    received.accepted = [trialPkg('field')];
    read.items = [AURORA];
    render(<OperationsPanel />);
    open();
    await waitFor(() => expect(trial().textContent).toContain('could not be read here, so field trials are paused until it can be'));
    expect(within(trial()).queryByRole('button', { name: 'Take on Watch for the aurora' })).toBeNull();
  });

  it('under 13: no warning, and no field trial; desk trials stay open', async () => {
    received.accepted = [trialPkg('field')];
    read.items = [AURORA];
    render(<OperationsPanel />);
    open();
    await gateReady();
    fireEvent.click(within(within(trial()).getByTestId('age-question')).getByLabelText('Under 13'));
    fireEvent.click(within(trial()).getByRole('button', { name: 'Keep my answer' }));
    expect(within(trial()).queryByTestId('going-out-warning')).toBeNull();
    expect(trial().textContent).toContain('Not for anyone under 13. Desk trials, and the way from home, are open to you.');
    expect(within(trial()).queryByRole('button', { name: 'Take on Watch for the aurora' })).toBeNull();
  });

  it('an AI agent: no warning, and no field trial, which is for the person it guides; desk trials stay open', async () => {
    received.accepted = [trialPkg('field')];
    read.items = [AURORA];
    render(<OperationsPanel />);
    open();
    await gateReady();
    fireEvent.click(within(within(trial()).getByTestId('age-question')).getByLabelText('I am an AI agent'));
    fireEvent.click(within(trial()).getByRole('button', { name: 'Keep my answer' }));
    expect(within(trial()).queryByTestId('going-out-warning')).toBeNull();
    expect(trial().textContent).toContain('An AI agent does not go out: field trials are for the person it guides, who answers for themselves.');
    expect(within(trial()).queryByRole('button', { name: 'Take on Watch for the aurora' })).toBeNull();
    expect(trial().textContent).toContain('You said you are an AI agent. Starcom asked; it did not check.');
  });

  it('18 or over: the warning once, then each field trial offered, day or night', async () => {
    received.accepted = [trialPkg('field')];
    read.items = [AURORA];
    render(<OperationsPanel />);
    open();
    await gateReady();
    fireEvent.click(within(within(trial()).getByTestId('age-question')).getByLabelText('18 or over'));
    fireEvent.click(within(trial()).getByRole('button', { name: 'Keep my answer' }));
    // Not offered until the warning is agreed to.
    expect(within(trial()).queryByRole('button', { name: 'Take on Watch for the aurora' })).toBeNull();
    fireEvent.click(within(trial()).getByRole('checkbox', { name: GOING_OUT_AGREEMENT }));
    fireEvent.click(within(trial()).getByRole('button', { name: 'Go on' }));
    expect(within(trial()).getByRole('button', { name: 'Take on Watch for the aurora' })).toBeTruthy();
  });

  it('asks nothing before a desk trial', () => {
    received.accepted = [trialPkg('desk')];
    read.items = [AURORA];
    render(<OperationsPanel />);
    open();
    expect(within(trial()).queryByTestId('age-question')).toBeNull();
    expect(within(trial()).getByRole('button', { name: 'Take on Watch for the aurora' })).toBeTruthy();
  });

  it('called off by its caller: said so, quoted, and its trials not offered', () => {
    received.accepted = [trialPkg('desk')];
    read.items = [{ ...AURORA, ended: { date: '2026-10-17', why: 'Clouds over the whole state.' } }];
    render(<OperationsPanel />);
    open();
    expect(screen.getByTestId('adventure-state').textContent).toBe('Called off 2026-10-17 by its caller: Clouds over the whole state.');
    expect(within(trial()).queryByRole('button', { name: 'Take on Watch for the aurora' })).toBeNull();
  });

  it('once a trial is taken, sends its return, seen or not, with the counts it asks, through the review', async () => {
    received.accepted = [trialPkg('desk')];
    takenMissions.take({ key: `${B}:aurora-watch`, coordinate: TRIAL, signer: B, packageId: 'aurora-watch', relay: '', title: 'Watch for the aurora',
      counts: [{ id: 'photos', label: 'Photos taken' }], steps: [{ id: 's1', ask: 'Look north.' }] });
    read.items = [AURORA];
    render(<OperationsPanel />);
    open();
    const back = screen.getByTestId('adventure-return');
    fireEvent.change(within(back).getByLabelText('Photos taken'), { target: { value: '2' } });
    fireEvent.click(within(back).getByRole('button', { name: 'Seen it' }));
    await waitFor(() => expect(returned.calls).toHaveLength(1));
    expect(returned.calls[0]).toEqual({ address: AURORA.address, seen: true, counts: [{ label: 'Photos taken', n: 2 }] });
    expect(back.textContent).toContain('Sent, sealed to its caller.');
    // What this device keeps of it, said once it is kept.
    act(() => { recordReturn(AURORA.address, { seen: true, day: '2026-10-17', relays: 2 }); });
    expect(screen.getByTestId('adventure-return').textContent).toContain('Returned 2026-10-17: seen it. Sealed to its caller.');
  });

  it('offers no return before a trial is taken', () => {
    read.items = [AURORA];
    render(<OperationsPanel />);
    open();
    expect(screen.queryByTestId('adventure-return')).toBeNull();
  });

  it('one\'s own adventure is called off with the date and why', () => {
    render(<OperationsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'New adventure' }));
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'My aurora call' } });
    fireEvent.change(within(form).getByLabelText('What is happening'), { target: { value: 'Aurora likely' } });
    fireEvent.change(within(form).getByLabelText('Its odds, as its source states them'), { target: { value: 'Kp 7' } });
    fireEvent.change(within(form).getByLabelText('Its source, a link'), { target: { value: 'https://www.swpc.noaa.gov/' } });
    fireEvent.change(within(form).getByLabelText('From, UTC'), { target: { value: '2026-10-17T02:00' } });
    fireEvent.change(within(form).getByLabelText('Until, UTC'), { target: { value: '2026-10-17T09:00' } });
    fireEvent.change(within(form).getByLabelText('Places, a comma between'), { target: { value: 'us-mn' } });
    fireEvent.change(within(form).getByLabelText('Its trials, mission packages, one address a line'), { target: { value: TRIAL } });
    fireEvent.change(within(form).getByLabelText('Its hazards, one a line'), { target: { value: 'Cold' } });
    fireEvent.click(within(form).getByRole('checkbox', { name: 'Its places are public, and open and lawful to be in at that hour' }));
    fireEvent.change(within(form).getByLabelText('A way to take part from home'), { target: { value: 'Watch the oval.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    fireEvent.click(within(screen.getByTestId('operations-own')).getByRole('button', { name: 'My aurora call' }));
    fireEvent.click(screen.getByRole('button', { name: 'Call it off' }));
    fireEvent.change(screen.getByLabelText('Why it was called off'), { target: { value: 'Clouds.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Call it off now' }));
    expect(listDrafts()[0].ended).toEqual({ date: '2026-10-17', why: 'Clouds.' });
    expect(screen.getByTestId('adventure-state').textContent).toBe('Called off 2026-10-17 by its caller: Clouds.');
  });
});
