/**
 * The coach on screen (plan item 6.1): it points at the next control on the
 * intern's own work, says what to do, links the glossary, and moves on when
 * the real record changes. It is off until someone starts it.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const navigateToApp = vi.hoisted(() => vi.fn());
vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp }) }));
const stores = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const data = { reports: [] as unknown[], cases: [] as unknown[], missions: [] as unknown[] };
  const service = (key: keyof typeof data) => ({ list: vi.fn(async () => data[key]), onChange: vi.fn((l: () => void) => { listeners.add(l); return () => listeners.delete(l); }) });
  return { data, listeners, reports: service('reports'), cases: service('cases'), missions: service('missions') };
});
vi.mock('../../../services/intel/IntelReportService', () => ({ intelReportService: { listReports: stores.reports.list, onChange: stores.reports.onChange } }));
vi.mock('../../../services/intel/IntelCaseService', () => ({ intelCaseService: { listCases: stores.cases.list, onChange: stores.cases.onChange } }));
vi.mock('../../../services/intel/MissionService', () => ({ missionService: { listMissions: stores.missions.list, onChange: stores.missions.onChange } }));

import CoachRoot from '../CoachRoot';
import { DockHost } from '../../Dock/DockHost';
import { startCoach, stopCoach, coachIsOn } from '../coachOpen';

const changed = () => act(() => { stores.listeners.forEach((l) => l()); });

beforeEach(() => {
  localStorage.clear();
  navigateToApp.mockReset();
  stores.data.reports = []; stores.data.cases = []; stores.data.missions = [];
});

describe('the coach', () => {
  it('shows nothing until it is started', () => {
    render(<CoachRoot />);
    expect(screen.queryByTestId('coach')).toBeNull();
  });

  it("says the next step on the person's own work, and takes them where it happens when its control is not on screen", async () => {
    render(<CoachRoot />);
    act(() => startCoach());
    const coach = await screen.findByTestId('coach');
    expect(coach.textContent).toMatch(/Step 1 of 7.*Write an Intel Report/s);
    fireEvent.click(screen.getByRole('button', { name: 'Go to IntelDashboard' }));
    expect(navigateToApp).toHaveBeenCalledWith('inteldashboard', undefined, undefined);
  });

  // K16: its card sat fixed at the bottom-right, on the right rail, the Layers button and the scrubber.
  it('with no control on screen to point at, docks its card in the bottom-right corner', async () => {
    render(<DockHost><CoachRoot /></DockHost>);
    act(() => startCoach());
    const slot = (await screen.findByTestId('coach')).closest('[data-dock-slot]');
    expect(slot?.getAttribute('data-dock-slot')).toBe('coach');
    expect(slot?.parentElement?.getAttribute('data-dock')).toBe('bottom-right');
  });

  it('rings the control to use when it is on screen, deepest first, and offers no "Go to"', async () => {
    render(<><button data-testid="new-record">New</button><button data-testid="create-record" hidden>Create</button><CoachRoot /></>);
    // jsdom lays nothing out: give the shown control the size a browser would.
    const shown = screen.getByTestId('new-record');
    shown.getBoundingClientRect = () => ({ top: 10, left: 20, width: 80, height: 30, right: 100, bottom: 40, x: 20, y: 10, toJSON: () => ({}) });
    act(() => startCoach());
    const ring = await screen.findByTestId('coach-ring');
    // Around the control on screen, not the deeper one that is hidden.
    expect(window.getComputedStyle(ring).width).toBe('88px');
    expect(screen.queryByRole('button', { name: /^Go to/ })).toBeNull();
  });

  it('rings the deeper control when both are on screen: the one inside the open form', async () => {
    render(<><button data-testid="new-record">New</button><button data-testid="create-record">Create</button><CoachRoot /></>);
    screen.getByTestId('new-record').getBoundingClientRect = () => ({ top: 10, left: 20, width: 80, height: 30, right: 100, bottom: 40, x: 20, y: 10, toJSON: () => ({}) });
    screen.getByTestId('create-record').getBoundingClientRect = () => ({ top: 200, left: 20, width: 120, height: 30, right: 140, bottom: 230, x: 20, y: 200, toJSON: () => ({}) });
    act(() => startCoach());
    const ring = await screen.findByTestId('coach-ring');
    expect(window.getComputedStyle(ring).width).toBe('128px');
  });

  it('moves on when the real record changes, and links the word for each step', async () => {
    render(<CoachRoot />);
    act(() => startCoach());
    await screen.findByText('Write an Intel Report');
    stores.data.reports = [{ id: 'r1' }];
    changed();
    expect((await screen.findByTestId('coach')).textContent).toMatch(/Step 2 of 7.*Open a case/s);
    expect(screen.getByTestId('what-is-visibility')).toBeTruthy();
  });

  it('is not moved on by sample material', async () => {
    stores.data.reports = [{ id: 'r1', sample: true }];
    render(<CoachRoot />);
    act(() => startCoach());
    expect((await screen.findByTestId('coach')).textContent).toMatch(/Write an Intel Report/);
  });

  it('keeps coaching across a reload until stopped, and stays stopped after one', async () => {
    const first = render(<CoachRoot />);
    act(() => startCoach());
    await screen.findByTestId('coach');
    first.unmount();
    // A reload: a fresh coach, reading what this browser kept.
    const second = render(<CoachRoot />);
    fireEvent.click(await screen.findByRole('button', { name: 'Stop coaching' }));
    await waitFor(() => expect(screen.queryByTestId('coach')).toBeNull());
    second.unmount();
    render(<CoachRoot />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('coach')).toBeNull();
    expect(coachIsOn()).toBe(false);
  });

  it('steps aside, saying so, once the whole pipeline has been done', async () => {
    stores.data.reports = [{ id: 'r1' }];
    stores.data.cases = [{ id: 'c1', relatedEntities: ['r1'], position: { statement: 'x' } }];
    stores.data.missions = [{ id: 'm1', status: 'PACKAGED', relatedCases: ['c1'] }];
    render(<CoachRoot />);
    act(() => startCoach());
    expect((await screen.findByTestId('coach')).textContent).toMatch(/whole pipeline/);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(coachIsOn()).toBe(false);
    act(() => stopCoach());
  });
});
