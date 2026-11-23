/**
 * The workspace console's report form records when the event happened
 * (decision D-E), through the real report service and workspace storage.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// jsdom has no scrollIntoView; the console's highlight effect calls it.
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}
import { IntelWorkspaceProvider } from '../../../services/intel/IntelWorkspaceContext';
import { ApplicationRouterProvider } from '../../../components/Router/ApplicationRouter';
import { GlobeProvider } from '../../../context/GlobeContext';
import { IntelWorkspaceConsole } from '../IntelWorkspaceConsole';
import { intelReportService } from '../../../services/intel/IntelReportService';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../context/GlobeContext', () => ({
  GlobeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGlobeContext: () => ({ focusLocation: null, setFocusLocation: vi.fn(), focusRequest: null, consumeFocusRequest: vi.fn() }),
}));
vi.mock('../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ setVisualizationMode: vi.fn() }),
}));

const renderConsole = () =>
  render(
    <ApplicationRouterProvider>
      <GlobeProvider>
        <IntelWorkspaceProvider>
          <IntelWorkspaceConsole />
        </IntelWorkspaceProvider>
      </GlobeProvider>
    </ApplicationRouterProvider>
  );

const startReport = async (title: string) => {
  fireEvent.click(await screen.findByTestId('new-record'));
  fireEvent.change(screen.getByTestId('record-title'), { target: { value: title } });
  fireEvent.change(screen.getByTestId('record-content'), { target: { value: 'Seen from the ridge.' } });
};

describe('IntelWorkspaceConsole: a new report records when the event happened', () => {
  it('stores the event time entered in the form', async () => {
    renderConsole();
    await startReport('Event-time console report');
    fireEvent.change(screen.getByLabelText('Start date (UTC)'), { target: { value: '2026-07-27' } });
    fireEvent.click(screen.getByLabelText('Time unknown'));
    fireEvent.click(screen.getByTestId('create-record'));

    await waitFor(async () => {
      const saved = (await intelReportService.listReports()).find((r) => r.title === 'Event-time console report');
      expect(saved?.startDate?.toISOString()).toBe('2026-07-27T00:00:00.000Z');
      expect(saved?.timePrecisionMs).toBe(86_400_000);
    });
  });

  it('will not create a report with an event time it cannot read', async () => {
    renderConsole();
    await startReport('Unreadable event time');
    fireEvent.change(screen.getByLabelText('Start date (UTC)'), { target: { value: '2026-07-27' } });
    fireEvent.change(screen.getByLabelText('End date (UTC)'), { target: { value: '2026-07-01' } });

    expect(screen.getByTestId('create-record')).toBeDisabled();
  });
});
