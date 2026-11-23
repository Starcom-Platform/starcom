/**
 * What the board shows, and the one thing it must never show.
 *
 * The Intelligence Market Exchange is a free index of work that may carry a
 * reward. Its whole credibility rests on a distinction that is easy to state
 * and easy to lose: a figure OBSERVED in a record is a fact about the record,
 * and a figure attached to a STATUTE would be a promise about what a reader
 * receives. This node makes the first kind of statement and never the second.
 *
 * So the load-bearing test here is a negative one — no amount in the statute
 * block, ever — and it is written against the rendered output rather than the
 * data, because the rule is about what a person is told.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import OpportunityBoard from '../components/OpportunityBoard';

// The feeds hold nothing here: leadDesk.feeds.test.tsx reads them. These are the report leads and the board's rules.
vi.mock('../../../services/exchange/feeds/grantsGov', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/grantsGov')>()), readFundingWindows: async () => ({ windows: [], undated: 0, today: '2026-10-13' }) }));
vi.mock('../../../services/exchange/feeds/rewardProgrammes', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/rewardProgrammes')>()), readRewardProgrammes: async () => ({ programmes: [], failed: [] }) }));
vi.mock('../../../services/exchange/feeds/sanctionsChanges', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/sanctionsChanges')>()), readSanctionsChanges: async () => ({ publications: [], from: '2026-09-13', missing: [] }) }));
vi.mock('../../../services/exchange/feeds/healthExclusions', async (o) => ({ ...(await o<typeof import('../../../services/exchange/feeds/healthExclusions')>()), readHealthExclusions: async () => ({ months: [] }) }));
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const report = (over: Partial<IntelReportUI>): IntelReportUI => ({
  id: `r-${Math.random().toString(36).slice(2, 8)}`,
  title: 'A record',
  content: '',
  author: 'Starcom',
  category: 'general',
  tags: [],
  createdAt: new Date('2026-09-23T00:00:00Z'),
  updatedAt: new Date('2026-09-23T00:00:00Z'),
  status: 'PUBLISHED',
  ...over,
} as IntelReportUI);

/** The shapes actually arriving on the relays on 2026-09-23. */
const LIVE = [
  report({
    id: 'r-exclusion',
    title: 'Dubai Enterprises Co was paid $25,242 across 1 federal award(s) while carrying a Reciprocal exclusion',
  }),
  report({
    id: 'r-charity',
    title: '7 charities in Brooklyn Park, MN lost their 501(c)(3) exemption in the last 18 months',
  }),
  report({ id: 'r-weather', title: 'Fog over the channel' }),
];

/** The board, its feeds read; the lead whose title holds `title` chosen. */
async function desk(reports: IntelReportUI[], title?: RegExp) {
  render(<OpportunityBoard reports={reports} />);
  await waitFor(() => expect(screen.getByTestId('board-summary')).not.toHaveTextContent(/reading/i));
  if (title) fireEvent.click(screen.getAllByTestId('lead-row').find((r) => title.test(r.textContent ?? ''))!);
}

describe('the lead desk: report leads and the board\'s rules', () => {
  it('routes the reward-bearing record and names its statute and decider', async () => {
    await desk(LIVE, /Dubai/);
    expect(within(screen.getByTestId('lead-detail')).getByText(/False Claims Act/)).toBeTruthy();
    expect(screen.getByTestId('statute')).toHaveTextContent(/decided by the U\.S\. Department of Justice and the court/);
  });

  it("leads every row with what it may pay, and the detail with the programme's own words, linked, whose call it is (C12, CR2)", async () => {
    await desk(LIVE, /Dubai/);
    const rows = screen.getAllByTestId('lead-row');
    for (const row of rows) {
      const pay = within(row).getByTestId('lead-pay');
      // Under the title, before when and where from.
      expect(row.textContent!.indexOf(pay.textContent!)).toBeLessThan(row.textContent!.indexOf(' · '));
    }
    const dubai = rows.find((r) => /Dubai/.test(r.textContent ?? ''))!;
    expect(within(dubai).getByTestId('lead-pay')).toHaveTextContent('“Private citizens who successfully bring qui tam actions may receive a portion of the government’s recovery.” (U.S. Department of Justice)');
    const block = screen.getByTestId('lead-pay-detail');
    expect(within(block).getByRole('link', { name: "Read it on the U.S. Department of Justice's page" })).toHaveAttribute('href', 'https://www.justice.gov/civil/false-claims-act');
    expect(block).toHaveTextContent('The programme decides whether anything is paid, and how much. Starcom promises nothing, and this is not legal advice.');
    expect(block.textContent).not.toMatch(/\$|\d+\s*%|percent/i);
  });

  it("names who published a report by its key's own name, never a raw key (D-MF, MF4)", async () => {
    await desk([{ ...LIVE[0], author: 'a'.repeat(64) } as IntelReportUI]);
    for (const row of screen.getAllByTestId('lead-row')) expect(row.textContent).not.toMatch(/[0-9a-f]{64}/);
    expect(within(screen.getAllByTestId('lead-row')[0]).getByTestId('key-name')).toHaveTextContent(/^npub1/);
  });

  it('states no amount anywhere in a statute block', async () => {
    // THE rule. A currency figure or a percentage inside the statute callout
    // would make this node the one promising a payout.
    await desk(LIVE, /Dubai/);
    for (const block of screen.getAllByTestId('statute')) {
      expect(block.textContent ?? '').not.toMatch(/\$|\bUSD\b|\d+\s*%|percent/i);
    }
  });

  it('still shows a figure the record itself observed', async () => {
    // "$25,242" is what the award says. Hiding it would make the board useless
    // to the person deciding whether the lead is worth their afternoon.
    await desk(LIVE);
    expect(screen.getAllByText(/\$25,242/).length).toBeGreaterThan(0);
  });

  it('marks the words that routed it, and says when it is dated, who published it, where it is about, and where to read it', async () => {
    await desk([{ ...LIVE[0], jurisdictions: ['ae'] } as IntelReportUI], /Dubai/);
    expect(screen.getByTestId('matched-phrase')).toHaveTextContent('Reciprocal exclusion');
    expect(screen.getByTestId('lead-record')).toHaveTextContent(/Dated 23 Sep 2026 00:00Z · published by Starcom · about AE/);
    expect(within(screen.getByTestId('lead-detail')).getByRole('link', { name: /Dubai Enterprises/ })).toHaveAttribute('href', '/intel?reportId=r-exclusion');
  });

  it('does not call a lapsed exemption a fraud matter', async () => {
    await desk([LIVE[1]]);
    expect(screen.queryByTestId('statute')).toBeNull();
    expect(screen.getByText(/Exempt status recorded as revoked/)).toBeTruthy();
  });

  it('says the routing is its own inference, not the publisher\'s word', async () => {
    await desk([LIVE[0]]);
    expect(screen.getByTestId('routing-basis').textContent).toMatch(/worked out here/i);
  });

  it('credits the publisher when they declared the audience', async () => {
    await desk([report({ id: 'r-declared', title: 'A tip worth following', tags: ['audience:journalist'] })]);
    // Exactly: "worked out here …, not stated by the publisher" holds the same words.
    expect(screen.getByTestId('routing-basis').textContent).toBe('Audience stated by the publisher.');
  });

  it('drops a record that routes nowhere rather than filing it under something', async () => {
    await desk(LIVE);
    expect(screen.queryByText(/Fog over the channel/)).toBeNull();
    expect(screen.getByTestId('board-summary-reports')).toHaveTextContent('Reports: 2 of 3 offered to an audience');
  });

  it('offers only filters that something reaches', async () => {
    // A filter naming an archetype no record matches is a dead control.
    await desk([LIVE[1]]);
    expect(screen.queryByRole('button', { name: /Qui tam/i })).toBeNull();
    expect(screen.getByRole('button', { name: /Journalism/i })).toBeTruthy();
  });

  it('filters by several audiences at once, and back to all (LD1)', async () => {
    await desk(LIVE);
    expect(screen.getAllByTestId('lead-row')).toHaveLength(2);
    // The filter's own buttons: a row whose pay line quotes DOJ on qui tam actions is a button too.
    const filters = () => within(screen.getByRole('group', { name: 'Filter by who the work is offered to' }));
    fireEvent.click(filters().getByRole('button', { name: /Qui tam/i }));
    expect(screen.getAllByTestId('lead-row').map((r) => r.textContent)).toEqual([expect.stringMatching(/Dubai/)]);
    fireEvent.click(filters().getByRole('button', { name: /Journalism/i }));
    expect(screen.getAllByTestId('lead-row')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'All (2)' }));
    expect(screen.getAllByTestId('lead-row')).toHaveLength(2);
  });

  // Still what has arrived, not what exists, in the house style's words (plan item 3.1).
  it('says no leads have arrived yet, not that none exist, when nothing routes', async () => {
    await desk([LIVE[2]]);
    expect(screen.getByTestId('board-empty').textContent).toBe('No leads yet. They appear as reports and feeds arrive.');
  });

  it('puts the summary line above the filters, and no marketplace words anywhere', async () => {
    await desk(LIVE);
    const summary = screen.getByTestId('board-summary');
    const filter = screen.getByRole('group', { name: 'Filter by who the work is offered to' });
    expect(summary.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Listing|Market Data|Buy|Price/);
  });
});
