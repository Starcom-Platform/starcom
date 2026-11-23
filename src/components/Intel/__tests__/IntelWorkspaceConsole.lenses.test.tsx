/**
 * The Intel Dashboard's list focuses on the big-three lenses the person chooses (D-CT, CT5), the
 * same choice the globe's Intel Reports layer keeps, and badges each report that carries one.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../context/GlobeContext', () => ({
  GlobeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGlobeContext: () => ({ focusLocation: null, setFocusLocation: vi.fn(), focusRequest: null, consumeFocusRequest: vi.fn() }),
}));
vi.mock('../../../context/VisualizationModeContext', () => ({ useVisualizationMode: () => ({ setVisualizationMode: vi.fn() }) }));

import { IntelWorkspaceProvider } from '../../../services/intel/IntelWorkspaceContext';
import { ApplicationRouterProvider } from '../../../components/Router/ApplicationRouter';
import { IntelWorkspaceConsole } from '../IntelWorkspaceConsole';
import { intelReportService } from '../../../services/intel/IntelReportService';

const mount = () => render(
  <ApplicationRouterProvider><IntelWorkspaceProvider><IntelWorkspaceConsole /></IntelWorkspaceProvider></ApplicationRouterProvider>,
);
const titles = () => screen.getAllByTestId('report-row').map((row) => row.querySelector('div')?.textContent);

describe('IntelWorkspaceConsole: the big-three lenses', () => {
  it('lists only reports carrying a chosen lens, says how many it hides, and All lists every one', async () => {
    await intelReportService.createReport({ title: 'Cartel designation', content: 'Body', category: 'general', tags: [], hashtags: ['lens:tcs'] }, 'p');
    await intelReportService.createReport({ title: 'Bank action', content: 'Body', category: 'general', tags: [], hashtags: ['lens:cbc', 'lens:tcs'] }, 'p');
    await intelReportService.createReport({ title: 'Plain note', content: 'Body', category: 'general', tags: [], hashtags: [] }, 'p');
    mount();
    await screen.findByText('Plain note');

    fireEvent.click(screen.getByRole('button', { name: 'Cabals of Banking Cartels' }));
    await waitFor(() => expect(titles()).toEqual(['Bank action']));
    expect(within(screen.getByTestId('lens-filter')).getByText(/2 hidden here\./)).toBeTruthy();
    const row = screen.getAllByTestId('report-row')[0];
    expect(within(row).getByLabelText('Lens: Cabals of Banking Cartels').textContent).toBe('CBC');
    expect(within(row).getByLabelText('Lens: Transnational Crime Syndicates').textContent).toBe('TCS');

    fireEvent.click(screen.getByRole('button', { name: 'Transnational Crime Syndicates' }));
    await waitFor(() => expect(titles()?.sort()).toEqual(['Bank action', 'Cartel designation']));

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(titles()).toHaveLength(3));
  });
});
