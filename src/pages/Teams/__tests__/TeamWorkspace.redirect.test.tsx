/**
 * Team UI consolidation: this legacy page (routed at /team/:teamId) was
 * retired to a redirect shim into TeamWorkspaceApplication.tsx ("CollabCenter"),
 * which now has everything this page offered (its one unique capability, an
 * Investigations tab, was ported over) plus real chat/invite codes/admin
 * analytics this page never had. Verifies the redirect actually fires with
 * the right deep-link args rather than silently doing nothing.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApplicationRouterProvider } from '../../../components/Router/ApplicationRouter';
import TeamWorkspace from '../TeamWorkspace';

const navigateToApp = vi.fn();
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp })
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function renderTeam(teamId: string) {
  return render(
    <ApplicationRouterProvider>
      <MemoryRouter initialEntries={[`/team/${teamId}`]}>
        <Routes>
          <Route path="/team/:teamId" element={<TeamWorkspace />} />
        </Routes>
      </MemoryRouter>
    </ApplicationRouterProvider>
  );
}

describe('TeamWorkspace page — redirects into CollabCenter (team UI consolidation)', () => {
  beforeEach(() => {
    navigateToApp.mockReset();
    navigate.mockReset();
  });

  it('deep-links into TeamWorkspaceApplication with the route teamId, then navigates home', () => {
    renderTeam('team-abc-123');

    expect(navigateToApp).toHaveBeenCalledWith('teamworkspace', 'modal', {
      initialTeamId: 'team-abc-123',
      initialTab: 'overview'
    });
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
