/**
 * Operations, step 8 (decision D-RS, RS1, RS3, RS11, RS12; the owner's RS51–RS54, 2026-10-18): a Cause, an
 * Initiative, a Story and a Saga.
 *
 * A cause gives no orders: the work that cites it is counted, with how many publishers it comes from, and following
 * it stays on this device, so no list of its followers exists anywhere (RS53). An initiative names its problem, a
 * first step and whom it is for; others join by working toward it, and its author grows it into a campaign or an
 * epic, which it then says it grew into (RS54). A saga gathers its stories both ways, marked: those its author
 * chose, then those told toward it, newest first (RS52). A story that names or places people is kept, and told what
 * stops it being posted (RS51); "Write a story" follows an adventure's return.
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
vi.mock('../../../../services/nostr/joinedRelays', () => ({ isJoinedRelay: (url: string) => url === 'wss://team.example.org' }));

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

import { followsCause, unfollowCause } from '../../../../services/roster/follows';

const item = (over: Partial<ReadRosterItem> = {}): ReadRosterItem => ({
  d: 'cause-x', kind: 'cause', title: 'Clean water for Flint', purpose: 'Lead in the pipes.',
  limits: [], places: ['us-mi'], toward: [], counts: [], text: 'Why it matters.',
  author: B, createdAt: 1_792_200_000, address: `30084:${B}:cause-x`, ...over,
});
const CAUSE = `30084:${B}:cause-x`;

beforeEach(() => {
  vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(A);
  for (const d of listDrafts()) removeDraft(d.d);
  unfollow(A); unfollow(B); unfollowCause(CAUSE);
  read.items = [];
  posted.calls.length = 0;
  takenMissions.reset();
  for (const s of startedQuestLines()) leaveQuestLine(s.address);
  received.accepted = [];
  resetAge();
  resetAdventures();
});
afterEach(() => { vi.restoreAllMocks(); });

const open = (title: string) => fireEvent.click(screen.getByRole('button', { name: title }));

describe('a cause (RS1, RS53)', () => {
  it('is made with its concern, and kept on this device', () => {
    render(<OperationsPanel />);
    open('New cause');
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Clean water for Flint' } });
    fireEvent.change(within(form).getByLabelText('The concern'), { target: { value: 'Lead in the pipes.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(listDrafts()[0]).toMatchObject({ kind: 'cause', title: 'Clean water for Flint', purpose: 'Lead in the pipes.' });
  });

  it('counts the missions whose packages work toward it, and names them (RS59)', () => {
    read.items = [item()];
    received.accepted = [
      { event: { id: 'p1', pubkey: A, created_at: 1_792_100_000, tags: [['d', 'starcom_mission_package_taps'], ['a', CAUSE, '', 'toward']] }, headline: 'Test the taps on Saginaw Street' },
      { event: { id: 'p2', pubkey: A, created_at: 1_792_000_000, tags: [['d', 'starcom_mission_package_other']] }, headline: 'Not toward it' },
    ];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Clean water for Flint' }));
    const view = screen.getByTestId('roster-item');
    expect(within(view).getByTestId('roster-cited').textContent).toBe('1 piece of work cites it, from 1 publisher: 1 mission.');
    expect(within(view).getByTestId('roster-cited-missions').textContent).toBe('Missions toward itTest the taps on Saginaw Street');
  });

  it('counts the work that cites it and how many publishers it comes from, never who follows it', () => {
    read.items = [
      item(),
      item({ d: 'story-1', kind: 'story', title: 'Tested 40 taps', author: A, address: `30084:${A}:story-1`, toward: [{ coordinate: CAUSE, relay: '' }] }),
      item({ d: 'story-2', kind: 'story', title: 'Tested 12 more', author: A, address: `30084:${A}:story-2`, toward: [{ coordinate: CAUSE, relay: '' }] }),
      item({ d: 'camp-1', kind: 'campaign', title: 'Test every school', author: B, address: `30084:${B}:camp-1`, toward: [{ coordinate: CAUSE, relay: '' }],
        window: { from: '2026-11-01', until: '2026-12-01' } }),
    ];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Clean water for Flint' }));
    const view = screen.getByTestId('roster-item');
    expect(within(view).getByTestId('roster-cited').textContent).toBe('3 pieces of work cite it, from 2 publishers: 1 campaign, 2 stories.');
    expect(within(view).getByText('The concern')).toBeTruthy();
  });

  it('says plainly when no work cites it yet', () => {
    read.items = [item()];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Clean water for Flint' }));
    expect(screen.getByTestId('roster-cited').textContent).toBe('No work cites it yet.');
  });

  it('is followed on this device only, and then listed under Following', () => {
    read.items = [item()];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Clean water for Flint' }));
    const view = screen.getByTestId('roster-item');
    expect(within(view).getByText('Kept on this device only. No one else sees whom or what you follow.')).toBeTruthy();
    fireEvent.click(within(view).getByRole('button', { name: 'Follow this cause' }));
    expect(followsCause(CAUSE)).toBe(true);
    expect(within(view).getByRole('button', { name: 'Following this cause' })).toBeTruthy();
    fireEvent.click(within(view).getByRole('button', { name: 'Back' }));
    expect(within(screen.getByTestId('operations-following')).getByRole('button', { name: 'Clean water for Flint' })).toBeTruthy();
  });
});

describe('an initiative (RS3, RS54)', () => {
  it('is made with its problem, a first step and whom it is for', () => {
    render(<OperationsPanel />);
    open('New initiative');
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Map the town\'s defibrillators' } });
    fireEvent.change(within(form).getByLabelText('The problem'), { target: { value: 'No one knows where they are.' } });
    fireEvent.change(within(form).getByLabelText('A first step'), { target: { value: 'List the ones in public buildings.' } });
    fireEvent.change(within(form).getByLabelText('Who it is for'), { target: { value: 'Anyone in Ames' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(listDrafts()[0]).toMatchObject({ kind: 'initiative', purpose: 'No one knows where they are.', firstStep: 'List the ones in public buildings.', forWhom: 'Anyone in Ames' });
  });

  it('grows into a campaign started from it, linked toward it, which it then says it grew into', () => {
    render(<OperationsPanel />);
    open('New initiative');
    let form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Map the town\'s defibrillators' } });
    fireEvent.change(within(form).getByLabelText('Places, a comma between'), { target: { value: 'us-ia' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    const initiative = listDrafts()[0];
    fireEvent.click(within(screen.getByTestId('operations-own')).getByRole('button', { name: 'Map the town\'s defibrillators' }));
    fireEvent.click(screen.getByRole('button', { name: 'Grow it into a campaign' }));
    form = screen.getByTestId('roster-editor');
    expect((within(form).getByLabelText('Title') as HTMLInputElement).value).toBe('Map the town\'s defibrillators');
    expect((within(form).getByLabelText('Works toward, one address a line') as HTMLInputElement).value).toBe(`30084:${A}:${initiative.d}`);
    expect((within(form).getByLabelText('Places, a comma between') as HTMLInputElement).value).toBe('us-ia');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Map them by December' } });
    fireEvent.change(within(form).getByLabelText('From'), { target: { value: '2026-11-01' } });
    fireEvent.change(within(form).getByLabelText('Until'), { target: { value: '2026-12-01' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    const campaign = listDrafts().find((d) => d.kind === 'campaign')!;
    expect(campaign.toward).toEqual([{ coordinate: `30084:${A}:${initiative.d}`, relay: '' }]);
    expect(listDrafts().find((d) => d.d === initiative.d)?.grewInto).toEqual([{ coordinate: `30084:${A}:${campaign.d}`, relay: '' }]);
    fireEvent.click(within(screen.getByTestId('operations-own')).getByRole('button', { name: 'Map the town\'s defibrillators' }));
    expect(screen.getByTestId('roster-item').textContent).toContain('Grew into');
    expect(screen.getByTestId('roster-item').textContent).toContain('Map them by December');
  });

  it('before its author has a key, says to post it first, so what it grows into can link to it', () => {
    vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(null as never);
    render(<OperationsPanel />);
    open('New initiative');
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Map the defibrillators' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    fireEvent.click(within(screen.getByTestId('operations-own')).getByRole('button', { name: 'Map the defibrillators' }));
    const view = screen.getByTestId('roster-item');
    expect(within(view).getByText('Post it first, so what it grows into can link to it.')).toBeTruthy();
    expect(within(view).queryByRole('button', { name: 'Grow it into a campaign' })).toBeNull();
  });

  it('is grown only by its author, once it has an address', () => {
    read.items = [item({ d: 'init-1', kind: 'initiative', title: 'Map the defibrillators', address: `30084:${B}:init-1`, firstStep: 'List them.', forWhom: 'Ames' })];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Map the defibrillators' }));
    const view = screen.getByTestId('roster-item');
    expect(within(view).queryByRole('button', { name: 'Grow it into a campaign' })).toBeNull();
    expect(within(view).getByText('A first step')).toBeTruthy();
    expect(within(view).getByTestId('roster-cited').textContent).toBe('No work toward it yet. Work toward it to join it.');
  });
});

describe('a saga (RS12, RS52)', () => {
  it('lists the stories its author chose, then those told toward it, newest first, each marked', () => {
    const SAGA = `30084:${B}:saga-1`;
    read.items = [
      item({ d: 'saga-1', kind: 'saga', title: 'The aurora over the Great Lakes', address: SAGA, purpose: 'The lights, year on year.',
        counts: [{ coordinate: `30084:${B}:story-chosen`, relay: '' }] }),
      // Chosen, and told toward it too: listed once, as chosen.
      item({ d: 'story-chosen', kind: 'story', title: 'After action: Operation Kp7', address: `30084:${B}:story-chosen`, createdAt: 10, toward: [{ coordinate: SAGA, relay: '' }] }),
      // Not a story: under it, never among its stories.
      item({ d: 'camp-1', kind: 'campaign', title: 'Photograph every display', author: A, address: `30084:${A}:camp-1`, createdAt: 40, toward: [{ coordinate: SAGA, relay: '' }],
        window: { from: '2026-11-01', until: '2026-12-01' } }),
      item({ d: 'story-old', kind: 'story', title: 'Seen it from Duluth', author: A, address: `30084:${A}:story-old`, createdAt: 20, toward: [{ coordinate: SAGA, relay: '' }] }),
      item({ d: 'story-new', kind: 'story', title: 'Seen it from Marquette', author: A, address: `30084:${A}:story-new`, createdAt: 30, toward: [{ coordinate: SAGA, relay: '' }] }),
    ];
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'The aurora over the Great Lakes' }));
    const chosen = screen.getByTestId('saga-chosen');
    const told = screen.getByTestId('saga-told');
    expect(chosen.textContent).toContain('Chosen by its author (1)');
    expect(within(chosen).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['After action: Operation Kp7']);
    expect(told.textContent).toContain('Told toward it (2)');
    expect(within(told).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Seen it from Marquette', 'Seen it from Duluth']);
    expect(screen.getByTestId('roster-under').textContent).toBe('Under itPhotograph every display, claimed by the work');
  });

  it('is made with what it is the saga of, and its chosen stories', () => {
    render(<OperationsPanel />);
    open('New saga');
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'The aurora over the Great Lakes' } });
    fireEvent.change(within(form).getByLabelText('What it is the saga of'), { target: { value: 'The lights, year on year.' } });
    fireEvent.change(within(form).getByLabelText('Its stories, chosen by you, one address a line'), { target: { value: `30084:${B}:story-chosen` } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(listDrafts()[0]).toMatchObject({ kind: 'saga', counts: [{ coordinate: `30084:${B}:story-chosen`, relay: '' }] });
  });
});

describe('a story (RS11, RS51)', () => {
  it('kept with what names or places people, says what stops it being posted', () => {
    render(<OperationsPanel />);
    open('New story');
    const form = screen.getByTestId('roster-editor');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'The watch' } });
    fireEvent.change(within(form).getByLabelText('Text'), { target: { value: 'We stood at 44.98, -93.27.' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Keep on this device' }));
    expect(listDrafts()[0]).toMatchObject({ kind: 'story', title: 'The watch' });
    expect(within(screen.getByTestId('roster-editor')).getByRole('alert').textContent).toBe(
      'Kept on this device. It can be posted once this is out:\nLine 1 of its text: “44.98, -93.27”. A story never places people: say the town or the state, not a point.',
    );
  });

  it('opens a story asked for from elsewhere, its title and what it is the account of filled in', () => {
    render(<OperationsPanel writeStory={{ title: 'Mission: count the swifts', toward: `30079:${B}:starcom_mission_package_swifts` }} />);
    const form = screen.getByTestId('roster-editor');
    expect((within(form).getByLabelText('Title') as HTMLInputElement).value).toBe('Mission: count the swifts');
    expect((within(form).getByLabelText('Works toward, one address a line') as HTMLInputElement).value).toBe(`30079:${B}:starcom_mission_package_swifts`);
  });

  it('is offered once an adventure\'s return is sent', async () => {
    const pkg = { headline: 'Look north after dark', event: { pubkey: B, tags: [['d', 'starcom_mission_package_look']] } };
    received.accepted = [pkg];
    const ADV = `30084:${B}:adv-1`;
    read.items = [item({
      d: 'adv-1', kind: 'adventure', title: 'Aurora tonight', address: ADV, places: ['ca'],
      window: { from: '2026-01-01T00:00:00Z', until: '2099-01-01T00:00:00Z' },
      call: { what: 'Aurora likely', odds: 'Kp 7 forecast', source: 'https://www.swpc.noaa.gov/' },
      hazards: ['Cold'], access: 'public', fromHome: 'Watch the SWPC dashboard.',
      counts: [{ coordinate: `30079:${B}:starcom_mission_package_look`, relay: '' }],
    })];
    takenMissions.take({ key: `${B}:look`, coordinate: `30079:${B}:starcom_mission_package_look`, signer: B, packageId: 'look', relay: '',
      title: 'Look north after dark', counts: [], steps: [{ id: 's1', ask: 'Look north.' }] });
    render(<OperationsPanel />);
    fireEvent.click(within(screen.getByTestId('operations-everyone')).getByRole('button', { name: 'Aurora tonight' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seen it' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Write a story' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Write a story' }));
    const form = screen.getByTestId('roster-editor');
    expect((within(form).getByLabelText('Works toward, one address a line') as HTMLInputElement).value).toBe(ADV);
  });
});
