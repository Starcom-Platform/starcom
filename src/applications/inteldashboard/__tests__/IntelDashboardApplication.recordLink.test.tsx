/**
 * A report's record link opens that report.
 *
 * recordLink.test.ts checks what a link SENDS, and it passed while
 * /r/report/:id opened the dashboard with nothing selected: the link sent
 * selectReportId, and IntelDashboardApplication reads reportId. A test of the
 * producer cannot see a disagreement with the consumer. This renders the
 * destination the way ApplicationRenderer does, with the link's context spread
 * as props, so the two have to agree for it to pass.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// jsdom has no scrollIntoView, and the console scrolls a deep-linked report into view.
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}
import IntelDashboardApplication from '../IntelDashboardApplication';
import { recordTarget } from '../../../routes/recordLink';
import { intelReportService } from '../../../services/intel/IntelReportService';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../context/GlobeContext', () => ({
  useGlobeContext: () => ({ focusLocation: null, setFocusLocation: vi.fn(), focusRequest: null, consumeFocusRequest: vi.fn() }),
}));
vi.mock('../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => ({ setVisualizationMode: vi.fn() }),
}));

describe('IntelDashboardApplication — arriving by a report record link', () => {
  it('opens the linked report, from exactly the context the link produces', async () => {
    const report = await intelReportService.createReport(
      { title: `Linked from outside ${Date.now()}`, content: 'Body', category: 'general', tags: [] },
      'analyst-1',
    );
    const { app, context } = recordTarget('report', report.id);
    expect(app).toBe('inteldashboard');

    render(<IntelDashboardApplication {...context} />);

    // Selecting a report opens its detail panel, which renders the title as a heading.
    await waitFor(() => expect(screen.getByRole('heading', { name: report.title })).toBeTruthy(), { timeout: 10000 });
  });
});
