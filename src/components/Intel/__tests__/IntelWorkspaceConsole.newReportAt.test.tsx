/**
 * "Create Intel Report" on the globe opens the form (plan item 0.11). It saved
 * at once with an automatic title and no content; now the form opens with the
 * clicked point and how precisely the click gave it, and nothing is saved
 * until the person creates it.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}
import { IntelWorkspaceProvider } from '../../../services/intel/IntelWorkspaceContext';
import { ApplicationRouterProvider } from '../../../components/Router/ApplicationRouter';
import IntelDashboardApplication from '../../../applications/inteldashboard/IntelDashboardApplication';
import { intelReportService } from '../../../services/intel/IntelReportService';

vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../context/GlobeContext', () => ({
  GlobeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGlobeContext: () => ({ focusLocation: null, setFocusLocation: vi.fn(), focusRequest: null, consumeFocusRequest: vi.fn() }),
}));
vi.mock('../../../context/VisualizationModeContext', () => ({ useVisualizationMode: () => ({ setVisualizationMode: vi.fn() }) }));

describe('the report form, opened from the globe', () => {
  it('opens at the clicked point with its precision, and saves nothing yet', async () => {
    const before = (await intelReportService.listReports()).length;
    render(
      <ApplicationRouterProvider>
        <IntelWorkspaceProvider>
          <IntelDashboardApplication {...({ newReportLat: '38.9072', newReportLng: '-77.0369', newReportPrecisionM: '1000' } as never)} />
        </IntelWorkspaceProvider>
      </ApplicationRouterProvider>,
    );

    expect(((await screen.findByLabelText(/^Latitude/)) as HTMLInputElement).value).toBe('38.9072');
    expect((screen.getByLabelText(/^Longitude/) as HTMLInputElement).value).toBe('-77.0369');
    expect((screen.getByLabelText(/^Place precision/) as HTMLSelectElement).value).toBe('1000');
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe('');
    expect((await intelReportService.listReports()).length).toBe(before);
  });
});
