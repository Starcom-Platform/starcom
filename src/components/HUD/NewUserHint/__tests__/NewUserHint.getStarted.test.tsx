/**
 * Chat/teams/coordination audit: this hint's "Find Teams" button used to call
 * navigate('/teams') — a route that renders nothing (no route branch, no
 * pathname handling in MainPage), a confirmed dead end reachable from the
 * first thing a new user sees. It was fixed to route through navigateToApp
 * into the real registered app.
 *
 * The "Find Teams" button itself is gone — the card became a state-derived
 * pipeline guide (see NewUserHint.pipeline.test.tsx). This test survives it
 * because the ORIGINAL DEFECT can recur in any action added here, and the
 * guard generalises: every way out of this component must be an application
 * id handed to navigateToApp, never a route path. A path here is the exact
 * shape of the bug that was fixed.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NewUserHint from '../NewUserHint';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import { missionService } from '../../../../services/intel/MissionService';

const navigateToAppMock = vi.fn();
vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: navigateToAppMock })
}));

vi.mock('../../../../services/intel/IntelReportService', () => ({
  intelReportService: { listReports: vi.fn(), onChange: vi.fn(() => () => {}) },
}));
vi.mock('../../../../services/intel/MissionService', () => ({
  missionService: { listMissions: vi.fn(), onChange: vi.fn(() => () => {}) },
}));

vi.mock('../../../Dock/Docked', () => ({
  Docked: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('NewUserHint — every exit is an app id, never a route path', () => {
  beforeEach(() => {
    navigateToAppMock.mockClear();
    localStorage.clear();
    // Nothing done yet, so every step renders its action button.
    vi.mocked(intelReportService.listReports).mockResolvedValue([] as never);
    vi.mocked(missionService.listMissions).mockResolvedValue([] as never);
  });

  it('routes through navigateToApp with an application id, not a path', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NewUserHint />
      </MemoryRouter>
    );

    // The guide opens collapsed on the globe (decision D-F, step 3).
    fireEvent.click(await screen.findByTitle("Show the intel pipeline guide"));

    // Click every action the guide offers, so a newly-added step can't
    // reintroduce the original defect unnoticed.
    const actions = await screen.findAllByRole('button', { name: /→$/ });
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      fireEvent.click(action);
      // Clicking minimises; reopen so the next action is reachable.
      const reopen = screen.queryByTitle('Show the intel pipeline guide');
      if (reopen) fireEvent.click(reopen);
    }

    await waitFor(() => expect(navigateToAppMock).toHaveBeenCalled());
    for (const [appId, mode] of navigateToAppMock.mock.calls) {
      expect(typeof appId).toBe('string');
      // The bug being guarded: a route path where an app id belongs.
      expect(appId.startsWith('/')).toBe(false);
      expect(mode).toBe('standalone');
    }
  });
});
