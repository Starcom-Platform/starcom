/**
 * A mission a team works together (decision D-RS, RS15; the owner's RS55–RS57): chosen from the teams whose relay
 * is joined here; each step then read from the team's relay, taken so no two do it twice, released, done, and
 * checked by someone other than the one who did it, each through the review. Alone, nothing is read or posted.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import type { StepLabel } from '../../../../services/roster/stepLabels';

const YOU = 'b'.repeat(64);
const SAM = 'c'.repeat(64);
const SIGNER = 'a'.repeat(64);
const COORDINATE = `30079:${SIGNER}:starcom_mission_package_swifts`;
const TEAM = { relay: 'wss://team.example.org', name: 'Bay Area crew' };

const watch = vi.hoisted(() => ({ asked: [] as Array<{ relay: string; coordinate: string }>, handlers: null as null | { onLabels: (l: StepLabel[]) => void; onRead?: () => void }, stopped: 0 }));
vi.mock('../../../../services/roster/stepLabels', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../services/roster/stepLabels')>();
  return {
    ...real,
    watchStepLabels: (relay: string, coordinate: string, handlers: { onLabels: (l: StepLabel[]) => void; onRead?: () => void }) => {
      watch.asked.push({ relay, coordinate }); watch.handlers = handlers;
      return () => { watch.stopped += 1; };
    },
  };
});
const posted = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../../../services/publishing/stepPosts', () => ({
  reviewStepLabel: vi.fn(async (...args: unknown[]) => { posted.calls.push(args); return { status: 'sent', result: { relays: 1 } }; }),
}));
const teams = vi.hoisted(() => ({ list: [] as Array<{ id: string; name: string; relayUrl?: string }> }));
vi.mock('../../../../services/RealTimeTeamService', () => ({ realTimeTeamService: { getTeams: () => teams.list } }));
vi.mock('../../../../services/nostr/joinedRelays', () => ({ isJoinedRelay: (url: string) => url === TEAM.relay, subscribeJoinedRelays: () => () => {} }));
vi.mock('../../../../components/Identity/KeyName', () => ({ default: ({ pubkey }: { pubkey: string }) => <span>{pubkey.slice(0, 4)}</span> }));

import TakenMissionsList from '../TakenMissionsList';
import { takenMissions } from '../../../../services/intel/received/takenMissions';
import { nostrIdentityService } from '../../../../services/identity/NostrIdentityService';

const NOW_S = Math.floor(Date.now() / 1000);
const take = (team?: typeof TEAM) => {
  takenMissions.take({
    key: `${SIGNER}:starcom_mission_package_swifts`, coordinate: COORDINATE, signer: SIGNER, packageId: 'swifts', relay: '',
    title: 'Count the swifts', steps: [{ id: 's1', ask: 'Find a chimney roost.' }, { id: 's2', ask: 'Count them at dusk.' }],
  });
  if (team) takenMissions.setTeam(`${SIGNER}:starcom_mission_package_swifts`, team);
};
const label = (pubkey: string, value: StepLabel['value'], step = 's1', more: Partial<StepLabel> = {}): StepLabel => ({
  id: `${pubkey.slice(0, 2)}-${value}-${step}-${Math.random()}`, pubkey, value, coordinate: COORDINATE, step, createdAt: NOW_S - 60,
  ...(value === 'taken' ? { expiresAt: NOW_S + 3600 } : {}), ...more,
});
const row = (ask: string) => screen.getByRole('checkbox', { name: ask }).closest('label')!.parentElement!;
const tell = (labels: StepLabel[]) => act(() => { watch.handlers!.onLabels(labels); watch.handlers!.onRead?.(); });

beforeEach(() => {
  takenMissions.reset();
  watch.asked.length = 0; watch.handlers = null; watch.stopped = 0;
  posted.calls.length = 0;
  teams.list = [{ id: 't1', name: TEAM.name, relayUrl: TEAM.relay }, { id: 't2', name: 'Not joined', relayUrl: 'wss://other.example.org' }];
  vi.spyOn(nostrIdentityService, 'signerPubkey').mockReturnValue(YOU);
});

describe('working a mission with a team', () => {
  it('alone, reads and posts nothing, and offers to work it with a team whose relay is joined', () => {
    take();
    render(<TakenMissionsList />);
    expect(watch.asked).toEqual([]);
    expect(screen.queryAllByTestId('step-together')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Work it with a team' }));
    fireEvent.mouseDown(screen.getByLabelText('The team'));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Bay Area crew']);
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Work it with them' }));
    expect(takenMissions.all()[0].team).toEqual(TEAM);
    expect(screen.getByTestId('steps-together').textContent).toContain('Worked with Bay Area crew. Only its members see who takes each step.');
    expect(watch.asked).toEqual([{ relay: TEAM.relay, coordinate: COORDINATE }]);
  });

  it('says to join a team\'s relay first when none is joined', () => {
    teams.list = [{ id: 't2', name: 'Not joined', relayUrl: 'wss://other.example.org' }];
    take();
    render(<TakenMissionsList />);
    fireEvent.click(screen.getByRole('button', { name: 'Work it with a team' }));
    expect(screen.getByText('To work it with a team, join its relay first.')).toBeTruthy();
  });

  it('says it is reading the team\'s relay, then offers each open step to take, through the review', async () => {
    take(TEAM);
    render(<TakenMissionsList />);
    expect(screen.getByText('Reading the team’s relay…')).toBeTruthy();
    tell([]);
    expect(screen.queryByText('Reading the team’s relay…')).toBeNull();
    fireEvent.click(within(row('Find a chimney roost.')).getByRole('button', { name: 'Take this step' }));
    await waitFor(() => expect(posted.calls).toHaveLength(1));
    expect(posted.calls[0].slice(0, 5)).toEqual([TEAM, { coordinate: COORDINATE, title: 'Count the swifts' }, { id: 's1', ask: 'Find a chimney roost.' }, 'taken', {}]);
  });

  it('a step taken by you: yours until when, done through the review, which ticks it here; or released', async () => {
    take(TEAM);
    render(<TakenMissionsList />);
    tell([label(YOU, 'taken')]);
    const mine = row('Find a chimney roost.');
    expect(mine.textContent).toMatch(/Yours until \d{1,2} \w{3} \d{2}:\d{2}Z/);
    fireEvent.click(within(mine).getByRole('button', { name: 'Release it' }));
    await waitFor(() => expect(posted.calls).toHaveLength(1));
    expect(posted.calls[0][3]).toBe('released');
    fireEvent.click(within(mine).getByRole('button', { name: 'Mark it done' }));
    await waitFor(() => expect(posted.calls).toHaveLength(2));
    expect(posted.calls[1][3]).toBe('done');
    await waitFor(() => expect(takenMissions.all()[0].steps[0].done).toBe(true));
  });

  it('a step taken by someone else is theirs, with nothing to take', () => {
    take(TEAM);
    render(<TakenMissionsList />);
    tell([label(SAM, 'taken')]);
    const theirs = row('Find a chimney roost.');
    expect(theirs.textContent).toMatch(/Taken by cccc until/);
    expect(within(theirs).queryByRole('button')).toBeNull();
  });

  it('a step someone else did is checked by you, with a note, naming their done', async () => {
    take(TEAM);
    render(<TakenMissionsList />);
    tell([label(SAM, 'done')]);
    const theirs = row('Find a chimney roost.');
    expect(theirs.textContent).toContain('Done by cccc');
    fireEvent.click(within(theirs).getByRole('button', { name: 'Check it' }));
    fireEvent.change(within(theirs).getByLabelText('What you checked'), { target: { value: 'Saw the roost myself.' } });
    fireEvent.click(within(theirs).getByRole('button', { name: 'Check it' }));
    await waitFor(() => expect(posted.calls).toHaveLength(1));
    expect(posted.calls[0][3]).toBe('checked');
    expect(posted.calls[0][4]).toEqual({ doer: SAM, note: 'Saw the roost myself.' });
  });

  it('a step you did waits for someone else to check it; one checked says who did and who checked', () => {
    take(TEAM);
    render(<TakenMissionsList />);
    tell([label(YOU, 'done', 's1'), label(SAM, 'done', 's2', { createdAt: NOW_S - 120 }), label(YOU, 'checked', 's2', { doer: SAM, note: 'Counted again: 212.' })]);
    const mine = row('Find a chimney roost.');
    expect(mine.textContent).toContain('Done by you. Someone else on it can check it.');
    expect(within(mine).queryByRole('button', { name: 'Check it' })).toBeNull();
    expect(row('Count them at dusk.').textContent).toContain('Done by cccc, checked by bbbb: “Counted again: 212.”');
  });

  it('worked alone again, stops reading the team\'s relay', () => {
    take(TEAM);
    render(<TakenMissionsList />);
    fireEvent.click(screen.getByRole('button', { name: 'Work it alone' }));
    expect(takenMissions.all()[0]).not.toHaveProperty('team');
    expect(watch.stopped).toBe(1);
    expect(screen.queryAllByTestId('step-together')).toHaveLength(0);
  });
});
