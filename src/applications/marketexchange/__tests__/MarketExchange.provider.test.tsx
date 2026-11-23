import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import MarketExchangeApplication from '../MarketExchangeApplication';
import PublishReviewRoot from '../../../components/Publishing/PublishReviewRoot';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { packageComposer } from '../../../services/exchange/PackageComposer';

// Mock publishAdapter & packageComposer to avoid heavy work
// The desk's public-record feeds read their sources; here they hold nothing (OpportunityBoard's own tests read them).
vi.mock('../../../services/exchange/feeds/grantsGov', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/grantsGov')>()), readFundingWindows: async () => ({ windows: [], undated: 0, today: '2026-10-13' }) }));
vi.mock('../../../services/exchange/feeds/rewardProgrammes', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/rewardProgrammes')>()), readRewardProgrammes: async () => ({ programmes: [], failed: [] }) }));
vi.mock('../../../services/exchange/feeds/sanctionsChanges', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/sanctionsChanges')>()), readSanctionsChanges: async () => ({ publications: [], from: '2026-09-13', missing: [] }) }));
vi.mock('../../../services/exchange/feeds/healthExclusions', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/healthExclusions')>()), readHealthExclusions: async () => ({ months: [] }) }));
vi.mock('../../../services/exchange/PackageComposer', () => ({
  packageComposer: {
    // Carries the draft's distribution, as the real composer does.
    composeZip: vi.fn(async (input: { visibility?: string }) => ({ manifest: { id: 'm1', assets: [], visibility: input.visibility }, blob: new Blob(['zip']) })),
  }
}));
vi.mock('../../../services/exchange/PublishAdapter', () => ({
  // No relay took the announcement: the case that used to show a green "Package published" (plan item 9.3).
  publishAdapter: { publish: vi.fn().mockResolvedValue({ id: 'pub1', url: 'ipfs://pub1', nostrPublished: false, nostrError: 'no relays reachable' }) }
}));

describe('MarketExchange provider integration', () => {
  it('composes using latest intelReportService report when clicking compose button', async () => {
    // Seed two reports
    const r1 = await intelReportService.createReport({
      title: 'ME Draft 1', content: 'Content A', category: 'GENERAL', tags: ['me'], visibility: 'public'
    }, 'MarketUser');
    await new Promise(r => setTimeout(r, 5)); // ensure updatedAt ordering difference
    const r2 = await intelReportService.createReport({
      title: 'ME Draft 2', content: 'Content B', category: 'THREAT', tags: ['me','b'], visibility: 'public'
    }, 'MarketUser');

    render(<><MarketExchangeApplication /><PublishReviewRoot /></>);

  // Wait for loading to finish
  await screen.findByText(/Reading the desk/i);
  // Advance timers if any simulated delay (not using fake timers here; just wait)
  await new Promise(r => setTimeout(r, 1100));
  // Switch to the Publish a report tab (second tab), formerly Intelligence Marketplace
  const marketplaceTab = screen.getByRole('tab', { name: /Publish a report/i });
  fireEvent.click(marketplaceTab);
  const btn = await screen.findByRole('button', { name: /Compose & Publish Current Draft/i });
  expect(btn.getAttribute('disabled')).toBe(null);
    fireEvent.click(btn);
    // Plan item 0.1: reviewed first, then confirmed.
    const confirm = await screen.findByTestId('publish-review-confirm');
    const understand = screen.queryByRole('checkbox', { name: 'I understand' });
    if (understand) fireEvent.click(understand);
    fireEvent.click(confirm);

    const outcome = await screen.findByTestId('compose-outcome');
    expect(outcome.textContent).toMatch(/^Not published: no relay took the announcement \(no relays reachable\)\./);
    expect(outcome.textContent).toContain('stored on IPFS at ipfs://pub1, where anyone holding that address can read it');
    expect(outcome.className).not.toMatch(/Success/);
  });

  it('renders only real, non-draft reports in the Publish a report tab (Phase 3 de-fake pass)', async () => {
    const draft = await intelReportService.createReport({
      title: 'Still Drafting', content: 'wip', category: 'GENERAL', tags: []
    }, 'MarketUser');
    const published = await intelReportService.createReport({
      title: 'Published Findings', content: 'done', category: 'THREAT', tags: ['x']
    }, 'MarketUser');
    await intelReportService.updateStatus(published.id, 'SUBMITTED');

    render(<MarketExchangeApplication />);
    await screen.findByText(/Reading the desk/i);

    const marketplaceTab = screen.getByRole('tab', { name: /Publish a report/i });
    fireEvent.click(marketplaceTab);

    await waitFor(() => {
      expect(screen.getByText('Published Findings')).toBeTruthy();
    });
    // Its distribution as the one chip every screen draws (BD18), Undecided
    // included: the Exchange takes only a Public report, so the card says so.
    const card = screen.getByText('Published Findings').closest('.MuiCard-root') as HTMLElement;
    expect(within(card).getByTestId('distribution-chip').getAttribute('data-distribution')).toBe('undecided');
    // Draft reports show up in the live drafts panel, not as marketplace listing cards —
    // and never with fabricated price/seller/rating fields (removed entirely in Phase 3).
    expect(screen.queryByText(/Purchase/i)).toBeNull();
    expect(screen.queryByText(/\$\d/)).toBeNull();
    void draft;
  });

  it('publishes the draft chosen, says which, and never a report that is not a draft', async () => {
    // Critique audit of 2026-10-01: it read ?draft=, which nothing sets, then took the
    // newest report of any kind, which can be a network report somebody else wrote.
    const chosen = await intelReportService.createReport({ title: 'ME Chosen Older', content: 'a', category: 'GENERAL', tags: [], visibility: 'public' }, 'MarketUser');
    await new Promise(r => setTimeout(r, 5));
    await intelReportService.createReport({ title: 'ME Newest Draft', content: 'b', category: 'GENERAL', tags: [], visibility: 'public' }, 'MarketUser');
    await new Promise(r => setTimeout(r, 5));
    const notADraft = await intelReportService.createReport({ title: 'ME Someone Else', content: 'c', category: 'GENERAL', tags: [] }, 'Peer');
    await intelReportService.updateStatus(notADraft.id, 'SUBMITTED');

    render(<><MarketExchangeApplication /><PublishReviewRoot /></>);
    await screen.findByText(/Reading the desk/i);
    fireEvent.click(screen.getByRole('tab', { name: /Publish a report/i }));

    expect(await screen.findByTestId('marketexchange-publishes')).toHaveTextContent('Publishes: ME Newest Draft');
    fireEvent.click(screen.getByRole('button', { name: 'ME Chosen Older' }));
    expect(screen.getByTestId('marketexchange-publishes')).toHaveTextContent('Publishes: ME Chosen Older');

    fireEvent.click(screen.getByRole('button', { name: /Compose & Publish Current Draft/i }));
    await waitFor(() => expect(vi.mocked(packageComposer.composeZip)).toHaveBeenCalled());
    const input = vi.mocked(packageComposer.composeZip).mock.calls.at(-1)![0] as { name: string; reports: Array<{ id: string }> };
    expect(input.name).toBe('ME Chosen Older');
    expect(input.reports[0].id).toBe(chosen.id);
  });
});
