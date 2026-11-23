/**
 * The two capabilities pages/Intel/IntelDashboard.tsx (the now-retired /intel
 * page) uniquely had — a ?reportId= deep-link highlight and a "View on
 * Globe" button — were ported into this, the canonical Intel Report
 * browse/create/edit console, as part of the Intel Report consolidation
 * (see docs/missions/01-architecture-decisions/canonical-intel-report-path.md).
 * This covers the ported behavior; the old page's equivalent test
 * (IntelDashboard.viewOnGlobe.test.tsx) was retired along with the page.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// jsdom has no scrollIntoView implementation at all (unrelated to anything
// under test) — the highlight effect below calls it on a real DOM ref,
// which throws and crashes the whole render without this.
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}
import { IntelWorkspaceProvider } from '../../../services/intel/IntelWorkspaceContext';
import { ApplicationRouterProvider } from '../../../components/Router/ApplicationRouter';
import { GlobeProvider } from '../../../context/GlobeContext';
import { IntelWorkspaceConsole } from '../IntelWorkspaceConsole';
import { intelReportService } from '../../../services/intel/IntelReportService';

const navigateToApp = vi.fn();
vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp }),
}));

const setFocusLocation = vi.fn();
vi.mock('../../../context/GlobeContext', () => ({
  GlobeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGlobeContext: () => ({
    focusLocation: null,
    setFocusLocation,
    focusRequest: null,
    consumeFocusRequest: vi.fn(),
  }),
}));

const setVisualizationMode = vi.fn();
vi.mock('../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ setVisualizationMode }),
}));

function renderConsole(initialReportId?: string) {
  return render(
    <ApplicationRouterProvider>
      <GlobeProvider>
        <IntelWorkspaceProvider>
          <IntelWorkspaceConsole initialReportId={initialReportId} />
        </IntelWorkspaceProvider>
      </GlobeProvider>
    </ApplicationRouterProvider>
  );
}

describe('IntelWorkspaceConsole — deep-link highlight and View on Globe', () => {
  beforeEach(() => {
    navigateToApp.mockReset();
    setFocusLocation.mockReset();
    setVisualizationMode.mockReset();
  });

  it('selects and highlights a report passed as initialReportId once it loads', async () => {
    const report = await intelReportService.createReport(
      { title: 'Deep-linked report', content: 'Body', category: 'general', tags: [] },
      'analyst-1'
    );

    renderConsole(report.id);

    // Selecting it opens the detail panel, which renders the title as a heading.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Deep-linked report' })).toBeTruthy());
    // Its row is outlined in the focus cyan until something else is chosen.
    const row = screen.getAllByTestId('report-row').find((r) => r.getAttribute('data-report-id') === report.id)!;
    expect(row.className).toMatch(/highlighted/);
    fireEvent.click(row);
    expect(row.className).not.toMatch(/highlighted/);
  });

  it('shows "View on Globe" only for a selected report with coordinates, and it flies the globe there', async () => {
    const geoReport = await intelReportService.createReport(
      { title: 'Has Coords', content: 'Body', category: 'general', tags: [], latitude: 34.5, longitude: -12.25 },
      'analyst-1'
    );
    const noGeoReport = await intelReportService.createReport(
      { title: 'No Coords', content: 'Body', category: 'general', tags: [] },
      'analyst-1'
    );

    renderConsole();

    fireEvent.click(await screen.findByText('No Coords'));
    await screen.findByRole('heading', { name: 'No Coords' });
    expect(screen.queryByText(/View on Globe/i)).toBeNull();

    fireEvent.click(await screen.findByText('Has Coords'));
    await screen.findByRole('heading', { name: 'Has Coords' });
    const viewOnGlobeButton = await screen.findByText(/View on Globe/i);
    fireEvent.click(viewOnGlobeButton);

    expect(setFocusLocation).toHaveBeenCalledWith({ lat: 34.5, lng: -12.25 });
    expect(navigateToApp).toHaveBeenCalledWith('cybercommand');

    // Moving the camera is not enough on its own: report markers are gated on
    // IntelReports being the active layer, and the mode persists across
    // sessions. Without this the operator lands on the right coordinates in
    // whatever mode they last used, with nothing drawn and no explanation.
    expect(setVisualizationMode).toHaveBeenCalledWith({ mode: 'CyberCommand', subMode: 'IntelReports' });

    // Sanity: both reports actually loaded (rules out a false pass from an empty list).
    expect(geoReport.id).not.toBe(noGeoReport.id);
  });

  it('hands IntelWeb the report ID, not a vault path', async () => {
    // The vault path is a slug of the title plus a hash of the id, computed
    // inside the vault build. Sending an id keeps that the only implementation
    // of the rule; sending a path would be a second one, free to drift.
    const report = await intelReportService.createReport(
      { title: 'Web Linked', content: 'Body', category: 'general', tags: [] },
      'analyst-1'
    );

    renderConsole();

    fireEvent.click(await screen.findByText('Web Linked'));
    await screen.findByRole('heading', { name: 'Web Linked' });
    fireEvent.click(await screen.findByText(/View in IntelWeb/i));

    expect(navigateToApp).toHaveBeenCalledWith('intelweb', 'standalone', { reportId: report.id });
  });
});
