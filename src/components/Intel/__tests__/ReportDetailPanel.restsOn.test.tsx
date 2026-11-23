/**
 * A report's detail says what it rests on (D-MX: MX3, MX19, MX23): each
 * observation it cites, as read here.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const lookUpCited = vi.hoisted(() => vi.fn());
vi.mock('../../../services/intel/observations/citedObservations', () => ({ lookUpCited }));

import ReportDetailPanel from '../ReportDetailPanel';

const A = 'a'.repeat(64);
const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'Report', content: 'Body', author: 'a', category: 'GENERAL', tags: [],
  createdAt: new Date(Date.UTC(2026, 8, 14, 9, 5)), updatedAt: new Date(Date.UTC(2026, 8, 14, 9, 30)),
  status: 'DRAFT', collaborators: [], ...over,
});
const renderPanel = (r: IntelReportUI) =>
  render(<ReportDetailPanel report={r} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);

describe('ReportDetailPanel: what it rests on', () => {
  it('lists each observation the report cites', async () => {
    lookUpCited.mockResolvedValue(new Map([[A, {
      eventId: A, operator: 'b'.repeat(64), operatorLabel: 'Kestrel · npub1abc…xyz', anchor: 'anchor-one',
      seen: ['alpha_one'], method: 'saw', observedAt: '2026-09-01T12:00:00.000Z', lat: 38.6, lon: -90.2, precisionM: 18_000,
    }]]));
    renderPanel(report({ cites: [{ eventId: A }] }));
    expect(screen.getByRole('heading', { name: 'Rests on' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('cited-observation').textContent).toContain('alpha one'));
  });

  it('has no such section for a report that cites nothing', () => {
    renderPanel(report());
    expect(screen.queryByRole('heading', { name: 'Rests on' })).toBeNull();
    expect(screen.queryByTestId('rests-on')).toBeNull();
  });
});
