/**
 * A report opened on the globe can be followed to where its information was published (decision
 * D-CT, CT2): its `r` tags as Sources, in tag order, the first the original, each by its host. And
 * the big-three lenses it is sorted under, as badges (CT6).
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { IntelReportPopup } from '../IntelReportPopup';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
const report = (over: Partial<IntelReportOverlayMarker>): IntelReportOverlayMarker => ({
  pubkey: 'r1', title: 'Bank of America, N.A.: two US authorities\' actions', content: 'Body', tags: [],
  latitude: 40.4, longitude: -82.7, timestamp: Date.UTC(2026, 9, 16, 12, 44), author: 'publisher',
  ...over,
});
const open = (over: Partial<IntelReportOverlayMarker>) =>
  render(<MemoryRouter><IntelReportPopup report={report(over)} visible onClose={vi.fn()} /></MemoryRouter>);

describe('IntelReportPopup: sources and lenses', () => {
  it('lists the sources in tag order, the first marked as the original, each opening safely in a new tab', () => {
    open({ sourceLinks: ['https://www.occ.gov/news-issuances/x', 'https://www.fincen.gov/news/y', 'javascript:alert(1)'] });
    const section = screen.getByTestId('report-popup-sources');
    expect(within(section).getByRole('heading', { name: 'Sources' })).toBeInTheDocument();
    const links = within(section).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['occ.gov', 'fincen.gov']);
    expect(links[0]).toHaveAttribute('href', 'https://www.occ.gov/news-issuances/x');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(links[0].closest('li')!).getByText('Original source')).toBeInTheDocument();
  });

  it('shows no Sources section for a report that names none', () => {
    open({});
    expect(screen.queryByTestId('report-popup-sources')).not.toBeInTheDocument();
  });

  it('badges the lenses it carries, with their full names', () => {
    open({ tags: ['nostr', 'lens:cbc', 'lens:tcs'] });
    expect(screen.getByLabelText('Lens: Transnational Crime Syndicates')).toHaveTextContent('TCS');
    expect(screen.getByLabelText('Lens: Cabals of Banking Cartels')).toHaveTextContent('CBC');
    expect(screen.queryByLabelText('Lens: International Death Cults')).not.toBeInTheDocument();
  });
});
