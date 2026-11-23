import { describe, expect, it } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { routeToAudiences } from '../opportunityAudience';
import { exclusionsLead, fundingLead, reportLead, rewardLead, sanctionsLead } from '../leads';
import { caseFromLead } from '../leadCase';

const report = {
  id: 'r1', title: 'Acme LLC was paid $3,000 across 2 federal award(s) while carrying a Reciprocal exclusion', content: '', author: 'f'.repeat(64),
  category: 'general', tags: [], createdAt: new Date('2026-10-10T08:00:00Z'), updatedAt: new Date('2026-10-10T08:00:00Z'), status: 'SUBMITTED',
} as unknown as IntelReportUI;
const tally = { entities: 1, individuals: 2, vessels: 0, aircraft: 0, other: 0 };

describe('caseFromLead (LD3)', () => {
  it('starts a case on a report lead linked to the report, its law and decider said, no web source invented', () => {
    const c = caseFromLead(reportLead({ report, routing: routeToAudiences(report) }));
    expect(c.title).toBe(`Lead: ${report.title}`);
    expect(c.relatedEntities).toEqual(['r1']);
    expect(c.sources).toEqual([]);
    expect(c.description).toMatch(/False Claims Act \(31 U\.S\.C\. §3729\), decided by the U\.S\. Department of Justice and the court\./);
    expect(c.description).toMatch(/worked out by Starcom, not stated by the publisher/);
    expect(c.tags).toEqual(['lead', 'lead-report', 'audience:qui_tam_relator', 'audience:reward_hunter', 'audience:strategic_consultant']);
  });

  it("takes a funding window's page as its source, dated when it opened", () => {
    const c = caseFromLead(fundingLead({ id: '7', number: 'N-7', title: 'Window 7', agency: 'NSF', agencyCode: 'NSF', opens: '2026-09-01', closes: '2026-11-01', status: 'posted', categories: ['ST'], audiences: ['academic_researcher'], url: 'https://www.grants.gov/search-results-detail/7' }));
    expect(c.sources).toEqual([{ url: 'https://www.grants.gov/search-results-detail/7', title: 'Window 7', reportedAt: '2026-09-01T00:00:00Z' }]);
    expect(c.description).toMatch(/Closes 2026-11-01\./);
  });

  it("takes a programme's page and its tip line, and states no amount", () => {
    const c = caseFromLead(rewardLead({ id: 'rfj', name: 'Rewards for Justice', paysFor: '', basis: '22 U.S.C. §2708', decidedBy: 'the U.S. Secretary of State', reference: 'https://rewardsforjustice.net/about/program-overview/', tip: { label: 't', url: 'https://rewardsforjustice.net/' }, total: 272, kinds: [], leftOut: '', audiences: ['reward_hunter'] }));
    expect(c.sources.map((s) => s.url)).toEqual(['https://rewardsforjustice.net/about/program-overview/', 'https://rewardsforjustice.net/']);
    expect(c.description).not.toMatch(/\$/);
  });

  it("takes OFAC's notice and the delta file for a publication, and HHS-OIG's pages for a month", () => {
    const s = caseFromLead(sanctionsLead({ id: 1049, date: '2026-10-13', kind: 'Standard Action', added: tally, removed: tally, amended: 0, programmes: [], named: [], via: 'file' }));
    expect(s.sources.map((x) => x.url)).toEqual(['https://ofac.treasury.gov/recent-actions/20261013', 'https://sanctionslistservice.ofac.treas.gov/changes/1049']);
    const e = caseFromLead(exclusionsLead({ month: '2026-09', exclusions: 1, reinstatements: 0, people: 1, practicesCounted: 0, byState: {}, byCategory: {}, byBasis: {}, organisations: [], via: 'file' }));
    expect(e.sources.map((x) => x.url)).toEqual(['https://oig.hhs.gov/exclusions/supplements.asp', 'https://exclusions.oig.hhs.gov/']);
  });
});
