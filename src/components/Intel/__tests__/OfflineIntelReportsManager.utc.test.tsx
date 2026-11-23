/**
 * The offline reports manager gives a report's time and when it was modified in
 * UTC, with the year and the local time on hover (decision D-E, settled 2026-09-14
 * for step 9). It printed the browser's local date and time with no zone.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { localTimeTitle } from '../../../utils/utcTime';

const reportAt = Date.UTC(2026, 8, 14, 19, 33);
const modifiedAt = Date.UTC(2026, 8, 14, 20, 5);

vi.mock('../../../services/OfflineIntelReportService', () => ({
  offlineIntelReportService: {
    getOfflineReports: async () => [{
      offlineId: 'off-1', id: 'r1', title: 'Relay fault', content: 'Seen from the ridge.', author: 'analyst',
      latitude: 40.7, longitude: -74, timestamp: reportAt, tags: [], status: 'pending', createdOffline: true,
      lastModified: modifiedAt, syncAttempts: 0,
    }],
    getSyncStats: async () => ({ totalOfflineReports: 1, pendingSync: 1, successfulSyncs: 0, failedSyncs: 0, conflicts: 0 }),
    getSyncSettings: async () => ({ autoSync: false, conflictResolution: 'ask', maxRetries: 3, retryDelay: 1000, batchSize: 5 }),
    on: () => () => {},
  },
}));

import { OfflineIntelReportsManager } from '../OfflineIntelReportsManager';

describe('OfflineIntelReportsManager: report times', () => {
  it('gives them in UTC, with the year and the local time on hover', async () => {
    render(<OfflineIntelReportsManager isOpen={true} onClose={() => {}} />);

    expect(await screen.findByText('14 Sep 2026 19:33Z')).toHaveAttribute('title', localTimeTitle(reportAt));
    expect(screen.getByText('14 Sep 2026 20:05Z')).toHaveAttribute('title', localTimeTitle(modifiedAt));
  });
});
