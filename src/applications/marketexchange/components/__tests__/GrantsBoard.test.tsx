/**
 * The Market Exchange's Grants tab (decision D-MF, MF5): grants are not missions. Grants.gov's windows, the
 * soonest to close first, as a list or on the deadline strip (moved here from the lead desk, LD2), and the
 * grant notices received, on their window or listed after.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FundingWindow, FundingWindows } from '../../../../services/exchange/feeds/grantsGov';
import type { GrantNotice } from '../../../../services/exchange/grantNotices';

const feeds = vi.hoisted(() => ({ funding: vi.fn() }));
vi.mock('../../../../services/exchange/feeds/grantsGov', async (o) => ({ ...(await o<typeof import('../../../../services/exchange/feeds/grantsGov')>()), readFundingWindows: feeds.funding }));
const { addCase } = vi.hoisted(() => ({ addCase: vi.fn() }));
vi.mock('../../../../core/intel/adapters/caseManagerAdapter', () => ({ caseManagerAdapter: { addCase } }));
import GrantsBoard from '../GrantsBoard';
import { EnhancedApplicationRouterContext } from '../../../../context/EnhancedApplicationRouterContext';

const opening = (id: string, closes: string, over: Partial<FundingWindow> = {}): FundingWindow => ({
  id, number: `NSF-${id}`, title: `Opportunity ${id}`, agency: 'National Science Foundation', agencyCode: 'NSF', opens: '2026-09-01', closes,
  status: 'posted', categories: ['ST'], audiences: ['strategic_consultant', 'academic_researcher'], url: `https://www.grants.gov/search-results-detail/${id}`, ...over,
});
const funding = (windows: FundingWindow[], undated = 0): FundingWindows => ({ windows, undated, today: '2026-10-13' });
const SIGNER = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const notice = (title: string, over: Partial<GrantNotice> = {}): GrantNotice => ({
  key: `${SIGNER}:${title}`, title, mission: `Get ${title} funding to a local group that does this work.`, signer: SIGNER,
  steps: ['Read the eligibility text.', 'Find a local group that does this work, and get it to them.'], ...over,
});

async function grants(notices: GrantNotice[] = []) {
  render(<GrantsBoard notices={notices} />);
  await waitFor(() => expect(screen.getByTestId('grants-summary')).not.toHaveTextContent(/reading/i));
}
const rows = () => screen.getAllByTestId('lead-row');
const detail = () => screen.getByTestId('lead-detail');

beforeEach(() => {
  // Out of closing order, the latest opened first: the board orders them by when they close.
  feeds.funding.mockReset().mockResolvedValue(funding([opening('3', '2026-11-13', { opens: '2026-10-01' }), opening('2', '2026-11-12', { opens: '2026-09-20' }), opening('1', '2026-10-13')], 26));
});

describe('the Grants tab', () => {
  it('says what Grants.gov holds, and names it when it did not answer', async () => {
    await grants();
    expect(screen.getByTestId('grants-summary')).toHaveTextContent('Grants.gov: 3 open, 2 close within 30 days');
    feeds.funding.mockRejectedValue(new Error('503'));
    render(<GrantsBoard notices={[]} />);
    expect(await screen.findByText('Grants.gov did not answer.')).toBeInTheDocument();
  });

  it('lists the windows, the soonest to close first', async () => {
    await grants();
    expect(rows()[0]).toHaveTextContent('Closes 13 Oct 2026 (today)');
    expect(rows()[1]).toHaveTextContent('Closes 12 Nov 2026 (in 30 days)');
  });

  it("shows a window's closing date, opening, agency, number and audiences", async () => {
    await grants();
    fireEvent.click(rows()[0]);
    expect(within(detail()).getByTestId('lead-record')).toHaveTextContent('Closes 13 Oct 2026 (today) · opened 1 Sep 2026 · National Science Foundation · NSF-1');
    expect(within(detail()).getByRole('link', { name: 'Opportunity 1' })).toHaveAttribute('href', 'https://www.grants.gov/search-results-detail/1');
    expect(within(detail()).getByText('Academic research')).toBeInTheDocument();
  });

  it('lists a hundred, then offers the rest', async () => {
    feeds.funding.mockResolvedValue(funding(Array.from({ length: 110 }, (_, i) => opening(String(i), '2026-12-01'))));
    await grants();
    expect(rows()).toHaveLength(100);
    fireEvent.click(screen.getByRole('button', { name: 'Show 10 more of 10' }));
    expect(rows()).toHaveLength(110);
  });

  it('starts a case from a window where the router can open Cases', async () => {
    addCase.mockReset().mockResolvedValue('case-9');
    const navigateToApp = vi.fn();
    render(
      <EnhancedApplicationRouterContext.Provider value={{ navigateToApp } as never}>
        <GrantsBoard notices={[]} />
      </EnhancedApplicationRouterContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId('grants-summary')).not.toHaveTextContent(/reading/i));
    fireEvent.click(screen.getByTestId('lead-start-case'));
    await waitFor(() => expect(navigateToApp).toHaveBeenCalledWith('cases', undefined, { selectCaseId: 'case-9' }));
  });
});

describe('the grant notices received', () => {
  const NOTICES = [notice('Opportunity 2'), notice('Strengthening Ghana Health Service laboratory services', { closes: '2026-10-26' })];

  it('counts them, and how many meet a window here', async () => {
    await grants(NOTICES);
    expect(screen.getByTestId('grants-summary')).toHaveTextContent('Notices received: 2, 1 on these windows');
  });

  it('marks the window a notice meets, and gives what it asks of people in its detail', async () => {
    await grants(NOTICES);
    const marked = rows().filter((r) => within(r).queryByTestId('grant-notice-mark'));
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent('Opportunity 2');
    fireEvent.click(marked[0]);
    const asked = within(detail().parentElement!).getByTestId('grant-notice');
    expect(asked).toHaveTextContent('Get Opportunity 2 funding to a local group that does this work.');
    expect(within(asked).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Read the eligibility text.', 'Find a local group that does this work, and get it to them.']);
    expect(within(asked).getByTestId('key-name')).toBeInTheDocument();
  });

  it('lists a notice no window here meets after the windows, with its closing date', async () => {
    await grants(NOTICES);
    const more = screen.getByTestId('grant-notices-unmatched');
    expect(more).toHaveTextContent('More notices: 1 outside the categories read here');
    expect(within(more).getByTestId('grant-notice-row')).toHaveTextContent('Strengthening Ghana Health Service laboratory services');
    expect(within(more).getByTestId('grant-notice-row')).toHaveTextContent('Closes 26 Oct 2026 (in 13 days)');
  });

  it('names no publisher of its own', async () => {
    await grants(NOTICES);
    expect(document.body.textContent).not.toMatch(/Mecha Jono/);
  });
});

describe('the deadline timeline (LD2, moved here)', () => {
  it('puts each window on the strip and groups them by when they close', async () => {
    await grants();
    fireEvent.click(screen.getByRole('button', { name: 'Deadlines' }));
    const timeline = screen.getByTestId('lead-timeline');
    // 13 Oct (today), 12 Nov (30 days) and 13 Nov (31 days): all within ninety days.
    expect(within(timeline).getAllByTestId('timeline-dot')).toHaveLength(3);
    expect(within(timeline).getAllByTestId('timeline-group').map((g) => g.querySelector('h3')?.textContent)).toEqual(['Closes within a week (1)', 'Within 90 days (2)']);
    expect(timeline).toHaveTextContent('3 leads state a closing date.');
  });

  it('opens on the soonest to close', async () => {
    await grants();
    fireEvent.click(screen.getByRole('button', { name: 'Deadlines' }));
    expect(within(detail()).getByRole('link', { name: 'Opportunity 1' })).toBeInTheDocument();
  });

  it('chooses a window from its dot', async () => {
    await grants();
    fireEvent.click(screen.getByRole('button', { name: 'Deadlines' }));
    fireEvent.click(screen.getByRole('button', { name: 'Opportunity 3, closes 13 Nov 2026' }));
    expect(within(detail()).getByRole('link', { name: 'Opportunity 3' })).toBeInTheDocument();
  });

  it('greys what has closed and counts what closes after ninety days', async () => {
    feeds.funding.mockResolvedValue(funding([opening('old', '2026-10-01'), opening('far', '2027-06-01'), opening('soon', '2026-10-20')]));
    await grants();
    fireEvent.click(screen.getByRole('button', { name: 'Deadlines' }));
    const timeline = screen.getByTestId('lead-timeline');
    expect(within(timeline).getAllByTestId('timeline-dot')).toHaveLength(1);
    expect(timeline).toHaveTextContent('3 leads state a closing date; 1 close after 90 days; 1 closed.');
    const closed = within(timeline).getAllByTestId('timeline-group').find((g) => g.textContent?.startsWith('Closed'))!;
    expect(closed).toHaveStyle({ opacity: '0.55' });
  });
});
