/**
 * Export Analysis on the globe follows the rule a report's own Export does
 * (plan item 9.13b, decision G8d). The globe draws your own reports too, so
 * this wrote a Private one out in the clear. A report someone published came
 * from a relay, and goes.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { IntelReportPopup } from '../IntelReportPopup';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';
import { intelWorkspaceManager } from '../../../../services/intel/IntelWorkspaceManager';

vi.mock('../../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));

const marker = (pubkey: string): IntelReportOverlayMarker => ({
  pubkey, title: 'Harbour master ledger', content: 'Body', tags: [], latitude: 10, longitude: 20, timestamp: Date.now(), author: 'analyst',
});

const localReport = (id: string, metadata: Record<string, unknown>) => ({
  id, title: 'Harbour master ledger', type: 'INTEL_REPORT', summary: '', content: 'Body', conclusions: [], recommendations: [],
  analysisType: 'OSINT', methodology: [], confidence: 0.6, sourceIntel: [], author: 'a', contributors: [],
  createdAt: '2026-09-26T11:00:00.000Z', modifiedAt: '2026-09-26T12:00:00.000Z', targetAudience: [], metadata,
});

let created: ReturnType<typeof vi.fn>;
beforeAll(async () => {
  await intelWorkspaceManager.ensureInitialized();
  await intelWorkspaceManager.addReport(localReport('intel-private-1', { visibility: 'private' }));
  await intelWorkspaceManager.addReport(localReport('intel-open-1', {}));
});
beforeEach(() => {
  created = vi.fn(() => 'blob:mock-url');
  Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
});

const popup = (m: IntelReportOverlayMarker) => render(
  <MemoryRouter><IntelReportPopup report={m} visible onClose={vi.fn()} /></MemoryRouter>,
);

describe('Export Analysis', () => {
  it('will not write out a Private report of yours, and says why', () => {
    popup(marker('intel-private-1'));
    fireEvent.click(screen.getByText(/Export Analysis/i));
    expect(screen.getByRole('alert').textContent).toMatch(/^This report is Private: it stays in this workspace.*Export all my work under Your key\.$/);
    expect(created).not.toHaveBeenCalled();
  });

  it("asks for an undecided report of yours to be decided on its page first", () => {
    popup(marker('intel-open-1'));
    fireEvent.click(screen.getByText(/Export Analysis/i));
    expect(screen.getByRole('alert').textContent).toBe('Nobody has chosen who may receive this report yet. Choose on its page first.');
    expect(created).not.toHaveBeenCalled();
  });

  it('writes out a report someone published, which is not a record of yours', () => {
    popup(marker('30023:abc:starcom-intel-1'));
    fireEvent.click(screen.getByText(/Export Analysis/i));
    expect(created).toHaveBeenCalledTimes(1);
  });
});
