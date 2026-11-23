/**
 * Each application has an address, and the address and the open application
 * follow each other.
 *
 * Before this, switching apps changed only the application router's state. A
 * reload always returned to the Globe, Back left the site, and no app could be
 * linked to; the pages that open an app and then leave (a record link, the /intel
 * and /team redirects, New Report) sent the browser to `/` and relied on the app
 * state surviving it.
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';

vi.mock('../../../services/pollerScopes', () => ({ makeRouteScope: (appId: string) => `route:${appId}` }));
vi.mock('../../../services/pollerRegistry', () => ({ pollerRegistry: { stopAll: vi.fn() } }));

import { EnhancedApplicationRouterProvider } from '../../../components/Router/EnhancedApplicationRouter';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';
import { useApplicationUrl } from '../useApplicationUrl';
import RecordRoute from '../../../routes/RecordRoute';
import IntelDashboardRedirect from '../../Intel/IntelDashboard';
import TeamWorkspaceRedirect from '../../Teams/TeamWorkspace';

const controls: { navigateToApp?: ReturnType<typeof useApplicationRouter>['navigateToApp']; navigate?: ReturnType<typeof useNavigate> } = {};
/** Every application the shell showed, in order, so a flip through the Globe cannot hide between assertions. */
let shown: string[] = [];

/** Stands in for MainPage: the sync, plus a readout of app, mode, path and selected record. */
const Shell: React.FC = () => {
  useApplicationUrl();
  const { currentApp, presentationMode, context, navigateToApp } = useApplicationRouter();
  const { pathname } = useLocation();
  controls.navigateToApp = navigateToApp;
  controls.navigate = useNavigate();
  React.useEffect(() => {
    if (currentApp) shown.push(currentApp);
  }, [currentApp]);
  const tab = typeof context.initialTab === 'string' ? `tab:${context.initialTab}` : '';
  return <div data-testid="shell">{`${currentApp ?? 'none'} ${presentationMode} ${pathname} ${context.selectCaseId ?? ''} ${tab}`.replace(/\s+/g, ' ').trim()}</div>;
};

function renderAt(path: string) {
  shown = [];
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EnhancedApplicationRouterProvider>
        <Routes>
          <Route path="/" element={<Shell />}>
            <Route index element={null} />
            <Route path="app/:appId" element={null} />
            <Route path="app/:appId/:recordId" element={null} />
          </Route>
          <Route path="/r/:kind/:id" element={<RecordRoute />} />
          <Route path="/intel" element={<IntelDashboardRedirect />} />
          <Route path="/team/:teamId" element={<TeamWorkspaceRedirect />} />
        </Routes>
      </EnhancedApplicationRouterProvider>
    </MemoryRouter>
  );
}

const showing = async (expected: string) =>
  waitFor(() => expect(screen.getByTestId('shell').textContent).toBe(expected));

describe('application addresses', () => {
  it('opens the application a pasted or reloaded address names', async () => {
    renderAt('/app/netrunner');
    await showing('netrunner standalone /app/netrunner');
  });

  it('shows the Globe at the root', async () => {
    renderAt('/');
    await showing('cybercommand standalone /');
  });

  it('puts an opened application in the address, and Back returns to the one before', async () => {
    renderAt('/');
    await showing('cybercommand standalone /');

    act(() => controls.navigateToApp!('netrunner'));
    await showing('netrunner standalone /app/netrunner');

    act(() => controls.navigate!(-1));
    await showing('cybercommand standalone /');
  });

  it('keeps an application opened while the address is sent to /, without passing through the Globe', async () => {
    // What a record link, the /intel and /team redirects and New Report do: open an app, then leave for /.
    renderAt('/app/cases');
    await showing('cases standalone /app/cases');
    shown = [];

    act(() => {
      controls.navigateToApp!('netrunner');
      controls.navigate!('/');
    });

    await showing('netrunner standalone /app/netrunner');
    expect(shown).not.toContain('cybercommand');
  });

  it('opens a record link without passing through the Globe', async () => {
    renderAt('/r/case/case-9');
    await showing('cases standalone /app/cases/case-9');
    expect(shown).not.toContain('cybercommand');
  });

  // Plan item 1.2: a case has a page, and its address opens it.
  it('opens a case page from its address, and Back returns to the list', async () => {
    renderAt('/app/cases');
    await showing('cases standalone /app/cases');

    act(() => controls.navigate!('/app/cases/case-5'));
    await showing('cases standalone /app/cases/case-5');

    act(() => controls.navigate!(-1));
    await showing('cases standalone /app/cases');
  });

  it('opens a case page pasted into a fresh window', async () => {
    renderAt('/app/cases/case-6');
    await showing('cases standalone /app/cases/case-6');
    expect(shown).not.toContain('cybercommand');
  });

  // A link to a tab opened on Overview: the address's tab was never read.
  it('opens the tab an address names', async () => {
    renderAt('/app/teamworkspace?tab=missions');
    await showing('teamworkspace standalone /app/teamworkspace tab:missions');
  });

  // K1: the app is named Missions and lives at /app/missions; OpsCenter's old
  // address above still opens it, and is left as it is.
  it('opens Missions at its own address', async () => {
    renderAt('/app/missions?tab=chat');
    await showing('teamworkspace standalone /app/missions tab:chat');
  });

  it('lands on the Globe for an application this build does not have', async () => {
    renderAt('/app/no-such-app');
    await showing('cybercommand standalone /');
  });

  it("opens a record link at the record's own address", async () => {
    renderAt('/r/case/case-7');
    await showing('cases standalone /app/cases/case-7');
  });

  it('keeps the /intel and /team redirects open as modals, at their applications’ addresses', async () => {
    const { unmount } = renderAt('/intel');
    await showing('inteldashboard modal /app/inteldashboard');
    unmount();

    renderAt('/team/team-1');
    // The redirect names the Overview tab; the readout shows the tab now.
    await showing('teamworkspace modal /app/missions tab:overview');
  });
});
