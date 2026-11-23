/**
 * Related intel (decision D-DP, step 8): the Intel Reports about the same countries as a place's or a
 * selected country's events, in the time shown. A report states its jurisdictions freely ("us",
 * "us-tx", "UKR"), and its time is its event, or when it was written (D-E, recordTime.ts).
 */
import { describe, expect, it } from 'vitest';
import { countriesOfJurisdictions, relatedReports } from '../diplomaticRelatedIntel';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 13, 18);
const span = { start: NOW - 24 * HOUR, end: NOW };
const report = (id: string, jurisdictions: string[], startDate?: string, createdAt = new Date(NOW - 2 * HOUR).toISOString()) =>
  ({ id, title: id, jurisdictions, startDate, createdAt });

describe('the countries a report states', () => {
  it('are its jurisdictions as three-letter codes, a state counted as its country', () => {
    expect(countriesOfJurisdictions(['us-tx', 'UA', 'rus', 'european union', ''])).toEqual(new Set(['USA', 'UKR', 'RUS']));
  });
});

describe('related intel', () => {
  const reports = [
    report('kyiv', ['ua'], new Date(NOW - 3 * HOUR).toISOString()),
    report('texas', ['us-tx']),
    report('old', ['ua'], new Date(NOW - 72 * HOUR).toISOString()),
    report('paris', ['fr']),
    report('none', []),
  ];

  it('is the reports about either country in the time shown, newest first', () => {
    expect(relatedReports(reports, ['UKR', 'USA'], span).map((r) => r.id)).toEqual(['texas', 'kyiv']);
  });

  it('is none in a span that holds none of them', () => {
    expect(relatedReports(reports, ['UKR'], { start: NOW - 200 * HOUR, end: NOW - 100 * HOUR })).toEqual([]);
  });

  it('is none before a span exists', () => {
    expect(relatedReports(reports, ['UKR'], null)).toEqual([]);
  });
});
