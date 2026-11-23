/**
 * A marketplace listing says when its report was written in UTC, with the year and
 * the local time on hover (decision D-E, settled 2026-09-14 for step 9). It printed
 * the browser's local date with no zone.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import MarketExchangeApplication from '../MarketExchangeApplication';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { localTimeTitle } from '../../../utils/utcTime';

// The desk's public-record feeds read their sources; here they hold nothing (OpportunityBoard's own tests read them).
vi.mock('../../../services/exchange/feeds/grantsGov', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/grantsGov')>()), readFundingWindows: async () => ({ windows: [], undated: 0, today: '2026-10-13' }) }));
vi.mock('../../../services/exchange/feeds/rewardProgrammes', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/rewardProgrammes')>()), readRewardProgrammes: async () => ({ programmes: [], failed: [] }) }));
vi.mock('../../../services/exchange/feeds/sanctionsChanges', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/sanctionsChanges')>()), readSanctionsChanges: async () => ({ publications: [], from: '2026-09-13', missing: [] }) }));
vi.mock('../../../services/exchange/feeds/healthExclusions', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/healthExclusions')>()), readHealthExclusions: async () => ({ months: [] }) }));
vi.mock('../../../services/exchange/PackageComposer', () => ({
  packageComposer: { composeZip: vi.fn() },
}));
vi.mock('../../../services/exchange/PublishAdapter', () => ({
  publishAdapter: { publish: vi.fn() },
}));

describe('MarketExchange: when a listing was written', () => {
  it('gives it in UTC, with the year and the local time on hover', async () => {
    const writtenAt = Date.UTC(2026, 8, 14, 19, 33);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(writtenAt);
    try {
      const published = await intelReportService.createReport({
        title: 'Published Findings', content: 'done', category: 'THREAT', tags: ['x'],
      }, 'MarketUser');
      await intelReportService.updateStatus(published.id, 'SUBMITTED');
    } finally {
      vi.useRealTimers();
    }

    render(<MarketExchangeApplication />);
    await screen.findByText(/Reading the desk/i);
    // The tabs render once loading ends, which under a busy suite is after the loading text shows.
    fireEvent.click(await screen.findByRole('tab', { name: /Publish a report/i }, { timeout: 5000 }));

    expect(await screen.findByText('14 Sep 2026 19:33Z')).toHaveAttribute('title', localTimeTitle(writtenAt));
  });
});
