/**
 * The report popup says which time placed the report (decision D-E): when the
 * event happened, or when the report was written with no event time stated.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { IntelReportPopup } from '../IntelReportPopup';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));

const marker = (over: Partial<IntelReportOverlayMarker>): IntelReportOverlayMarker => ({
  pubkey: 'report-time', title: 'A Report', content: 'Body', tags: [],
  latitude: 10, longitude: 20, timestamp: Date.UTC(2026, 6, 27), author: 'analyst',
  ...over,
});

const renderPopup = (over: Partial<IntelReportOverlayMarker>) => render(
  <MemoryRouter>
    <IntelReportPopup report={marker(over)} visible={true} onClose={vi.fn()} />
  </MemoryRouter>
);

describe('IntelReportPopup: which time placed the report', () => {
  it('says when the event happened, as closely as it is known', () => {
    renderPopup({ timeBasis: 'event', timePrecisionMs: 86_400_000 });
    expect(screen.getByText('Happened')).toBeInTheDocument();
    expect(screen.getByText('27 Jul 2026')).toBeInTheDocument();
  });

  it('says when the report was written, and that no event time was stated', () => {
    renderPopup({ timeBasis: 'written', timestamp: Date.UTC(2026, 8, 14, 9, 5) });
    expect(screen.getByText('Written')).toBeInTheDocument();
    expect(screen.getByText('14 Sep 2026 09:05Z (no stated event time)')).toBeInTheDocument();
  });

  it('keeps its old label for a marker whose producer does not say', () => {
    renderPopup({});
    expect(screen.getByText('Timestamp')).toBeInTheDocument();
  });
});
