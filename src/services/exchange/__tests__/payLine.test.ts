/**
 * What a lead may pay, first on every listing (critique C12, CR2): only what a programme publishes, quoted
 * from its own page and linked; who decides where it publishes nothing; that nothing is paid where nothing is.
 * Never a figure of Starcom's.
 */
import { describe, expect, it } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { routeToAudiences } from '../opportunityAudience';
import { exclusionsLead, fundingLead, reportLead, rewardLead, sanctionsLead } from '../leads';
import { payLineOf } from '../payLine';
import type { AmountNotes } from '../feeds/amountNotes';
import type { FundingWindow } from '../feeds/grantsGov';
import type { RewardProgramme } from '../feeds/rewardProgrammes';
import type { SanctionsPublication } from '../feeds/sanctionsChanges';
import type { ExclusionMonth } from '../feeds/healthExclusions';

const report = (title: string): IntelReportUI => ({
  id: 'r1', title, content: '', author: 'f'.repeat(64), category: 'general', tags: [],
  createdAt: new Date('2026-10-10T08:00:00Z'), updatedAt: new Date('2026-10-10T08:00:00Z'), status: 'SUBMITTED', jurisdictions: ['US-OH'],
} as IntelReportUI);
const routed = (title: string) => reportLead({ report: report(title), routing: routeToAudiences(report(title)) });
const window: FundingWindow = {
  id: '7', number: 'N-7', title: 'Window 7', agency: 'National Science Foundation', agencyCode: 'NSF', opens: '2026-09-01', closes: '2026-11-01',
  status: 'posted', categories: ['ST'], audiences: ['academic_researcher'], url: 'https://www.grants.gov/search-results-detail/7',
};
const rfj: RewardProgramme = {
  id: 'rfj', name: 'Rewards for Justice', paysFor: 'Information on terrorism.', basis: '22 U.S.C. §2708', decidedBy: 'the U.S. Secretary of State',
  reference: 'https://rewardsforjustice.net/about/program-overview/', tip: { label: 't', url: 'https://rewardsforjustice.net/' }, total: 272, kinds: [], leftOut: '',
  audiences: ['reward_hunter'],
};
const tally = { entities: 0, individuals: 0, vessels: 0, aircraft: 0, other: 0 };
const publication = { id: 1049, date: '2026-10-13', kind: 'Standard Action', added: tally, removed: tally, amended: 0, programmes: [], named: [], via: 'file' } as SanctionsPublication & { via: 'file' };
const month = { month: '2026-09', exclusions: 1, reinstatements: 0, people: 1, practicesCounted: 0, byState: {}, byCategory: {}, byBasis: {}, organisations: [], via: 'file' } as ExclusionMonth & { via: 'file' };

describe('payLineOf', () => {
  it("quotes what the programme's own page says it may pay, linked, for a report the False Claims Act reaches", () => {
    const pay = payLineOf(routed('Acme LLC was paid $3,000 across 2 federal award(s) while carrying a Reciprocal exclusion'));
    expect(pay).toEqual({
      kind: 'quoted',
      text: '“Private citizens who successfully bring qui tam actions may receive a portion of the government’s recovery.” (U.S. Department of Justice)',
      source: { by: 'U.S. Department of Justice', url: 'https://www.justice.gov/civil/false-claims-act', label: "the U.S. Department of Justice's page" },
    });
  });

  it('never states a figure of its own: the record\'s observed sum stays out of the line', () => {
    const pay = payLineOf(routed('Acme LLC was paid $3,000 across 2 federal award(s) while carrying a Reciprocal exclusion'));
    expect(pay.text).not.toMatch(/\$|\d+\s*%|percent/i);
  });

  it('says a report no reward programme reaches pays nothing', () => {
    expect(payLineOf(routed('Example Charity lost its 501(c)(3) exempt status, revoked for unfiled returns'))).toEqual({ kind: 'none', text: 'No reward programme: public-interest work.' });
  });

  it('says who decides where a programme lists no amount here', () => {
    expect(payLineOf(fundingLead(window))).toEqual({ kind: 'decider', text: "National Science Foundation sets the award on the notice's terms; no amount is listed here yet." });
    expect(payLineOf(rewardLead(rfj))).toEqual({ kind: 'decider', text: 'The U.S. Secretary of State decides any reward and its amount; none is listed here yet.' });
  });

  it('says a public record pays nothing', () => {
    expect(payLineOf(sanctionsLead(publication)).kind).toBe('none');
    expect(payLineOf(exclusionsLead(month))).toEqual({ kind: 'none', text: 'Pays nothing: a public record to work from.' });
  });

  it("states what Mecha Jono's notes say the notices and Grants.gov list, once they are posted, sourced", () => {
    const amounts: AmountNotes = {
      rewards: new Map([['rfj', { programme: 'rfj', notices: 288, stated: 280, upTo: [{ usd: 10_000_000, notices: 200 }, { usd: 25_000_000, notices: 3 }], asOf: '2026-10-16' }]]),
      awards: new Map([['N-7', { ceiling: 500_000, floor: 50_000 }]]),
      awardsAsOf: '2026-10-16',
    };
    expect(payLineOf(rewardLead(rfj), amounts)).toEqual({
      kind: 'quoted',
      text: 'Up to $10,000,000 on 200 of its notices, and up to $25,000,000 at most, as they state (read 16 Oct 2026).',
      source: { by: 'Rewards for Justice', url: 'https://rewardsforjustice.net/about/program-overview/', label: "the programme's page" },
    });
    expect(payLineOf(fundingLead(window), amounts)).toEqual({
      kind: 'quoted',
      text: 'Award ceiling $500,000, floor $50,000, as Grants.gov lists it (read 16 Oct 2026).',
      source: { by: 'Grants.gov', url: 'https://www.grants.gov/search-results-detail/7', label: 'the opportunity on Grants.gov' },
    });
    // A window the notes do not list still says who decides.
    expect(payLineOf(fundingLead({ ...window, number: 'N-8' }), amounts).kind).toBe('decider');
  });
});
