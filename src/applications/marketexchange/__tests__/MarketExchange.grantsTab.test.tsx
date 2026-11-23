/**
 * Grants have a tab of their own (decision D-MF, MF5), and another app can open the Market Exchange on it, as
 * Missions does from its count of grant notices.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../../../services/exchange/feeds/grantsGov', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/grantsGov')>()), readFundingWindows: async () => ({ windows: [], undated: 0, today: '2026-10-13' }) }));
vi.mock('../../../services/exchange/feeds/rewardProgrammes', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/rewardProgrammes')>()), readRewardProgrammes: async () => ({ programmes: [], failed: [] }) }));
vi.mock('../../../services/exchange/feeds/sanctionsChanges', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/sanctionsChanges')>()), readSanctionsChanges: async () => ({ publications: [], from: '2026-09-13', missing: [] }) }));
vi.mock('../../../services/exchange/feeds/healthExclusions', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/healthExclusions')>()), readHealthExclusions: async () => ({ months: [] }) }));
vi.mock('../../../services/intel/useReceivedPackages', () => ({
  useReceivedPackages: () => ({ accepted: [], refused: [], counters: { seen: 0, accepted: 0, refused: 0, refusedBy: {} }, publishers: [] }),
}));
vi.mock('../../../services/exchange/PackageComposer', () => ({ packageComposer: { composeZip: vi.fn() } }));
vi.mock('../../../services/exchange/PublishAdapter', () => ({ publishAdapter: { publish: vi.fn() } }));

import MarketExchangeApplication from '../MarketExchangeApplication';

describe('MarketExchange: the Grants tab', () => {
  it('has three tabs, Grants between the desk and publishing', async () => {
    render(<MarketExchangeApplication />);
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Lead desk', 'Grants', 'Publish a report']);
    expect(screen.getByRole('tab', { name: /Lead desk/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /Grants/ }));
    expect(await screen.findByTestId('grants-summary')).toBeInTheDocument();
  });

  it('opens on Grants when another app hands it openTab: grants', async () => {
    render(<MarketExchangeApplication openTab="grants" />);
    expect(await screen.findByTestId('grants-summary')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Grants/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on the desk for anything else it is handed', async () => {
    render(<MarketExchangeApplication openTab="portfolio" />);
    expect(await screen.findByRole('tab', { name: /Lead desk/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('grants-summary')).toBeNull();
  });
});
