import { describe, expect, it } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { routeToAudiences } from '../opportunityAudience';
import { leadsFor, leadsFrom, sortLeads, type Lead } from '../leads';
import type { FundingWindow } from '../feeds/grantsGov';
import type { RewardProgramme } from '../feeds/rewardProgrammes';
import type { SanctionsPublication } from '../feeds/sanctionsChanges';
import type { ExclusionMonth } from '../feeds/healthExclusions';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'Acme LLC was paid $3,000 across 2 federal award(s) while carrying a Reciprocal exclusion', content: '',
  author: 'f'.repeat(64), category: 'general', tags: [], createdAt: new Date('2026-10-10T08:00:00Z'), updatedAt: new Date('2026-10-10T08:00:00Z'),
  status: 'SUBMITTED', jurisdictions: ['US-OH'], ...over,
} as IntelReportUI);
const funding = (id: string, opens: string, closes: string): FundingWindow => ({
  id, number: `N-${id}`, title: `Window ${id}`, agency: 'National Science Foundation', agencyCode: 'NSF', opens, closes, status: 'posted',
  categories: ['ST'], audiences: ['strategic_consultant', 'academic_researcher'], url: `https://www.grants.gov/search-results-detail/${id}`,
});
const rfj: RewardProgramme = {
  id: 'rfj', name: 'Rewards for Justice', paysFor: 'Information on terrorism.', basis: '22 U.S.C. §2708', decidedBy: 'the U.S. Secretary of State',
  reference: 'https://rewardsforjustice.net/about/program-overview/', tip: { label: 't', url: 'https://rewardsforjustice.net/' }, total: 272, kinds: [], leftOut: '',
  audiences: ['reward_hunter', 'sanctions_researcher', 'whitehat'],
};
const fbi: RewardProgramme = { ...rfj, id: 'fbi', name: 'FBI rewards', basis: undefined, decidedBy: 'the FBI', reference: 'https://www.fbi.gov/wanted', audiences: ['reward_hunter', 'recovery_agent'] };
const tally = { entities: 1, individuals: 2, vessels: 0, aircraft: 0, other: 0 };
const publication: SanctionsPublication & { via: 'file' } = {
  id: 1049, date: '2026-10-13', kind: 'Standard Action', added: tally, removed: tally, amended: 0, programmes: [],
  named: [{ action: 'add', type: 'Entity', name: 'EXAMPLE LOGISTICS', countries: ['Mexico'], programmes: [] }, { action: 'add', type: 'Vessel', name: 'EXAMPLE STAR', countries: ['Mexico', 'Panama'], programmes: [] }],
  via: 'file',
};
const month: ExclusionMonth & { via: 'file' } = {
  month: '2026-09', exclusions: 145, reinstatements: 53, people: 136, practicesCounted: 0, byState: { FL: 28, NC: 1 }, byCategory: {}, byBasis: {},
  organisations: [{ name: 'EXAMPLE SUPPLY, LLC', state: 'NC', category: 'DME COMPANY', basis: '1128a1', date: '2026-10-20' }], via: 'file',
};

const leads = leadsFrom({
  reports: [{ report: report(), routing: routeToAudiences(report()) }],
  funding: { windows: [funding('7', '2026-09-01', '2026-11-01'), funding('8', '', '2026-10-20')], undated: 0, today: '2026-10-13' },
  rewards: { programmes: [rfj, fbi] },
  sanctions: { publications: [publication], from: '2026-09-13', missing: [] },
  exclusions: { months: [month] },
});
const byId = (id: string) => leads.find((l) => l.id === id)!;

describe('leadsFrom (LD1): reports and feed items in one shape', () => {
  it('holds each once, of every kind', () => {
    expect(leads.map((l) => l.id)).toEqual(['report:r1', 'funding:7', 'funding:8', 'reward:rfj', 'reward:fbi', 'sanctions:1049', 'exclusions:2026-09']);
  });

  it("gives a report's date, publisher, places, its routing and its law, and links to it in Intel", () => {
    expect(byId('report:r1')).toMatchObject({
      date: '2026-10-10', source: 'f'.repeat(64), url: '/intel?reportId=r1', places: [{ jurisdiction: 'us-oh' }],
      basis: 'derived', decidedBy: 'the U.S. Department of Justice and the court', statute: { name: 'False Claims Act (31 U.S.C. §3729)' },
    });
  });

  it("dates a funding window by its opening, closes it by its closing, and gives it no place", () => {
    expect(byId('funding:7')).toMatchObject({ date: '2026-09-01', closes: '2026-11-01', places: [], decidedBy: 'National Science Foundation', basis: 'derived' });
    expect(byId('funding:8').date).toBeUndefined();
  });

  it('names a reward programme’s law only where the programme names one, never an amount', () => {
    expect(byId('reward:rfj').statute).toEqual({ name: '22 U.S.C. §2708', decidedBy: 'the U.S. Secretary of State', reference: 'https://rewardsforjustice.net/about/program-overview/' });
    expect(byId('reward:fbi').statute).toBeUndefined();
    expect(JSON.stringify(leads.filter((l) => l.kind === 'reward'))).not.toMatch(/\$|amount/i);
  });

  it("places a sanctions publication in its named organisations' countries, each once, and links OFAC's notice for the day", () => {
    expect(byId('sanctions:1049')).toMatchObject({ date: '2026-10-13', url: 'https://ofac.treasury.gov/recent-actions/20261013', places: [{ countryName: 'Mexico' }, { countryName: 'Panama' }] });
  });

  it("places a month of exclusions in its named organisations' states only: people are never placed (BF2)", () => {
    expect(byId('exclusions:2026-09').places).toEqual([{ jurisdiction: 'us-nc' }]);
  });
});

describe('sortLeads', () => {
  const ids = (ls: Lead[]) => ls.map((l) => l.id);

  it('puts the newest first, undated leads after by title', () => {
    // Two on 1 Sep: by title, "HHS-OIG exclusions" before "Window 7".
    expect(ids(sortLeads(leads, 'newest'))).toEqual(['sanctions:1049', 'report:r1', 'exclusions:2026-09', 'funding:7', 'reward:fbi', 'reward:rfj', 'funding:8']);
  });

  it('puts the soonest to close first, leads that do not close after', () => {
    expect(ids(sortLeads(leads, 'closing')).slice(0, 3)).toEqual(['funding:8', 'funding:7', 'report:r1']);
  });
});

describe('leadsFor', () => {
  it('keeps the leads offered to any audience chosen, and all when none is', () => {
    expect(leadsFor(leads, new Set(['academic_researcher', 'insurance_siu'])).map((l) => l.id)).toEqual(['funding:7', 'funding:8', 'exclusions:2026-09']);
    expect(leadsFor(leads, new Set())).toHaveLength(leads.length);
  });
});
