/**
 * The report panel shows what was written about the place (plan item 1.9).
 * It showed the point alone when there was one, so a report's jurisdictions
 * vanished from view as soon as it had coordinates, and its precision never
 * showed at all.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReportDetailPanel from '../ReportDetailPanel';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const report = (over: Partial<IntelReportUI>): IntelReportUI => ({
  id: 'r-place', title: 'Placed', content: 'Seen.', author: '', category: 'GENERAL', tags: [],
  createdAt: new Date(), updatedAt: new Date(), status: 'DRAFT', ...over,
});
const show = (r: IntelReportUI) =>
  render(<ReportDetailPanel report={r} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);

describe('ReportDetailPanel: the place', () => {
  it('shows the point with how precisely it was given, and the jurisdictions named beside it', () => {
    show(report({ latitude: 40.7357, longitude: -74.1724, geoPrecisionM: 1000, jurisdictions: ['us', 'us-nj'] }));
    const location = screen.getByText(/^Location:/);
    expect(location.textContent).toMatch(/40\.7/);
    expect(location.textContent).toMatch(/1 km/);
    expect(screen.getByText(/^Jurisdictions:/).textContent).toMatch(/US, US-NJ/);
  });

  it('still shows jurisdictions alone as the subject when there is no point', () => {
    show(report({ jurisdictions: ['us-tx'] }));
    expect(screen.getByText(/^Subject:/).textContent).toMatch(/US-TX/);
    expect(screen.queryByText(/^Jurisdictions:/)).toBeNull();
  });

  it('says who a received report came from (plan item 2.4)', () => {
    show(report({ receivedFrom: { pubkey: 'c'.repeat(64), sentAt: '2026-09-27T14:00:00.000Z' } }));
    expect(screen.getByTestId('received-from').textContent).toMatch(/^From .+, 27 Sep 2026/);
  });
});
