/**
 * Reports saved offline before plan item 0.11 are added to the workspace with
 * no wallet (plan item 4.4, the second condition the retirement audit set).
 * Sync writes to this device's reports and keeps each report's own author; the
 * manager still refused to start without a wallet, and spoke of a blockchain
 * nothing writes to.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';

const syncOfflineReports = vi.fn(async (..._args: unknown[]) => ({ totalOfflineReports: 1, pendingSync: 0, successfulSyncs: 1, failedSyncs: 0, conflicts: 0 }));
let empty = false;
vi.mock('../../../services/OfflineIntelReportService', () => ({
  offlineIntelReportService: {
    getOfflineReports: async () => empty ? [] : [{
      offlineId: 'off-1', id: 'r1', title: 'Relay fault', content: 'Seen from the ridge.', author: 'analyst',
      latitude: 40.7, longitude: -74, timestamp: Date.UTC(2026, 8, 14), tags: [], status: 'pending', createdOffline: true,
      lastModified: Date.UTC(2026, 8, 14), syncAttempts: 0,
    }, {
      offlineId: 'off-2', id: 'r2', title: 'Second sighting', content: 'Seen again.', author: 'analyst',
      latitude: 40.7, longitude: -74, timestamp: Date.UTC(2026, 8, 15), tags: [], status: 'conflict', createdOffline: true,
      lastModified: Date.UTC(2026, 8, 15), syncAttempts: 1, conflictData: { type: 'duplicate' },
    }, {
      offlineId: 'off-3', id: 'r3', title: 'Third sighting', content: 'Seen once more.', author: 'analyst',
      latitude: 40.7, longitude: -74, timestamp: Date.UTC(2026, 8, 16), tags: [], status: 'conflict', createdOffline: true,
      lastModified: Date.UTC(2026, 8, 16), syncAttempts: 1, conflictData: { type: 'content_mismatch' },
    }],
    getSyncStats: async () => ({ totalOfflineReports: 1, pendingSync: 1, successfulSyncs: 0, failedSyncs: 0, conflicts: 0 }),
    getSyncSettings: async () => ({ conflictResolution: 'ask', maxRetries: 3, retryDelay: 1000, batchSize: 5 }),
    syncOfflineReports: (...args: unknown[]) => syncOfflineReports(...args),
    on: () => () => {},
  },
}));

import { OfflineIntelReportsManager } from '../OfflineIntelReportsManager';

describe('OfflineIntelReportsManager without a wallet', () => {
  it('adds pending reports to your reports, asking for no wallet', async () => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<OfflineIntelReportsManager isOpen={true} onClose={() => {}} />);
    const add = await screen.findByRole('button', { name: 'Add all to my reports' });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    await waitFor(() => expect(syncOfflineReports).toHaveBeenCalledTimes(1));
    expect(syncOfflineReports).toHaveBeenCalledWith();
  });

  it('speaks of no wallet and no blockchain, and offers no auto-sync nothing performs', async () => {
    render(<OfflineIntelReportsManager isOpen={true} onClose={() => {}} />);
    await screen.findByRole('button', { name: 'Add all to my reports' });
    let text = document.body.textContent ?? '';
    // A conflict is with a report already here, not with a chain.
    expect(text).toContain('A similar report is already in your reports');
    expect(text).toContain('Differs from the one already in your reports');
    for (const tab of ['sync', 'settings']) {
      fireEvent.click(screen.getByRole('button', { name: tab }));
      text += document.body.textContent ?? '';
    }
    expect(text).not.toMatch(/wallet/i);
    expect(text).not.toMatch(/blockchain/i);
    expect(text).not.toMatch(/auto-sync/i);
  });

  it('says plainly why the list is empty: reports no longer wait offline', async () => {
    empty = true;
    try {
      render(<OfflineIntelReportsManager isOpen={true} onClose={() => {}} />);
      expect(await screen.findByText('Nothing is waiting here.')).toBeInTheDocument();
      expect(screen.getByText('Reports now save straight to your reports. Older ones saved offline would appear here.')).toBeInTheDocument();
      expect(screen.queryByText(/while offline and they'll appear here/)).toBeNull();
    } finally {
      empty = false;
    }
  });
});
