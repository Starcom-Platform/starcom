/**
 * The lead desk's public-record feeds (decisions D-BF and D-LD, LD1): each feed item a lead in the one
 * list, a summary line of what each source holds, the chosen lead's detail beside the list. A source
 * that does not answer is named; no amount is attached to any programme, and no person is named.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FundingWindow, FundingWindows } from '../../../../services/exchange/feeds/grantsGov';
import type { RewardProgramme } from '../../../../services/exchange/feeds/rewardProgrammes';
import type { SanctionsChanges, SanctionsPublication } from '../../../../services/exchange/feeds/sanctionsChanges';
import type { ExclusionMonth } from '../../../../services/exchange/feeds/healthExclusions';

const feeds = vi.hoisted(() => ({ funding: vi.fn(), rewards: vi.fn(), sanctions: vi.fn(), exclusions: vi.fn() }));
vi.mock('../../../../services/exchange/feeds/grantsGov', async (o) => ({ ...(await o<typeof import('../../../../services/exchange/feeds/grantsGov')>()), readFundingWindows: feeds.funding }));
vi.mock('../../../../services/exchange/feeds/rewardProgrammes', async (o) => ({ ...(await o<typeof import('../../../../services/exchange/feeds/rewardProgrammes')>()), readRewardProgrammes: feeds.rewards }));
vi.mock('../../../../services/exchange/feeds/sanctionsChanges', async (o) => ({ ...(await o<typeof import('../../../../services/exchange/feeds/sanctionsChanges')>()), readSanctionsChanges: feeds.sanctions }));
vi.mock('../../../../services/exchange/feeds/healthExclusions', async (o) => ({ ...(await o<typeof import('../../../../services/exchange/feeds/healthExclusions')>()), readHealthExclusions: feeds.exclusions }));
import OpportunityBoard from '../OpportunityBoard';
import { EnhancedApplicationRouterContext } from '../../../../context/EnhancedApplicationRouterContext';
const { addCase } = vi.hoisted(() => ({ addCase: vi.fn() }));
vi.mock('../../../../core/intel/adapters/caseManagerAdapter', () => ({ caseManagerAdapter: { addCase } }));

const opening = (id: string, closes: string, over: Partial<FundingWindow> = {}): FundingWindow => ({
  id, number: `NSF-${id}`, title: `Opportunity ${id}`, agency: 'National Science Foundation', agencyCode: 'NSF', opens: '2026-09-01', closes,
  status: 'posted', categories: ['ST'], audiences: ['strategic_consultant', 'academic_researcher'], url: `https://www.grants.gov/search-results-detail/${id}`, ...over,
});
const funding = (windows: FundingWindow[], undated = 0): FundingWindows => ({ windows, undated, today: '2026-10-13' });
const programme = (over: Partial<RewardProgramme> = {}): RewardProgramme => ({
  id: 'rfj', name: 'Rewards for Justice', paysFor: 'Information on terrorism.', basis: '22 U.S.C. §2708 (the 1984 Act to Combat International Terrorism)',
  decidedBy: 'the U.S. Secretary of State', reference: 'https://rewardsforjustice.net/about/program-overview/',
  tip: { label: 'Rewards for Justice: Signal, Telegram or Tor', url: 'https://rewardsforjustice.net/' }, total: 272,
  kinds: [{ key: 'terrorism-financing', label: 'Terrorism financing', count: 41 }], leftOut: 'Hostage and kidnapping cases are not counted here.',
  audiences: ['reward_hunter', 'sanctions_researcher'], ...over,
});
const tally = (entities = 0, individuals = 0, vessels = 0) => ({ entities, individuals, vessels, aircraft: 0, other: 0 });
const pub = (id: number, date: string, over: Partial<SanctionsPublication> = {}): SanctionsPublication & { via: 'record' | 'file' } => ({
  id, date, kind: 'Standard Action', added: tally(11, 4), removed: tally(0, 0, 2), amended: 1,
  programmes: [{ code: 'ILLICIT-DRUGS-EO14059', added: 15, removed: 0 }, { code: 'LIBYA3', added: 0, removed: 2 }],
  named: [{ action: 'add', type: 'Entity', name: 'EXAMPLE LOGISTICS', countries: ['Mexico'], programmes: ['SDGT'] }, { action: 'remove', type: 'Vessel', name: 'EXAMPLE STAR', countries: [], programmes: ['LIBYA3'] }],
  via: 'file', ...over,
});
const sanctions = (publications: SanctionsChanges['publications'], missing: number[] = []): SanctionsChanges => ({ publications, from: '2026-09-13', missing });
const month = (m: string, over: Partial<ExclusionMonth> = {}): ExclusionMonth & { via: 'record' | 'file' } => ({
  month: m, exclusions: 145, reinstatements: 53, people: 136, practicesCounted: 2,
  byState: { FL: 28, OH: 13, CA: 11, MN: 7, NC: 6, TX: 5, NY: 4, GA: 3, PA: 2, AZ: 2, NV: 1, WA: 1 },
  byCategory: { 'IND- LIC HC SERV PRO': 86, 'DME COMPANY': 2 }, byBasis: { '1128b4': 87, '1128a1': 40, 'BRCH SA': 1 },
  organisations: [{ name: 'EXAMPLE SUPPLY, LLC', state: 'NC', category: 'DME COMPANY', basis: '1128a1', date: '2026-10-20' }],
  via: 'file', ...over,
});

async function desk() {
  render(<OpportunityBoard reports={[]} />);
  await waitFor(() => expect(screen.getByTestId('board-summary')).not.toHaveTextContent(/reading/i));
}
const choose = (kind: string, n = 0) => fireEvent.click(screen.getAllByTestId('lead-row').filter((r) => r.dataset.kind === kind)[n]);
const detail = () => screen.getByTestId('lead-detail');

beforeEach(() => {
  feeds.funding.mockReset().mockResolvedValue(funding([opening('1', '2026-10-13'), opening('2', '2026-11-12'), opening('3', '2026-11-13')], 26));
  feeds.rewards.mockReset().mockResolvedValue({ programmes: [programme(), programme({ id: 'fbi', name: 'FBI rewards', basis: undefined, decidedBy: 'the FBI', total: 1063, audiences: ['reward_hunter', 'recovery_agent'] })], failed: [] });
  feeds.sanctions.mockReset().mockResolvedValue(sanctions([pub(1049, '2026-10-13', { via: 'record' })], [1047]));
  feeds.exclusions.mockReset().mockResolvedValue({ months: [month('2026-09', { via: 'record' })] });
});

describe('the summary line (LD1)', () => {
  it('says what each source holds', async () => {
    await desk();
    // Grants have a tab of their own (D-MF, MF5): the desk says nothing of them.
    expect(screen.queryByTestId('board-summary-funding')).toBeNull();
    expect(screen.getByTestId('board-summary-rewards')).toHaveTextContent('Reward programmes: 2, 1,335 notices open');
    expect(screen.getByTestId('board-summary-sanctions')).toHaveTextContent('Sanctions: 1 OFAC publications in 30 days');
    expect(screen.getByTestId('board-summary-exclusions')).toHaveTextContent('HHS-OIG exclusions: Sep 2026, 145 excluded');
  });

  it('names a source that did not answer', async () => {
    feeds.rewards.mockResolvedValue({ programmes: [programme()], failed: ['FBI'] });
    feeds.sanctions.mockResolvedValue(sanctions([]));
    feeds.exclusions.mockResolvedValue({ months: [] });
    await desk();
    expect(screen.getByTestId('board-summary-rewards')).toHaveTextContent('(FBI did not answer)');
    expect(screen.getByTestId('board-summary-sanctions')).toHaveTextContent("OFAC's changes did not load.");
    expect(screen.getByTestId('board-summary-exclusions')).toHaveTextContent('did not load.');
  });
});

describe('feed items as leads', () => {
  it('lists every item once, newest first, standing programmes after', async () => {
    await desk();
    expect(screen.getAllByTestId('lead-row').map((r) => r.dataset.kind)).toEqual(['sanctions', 'exclusions', 'reward', 'reward']);
  });

  it("shows a reward programme's law, decider, tip line and kinds, and no amount", async () => {
    await desk();
    choose('reward', 1);
    expect(within(detail()).getByTestId('reward-basis')).toHaveTextContent('22 U.S.C. §2708 (the 1984 Act to Combat International Terrorism); decided by the U.S. Secretary of State.');
    expect(within(detail()).getByRole('link', { name: 'Rewards for Justice: Signal, Telegram or Tor' })).toHaveAttribute('href', 'https://rewardsforjustice.net/');
    expect(within(detail()).getByTestId('reward-kind')).toHaveTextContent('Terrorism financing: 41');
    expect(detail()).toHaveTextContent('272 notices open. Hostage and kidnapping cases are not counted here.');
    expect(detail().textContent).not.toMatch(/\$/);
  });

  it("shows a sanctions publication's tally, programmes and named organisations, people counted", async () => {
    await desk();
    choose('sanctions');
    expect(within(detail()).getByRole('link', { name: 'OFAC, 13 Oct 2026 · Standard Action' }).getAttribute('href')).toBe('https://ofac.treasury.gov/recent-actions/20261013');
    expect(within(detail()).getByTestId('sanctions-tally')).toHaveTextContent('Added: 11 entities, 4 people. Removed: 2 vessels. Amended: 1 existing entry');
    expect(within(detail()).getByTestId('sanctions-programmes')).toHaveTextContent('ILLICIT-DRUGS-EO14059 +15 · LIBYA3 −2');
    expect(within(detail()).getAllByTestId('sanctions-named').map((li) => li.textContent)).toEqual(['Added: EXAMPLE LOGISTICS (entity, Mexico)', 'Removed: EXAMPLE STAR (vessel)']);
    expect(detail()).toHaveTextContent('People are counted, never named.');
    expect(detail()).toHaveTextContent('Posted by Mecha Jono.');
  });

  it("shows a month of exclusions in OIG's words, organisations named, people counted", async () => {
    await desk();
    choose('exclusions');
    expect(within(detail()).getByTestId('exclusion-counts')).toHaveTextContent('145 excluded (136 people, 9 businesses); 53 reinstated.');
    expect(within(detail()).getByTestId('exclusion-bases')).toHaveTextContent('§1128(b)(4): License revocation, suspension, or surrender: 87; §1128(a)(1): Conviction of program-related crimes: 40; OIG code BRCH SA: 1.');
    expect(within(detail()).getByTestId('exclusion-states')).toHaveTextContent('By state: FL: 28, OH: 13, CA: 11, MN: 7, NC: 6, TX: 5, NY: 4, GA: 3, AZ: 2, PA: 2, and 2 more.');
    expect(within(detail()).getByTestId('exclusion-organisation')).toHaveTextContent('EXAMPLE SUPPLY, LLC (NC, dme company): §1128(a)(1): Conviction of program-related crimes, effective 20 Oct 2026');
    expect(detail()).toHaveTextContent("2 professional practices under their owner's name counted, not named.");
    expect(within(detail()).getByRole('link', { name: 'search the LEIE' })).toHaveAttribute('href', 'https://exclusions.oig.hhs.gov/');
  });

  it('lists a hundred, then offers the rest', async () => {
    feeds.sanctions.mockResolvedValue(sanctions(Array.from({ length: 110 }, (_, i) => pub(2000 + i, '2026-10-13'))));
    await desk();
    expect(screen.getAllByTestId('lead-row')).toHaveLength(100);
    // 110 publications, a month and two programmes.
    fireEvent.click(screen.getByRole('button', { name: 'Show 13 more of 13' }));
    expect(screen.getAllByTestId('lead-row')).toHaveLength(113);
  });
});

describe('on a phone', () => {
  it('opens the detail under its row, not below the list', async () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query.includes('max-width'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }));
    vi.stubGlobal('matchMedia', matchMedia);
    try {
      await desk();
      choose('reward', 1);
      const list = screen.getByTestId('lead-list');
      const chosen = within(list).getAllByTestId('lead-row').find((r) => r.getAttribute('aria-pressed') === 'true')!;
      const shown = within(list).getByTestId('lead-detail');
      expect(chosen.closest('.MuiPaper-root')!.nextElementSibling).toContainElement(shown);
      expect(screen.getAllByTestId('lead-detail')).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('starting a case from a lead (LD3)', () => {
  it('seeds a case from the chosen lead and opens it in Cases', async () => {
    addCase.mockReset().mockResolvedValue('case-7');
    const navigateToApp = vi.fn();
    render(
      <EnhancedApplicationRouterContext.Provider value={{ navigateToApp } as never}>
        <OpportunityBoard reports={[]} />
      </EnhancedApplicationRouterContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId('board-summary')).not.toHaveTextContent(/reading/i));
    choose('sanctions');
    fireEvent.click(screen.getByTestId('lead-start-case'));
    await waitFor(() => expect(navigateToApp).toHaveBeenCalledWith('cases', undefined, { selectCaseId: 'case-7' }));
    expect(addCase).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Lead: OFAC sanctions changes, 2026-10-13',
      sources: [expect.objectContaining({ url: 'https://ofac.treasury.gov/recent-actions/20261013' }), expect.objectContaining({ url: 'https://sanctionslistservice.ofac.treas.gov/changes/1049' })],
    }));
  });

  it('says so when the case could not be made', async () => {
    addCase.mockReset().mockResolvedValue(null);
    render(
      <EnhancedApplicationRouterContext.Provider value={{ navigateToApp: vi.fn() } as never}>
        <OpportunityBoard reports={[]} />
      </EnhancedApplicationRouterContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId('board-summary')).not.toHaveTextContent(/reading/i));
    fireEvent.click(screen.getByTestId('lead-start-case'));
    expect(await screen.findByText('The case could not be made.')).toBeInTheDocument();
  });

  it('offers no button where there is no router to open Cases with', async () => {
    await desk();
    expect(screen.queryByTestId('lead-start-case')).toBeNull();
  });
});

describe('the counts matrix (LD2)', () => {
  it('counts each kind by audience, and a count filters the list', async () => {
    await desk();
    fireEvent.click(screen.getByRole('button', { name: 'Counts' }));
    const matrix = screen.getByTestId('lead-matrix');
    expect(within(matrix).queryByRole('rowheader', { name: 'Funding window' })).toBeNull();
    // The two programmes: both reward-bearing, one for sanctions research, the other for recovery.
    expect(within(matrix).getByRole('button', { name: '2 reward programme leads for Reward-bearing: show them' })).toBeInTheDocument();
    expect(within(matrix).getByRole('button', { name: '1 reward programme leads for Sanctions research: show them' })).toBeInTheDocument();
    expect(within(matrix).getByRole('button', { name: '2 reward programme leads: show them' })).toBeInTheDocument();
    fireEvent.click(within(matrix).getByRole('button', { name: '2 reward programme leads for Reward-bearing: show them' }));
    expect(screen.getAllByTestId('lead-row').map((r) => r.dataset.kind)).toEqual(['reward', 'reward']);
    expect(screen.getByTestId('kind-filter')).toHaveTextContent('Kind: Reward programme');
    expect(screen.getByRole('button', { name: /Reward-bearing \(2\)/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lets the kind go again', async () => {
    await desk();
    fireEvent.click(screen.getByRole('button', { name: 'Counts' }));
    fireEvent.click(within(screen.getByTestId('lead-matrix')).getByRole('button', { name: '1 sanctions changes leads: show them' }));
    expect(screen.getAllByTestId('lead-row')).toHaveLength(1);
    fireEvent.click(within(screen.getByTestId('kind-filter')).getByTestId('CancelIcon'));
    expect(screen.getAllByTestId('lead-row')).toHaveLength(4);
  });
});

describe('grouped by who decides (LD2)', () => {
  it("groups the leads by their decider, the largest first, each with its programme's page where there is one", async () => {
    await desk();
    fireEvent.click(screen.getByRole('button', { name: 'By decider' }));
    const groups = within(screen.getByTestId('decider-groups')).getAllByTestId('decider-group');
    expect(groups.map((g) => g.querySelector('h3')?.textContent)).toEqual([
      'Decided by HHS-OIG (1) · its programme',
      'Decided by OFAC (1) · its programme',
      'Decided by the FBI (1)',
      'Decided by the U.S. Secretary of State (1) · its programme',
    ]);
    expect(within(groups[1]).getByRole('link', { name: 'its programme' })).toHaveAttribute('href', 'https://ofac.treasury.gov/');
    expect(within(groups[3]).getByRole('link', { name: 'its programme' })).toHaveAttribute('href', 'https://rewardsforjustice.net/about/program-overview/');
  });

  it('shows five of a group, then all of it when asked', async () => {
    feeds.sanctions.mockResolvedValue(sanctions(Array.from({ length: 7 }, (_, i) => pub(3000 + i, '2026-10-13'))));
    await desk();
    fireEvent.click(screen.getByRole('button', { name: 'By decider' }));
    const ofac = within(screen.getByTestId('decider-groups')).getAllByTestId('decider-group')[0];
    expect(within(ofac).getAllByTestId('lead-row')).toHaveLength(5);
    fireEvent.click(within(ofac).getByRole('button', { name: 'Show all 7' }));
    expect(within(ofac).getAllByTestId('lead-row')).toHaveLength(7);
  });
});

describe('the map (LD2)', () => {
  const square = (x: number, y: number) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 5, y], [x + 5, y + 5], [x, y + 5], [x, y]]] });
  const OUTLINES = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { ADM0_A3: 'MEX', ISO_A2: 'MX', ADMIN: 'Mexico', NAME: 'Mexico' }, geometry: square(-105, 20) },
      { type: 'Feature', properties: { ADM0_A3: 'USA', ISO_A2: 'US', ADMIN: 'United States of America', NAME: 'United States of America' }, geometry: square(-100, 35) },
      { type: 'Feature', properties: { ADM0_A3: 'FRA', ISO_A2: '-99', ISO_A2_EH: 'FR', ADMIN: 'France', NAME: 'France' }, geometry: square(0, 45) },
    ],
  };

  it("shades each country its leads name, lists US states, and a country's leads open in the list", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(OUTLINES), { status: 200 })));
    try {
      await desk();
      fireEvent.click(screen.getByRole('button', { name: 'Map' }));
      const map = await screen.findByRole('img', { name: 'Leads by the countries they name' });
      const countries = within(map).getAllByTestId('map-country');
      expect(countries.map((c) => c.getAttribute('aria-label'))).toEqual(['Mexico: 1 lead', 'United States of America: 1 lead']);
      // Wound as GeoJSON winds it, a country would read to d3 as the world without it and fill the map.
      const xs = (countries[0].getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 0);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(100);
      expect(screen.getAllByTestId('map-state').map((c) => c.textContent)).toEqual(['NC 1']);
      expect(screen.getByTestId('lead-map')).toHaveTextContent('2 countries named by 2 leads (2 in all). Organisations and places only; people are never placed.');
      fireEvent.click(countries[0]);
      expect(screen.getAllByTestId('lead-row').map((r) => r.dataset.kind)).toEqual(['sanctions']);
      expect(screen.getByTestId('place-filter')).toHaveTextContent('Place: Mexico');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
