/**
 * The popup footer previously had four action buttons — Export Analysis,
 * Create Task, Follow-up, Share — all of which just console.debug'd and did
 * nothing. Export Analysis is now a real JSON download; Create Task is now
 * a real "Open in Intel Dashboard" navigation; Follow-up and Share had no
 * backing feature to make real, so they were removed rather than left as
 * decorative dead ends.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntelReportPopup } from '../IntelReportPopup';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';
import { eventChart, resetEventChartForTests } from '../../../../features/psi/eventChartPanel';

const navigateToAppMock = vi.fn();
vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: navigateToAppMock }),
}));

// Reviews read relays; none are reached from here.
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));

function makeReport(overrides: Partial<IntelReportOverlayMarker> = {}): IntelReportOverlayMarker {
  return {
    pubkey: 'report-abc123',
    title: 'Test Report',
    content: 'Body',
    tags: [],
    latitude: 10,
    longitude: 20,
    timestamp: Date.now(),
    author: 'analyst',
    ...overrides
  };
}

describe('IntelReportPopup — footer actions', () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    navigateToAppMock.mockClear();
    createObjectURLSpy = vi.fn(() => 'blob:mock-url');
    revokeObjectURLSpy = vi.fn();
    global.URL.createObjectURL = createObjectURLSpy as unknown as typeof URL.createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURLSpy as unknown as typeof URL.revokeObjectURL;
  });

  it('no longer renders the decorative Follow-up or Share buttons', () => {
    render(
      <MemoryRouter>
        <IntelReportPopup report={makeReport()} visible={true} onClose={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /Follow-up/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Share/i })).not.toBeInTheDocument();
  });

  it('Export Analysis triggers a real JSON blob download', () => {
    render(
      <MemoryRouter>
        <IntelReportPopup report={makeReport()} visible={true} onClose={vi.fn()} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText(/Export Analysis/i));

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const [blobArg] = createObjectURLSpy.mock.calls[0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(blobArg.type).toBe('application/json');
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
  });

  it('"Open in Intel Dashboard" hands off to the Intel Dashboard app with the report id', () => {
    render(
      <MemoryRouter>
        <IntelReportPopup report={makeReport({ pubkey: 'report-xyz' })} visible={true} onClose={vi.fn()} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText(/Open in Intel Dashboard/i));

    expect(navigateToAppMock).toHaveBeenCalledWith('inteldashboard', undefined, { reportId: 'report-xyz' });
  });

  it('opens the reviews of a report read from a relay, and offers none for one that was not (plan item 5.1)', async () => {
    const author = 'a'.repeat(64);
    const { unmount } = render(<MemoryRouter><IntelReportPopup report={makeReport()} visible onClose={() => {}} /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /Reviews/ })).toBeNull();
    unmount();
    render(<MemoryRouter><IntelReportPopup report={makeReport({ pubkey: `30023:${author}:intel-1`, author, nostrEventId: 'e'.repeat(64), nostrKind: 30023 })} visible onClose={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Reviews/ }));
    expect(await screen.findByTestId('report-popup-reviews')).toBeTruthy();
  });

  // Its chart, then and now (D-PW, PW7, PW85): the report's own time and place.
  it("opens the report's chart at its time and place, closing for it, and offers none without a time", async () => {
    resetEventChartForTests();
    const at = Date.UTC(2026, 10, 10, 6, 0);
    const onClose = vi.fn();
    const { unmount } = render(
      <MemoryRouter>
        <IntelReportPopup report={makeReport({ timestamp: at })} visible={true} onClose={onClose} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('report-popup-chart'));
    expect(eventChart()).toMatchObject({ open: true, subject: { title: 'Test Report', timeMs: at, place: { lat: 10, lng: 20 } } });
    // The popup gives way to the chart.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    unmount();
    render(
      <MemoryRouter>
        <IntelReportPopup report={makeReport({ timestamp: undefined })} visible={true} onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('report-popup-chart')).toBeNull();
    resetEventChartForTests();
  });
});
