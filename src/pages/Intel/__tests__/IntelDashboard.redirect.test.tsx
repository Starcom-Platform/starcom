/**
 * Intel Report consolidation: this legacy page (routed at /intel) was
 * retired to a redirect shim into IntelWorkspaceConsole.tsx (the
 * "inteldashboard" app), which now has everything this page offered (its
 * two unique capabilities — ?reportId= deep-link highlight and "View on
 * Globe" — were ported over) plus real search/JSON-import/detail-edit this
 * page never had. Verifies the redirect actually fires with the right
 * deep-link args rather than silently doing nothing. Mirrors
 * TeamWorkspace.redirect.test.tsx's own pattern for the same consolidation shape.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApplicationRouterProvider } from '../../../components/Router/ApplicationRouter';
import IntelDashboard from '../IntelDashboard';

const navigateToApp = vi.fn();
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp })
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

function renderIntel(path: string) {
  return render(
    <ApplicationRouterProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/intel" element={<IntelDashboard />} />
        </Routes>
      </MemoryRouter>
    </ApplicationRouterProvider>
  );
}

describe('IntelDashboard page — redirects into the Intel Dashboard app (Intel Report consolidation)', () => {
  beforeEach(() => {
    navigateToApp.mockReset();
    navigate.mockReset();
  });

  it('deep-links into the app with the ?reportId= from the URL, then navigates home', () => {
    renderIntel('/intel?reportId=report-xyz');

    expect(navigateToApp).toHaveBeenCalledWith('inteldashboard', 'modal', { reportId: 'report-xyz' });
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('redirects with no reportId context when none is in the URL', () => {
    renderIntel('/intel');

    expect(navigateToApp).toHaveBeenCalledWith('inteldashboard', 'modal', undefined);
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
