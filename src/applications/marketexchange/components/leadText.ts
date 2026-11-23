/**
 * How the lead desk words dates, counts and sources (decision D-LD). Dates are UTC days, day before
 * month, as everywhere in the app (utcTime.ts).
 */
import { formatUtcDate, formatUtcMonth } from '../../../utils/utcTime';
import { EXCLUSION_BASES } from '../../../services/exchange/feeds/healthExclusions';
import type { Tally } from '../../../services/exchange/feeds/sanctionsChanges';
import type { Lead, LeadKind } from '../../../services/exchange/leads';

/** `13 Oct 2026` from YYYY-MM-DD. */
export const dateOf = (iso: string) => formatUtcDate(Date.parse(`${iso}T00:00:00Z`), { year: true });

/** `Sep 2026` from YYYY-MM, the house form (utils/utcTime). */
export const monthName = (month: string) => formatUtcMonth(Date.parse(`${month}-01T00:00:00Z`));

/** Whole UTC days from `today` to `iso`, both YYYY-MM-DD. */
export const daysFrom = (today: string, iso: string) =>
  Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

/** "today", "in 1 day", "in 4 days", "4 days ago". */
export function daysText(days: number): string {
  if (days === 0) return 'today';
  const n = Math.abs(days);
  const unit = `${n} day${n === 1 ? '' : 's'}`;
  return days > 0 ? `in ${unit}` : `${unit} ago`;
}

/** An OIG basis code in OIG's words, or the code where OIG's authorities page does not give it. */
export const basisName = (code: string) =>
  (EXCLUSION_BASES[code] ? `§${EXCLUSION_BASES[code].section}: ${EXCLUSION_BASES[code].label}` : `OIG code ${code}`);

/** The largest counts first, the first `n`, then how many more. */
export function topCounts(counts: Record<string, number>, n: number, name: (key: string) => string = (k) => k) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { shown: sorted.slice(0, n).map(([k, v]) => `${name(k)}: ${v}`), more: Math.max(0, sorted.length - n) };
}

const TALLY_WORDS: Array<[keyof Tally, string, string]> = [
  ['entities', 'entity', 'entities'], ['individuals', 'person', 'people'], ['vessels', 'vessel', 'vessels'], ['aircraft', 'aircraft', 'aircraft'], ['other', 'other', 'other'],
];
export const tallyText = (t: Tally) => TALLY_WORDS.filter(([k]) => t[k] > 0).map(([k, one, many]) => `${t[k]} ${t[k] === 1 ? one : many}`).join(', ');
export const tallySum = (t: Tally) => t.entities + t.individuals + t.vessels + t.aircraft + t.other;

/** A lead's kind, in a word or two, as the list and the detail name it. */
export const KIND_NAME: Record<LeadKind, string> = {
  report: 'Report', funding: 'Funding window', reward: 'Reward programme', sanctions: 'Sanctions changes', exclusions: 'HHS-OIG exclusions',
};

/** When a lead closes, or is dated, as its row says it. */
export function whenText(lead: Lead, today: string): string {
  if (lead.closes) return `Closes ${dateOf(lead.closes)} (${daysText(daysFrom(today, lead.closes))})`;
  if (lead.kind === 'exclusions' && lead.date) return monthName(lead.date.slice(0, 7));
  return lead.date ? dateOf(lead.date) : 'Standing programme';
}
