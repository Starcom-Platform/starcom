/**
 * Deleting a report from the Intel Dashboard (plan item 0.6). After Delete, the
 * console kept the deleted report selected, so its detail panel went on showing
 * a report that no longer existed, with Edit still offered. Now the panel
 * closes, the row goes, and Undo brings the row back.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}
import { IntelWorkspaceProvider } from '../../../services/intel/IntelWorkspaceContext';
import { ApplicationRouterProvider } from '../../../components/Router/ApplicationRouter';
import { GlobeProvider } from '../../../context/GlobeContext';
import { IntelWorkspaceConsole } from '../IntelWorkspaceConsole';
import UndoDeletionRoot from '../../Undo/UndoDeletionRoot';
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

describe('IntelWorkspaceConsole — deleting a report', () => {
  it('closes the deleted report, and Undo brings its row back', async () => {
    const report = await intelReportService.createReport(
      { title: 'Bridge closed at noon', content: 'Seen from the east bank.', category: 'general', tags: [] }, 'analyst-1',
    );
    render(
      <ApplicationRouterProvider>
        <GlobeProvider>
          <IntelWorkspaceProvider>
            <IntelWorkspaceConsole initialReportId={report.id} />
          </IntelWorkspaceProvider>
        </GlobeProvider>
        <UndoDeletionRoot />
      </ApplicationRouterProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryAllByText('Bridge closed at noon')).toHaveLength(0));
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(
      screen.queryAllByTestId('report-row').some((row) => row.textContent?.includes('Bridge closed at noon')),
    ).toBe(true));
  });
});
