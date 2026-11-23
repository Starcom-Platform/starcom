/**
 * Related intel (decision D-DP, step 8): the Intel Reports about the same countries as a place's or a
 * selected country's events, in the time shown (the snapshot's day live, the shared window paused).
 *
 * A report states its jurisdictions freely, lowercased and otherwise as its publisher wrote them
 * ("us", "us-tx", "UKR"; IntelReportUI.jurisdictions): a two-letter code is a country, read as GDELT's
 * three-letter one; a state ("us-tx") counts as its country; a three-letter code is taken as one; a
 * name is not guessed at. A report's time is its event, or when it was written (D-E, recordTime.ts).
 */
import { iso2ToIso3 } from '../../services/geolocation/iso2to3CountryCodes';
import { overlapsWindow, reportTime } from '../../services/intel/recordTime';
import type { TimeSpan } from './gdeltTimeSpan';

export function countriesOfJurisdictions(jurisdictions: readonly string[] | undefined): Set<string> {
  const countries = new Set<string>();
  for (const raw of jurisdictions ?? []) {
    const code = raw.trim().toLowerCase().split('-')[0];
    if (/^[a-z]{2}$/.test(code)) {
      const iso3 = iso2ToIso3(code);
      if (iso3) countries.add(iso3);
    } else if (/^[a-z]{3}$/.test(code)) {
      countries.add(code.toUpperCase());
    }
  }
  return countries;
}

type Dated = { jurisdictions?: string[]; startDate?: unknown; endDate?: unknown; timePrecisionMs?: number; updatedAt?: unknown; createdAt?: unknown };

/** The reports naming any of the countries, whose time overlaps the span, newest first. */
export function relatedReports<T extends Dated>(reports: readonly T[], countries: readonly string[], span: TimeSpan | null): T[] {
  if (!span || countries.length === 0) return [];
  const wanted = new Set(countries);
  return reports
    .map((report) => ({ report, time: reportTime(report as Parameters<typeof reportTime>[0]) }))
    .filter(({ report, time }) => time !== null && overlapsWindow(time, span)
      && [...countriesOfJurisdictions(report.jurisdictions)].some((code) => wanted.has(code)))
    .sort((a, b) => b.time!.start - a.time!.start)
    .map(({ report }) => report);
}
