/**
 * Hero Watch's relief, by country (decision D-HW, step 4; HW4).
 *
 * Two kinds of note say who is responding in a country: a Red Cross and Red Crescent operation from
 * IFRC GO (an appeal or a DREF allocation, its sum, the people it means to reach, its end), and OCHA's
 * count of the organisations at work there, via HDX, counted and never named. Both apply to a whole
 * country ("Ethiopia, the whole country"), so the country is what is drawn: tinted, with a pill counting
 * both. A note whose jurisdiction is not a country drawn here is counted as not drawn, never widened: a
 * subdivision's operation is not the whole country's.
 */
import { formatUtcDate } from '../../utils/utcTime';
import type { HeroWatchItem, ReliefOperation, ReliefPresence } from './heroWatch';

export interface ReliefCountry {
  /** Its two-letter code, upper case, as the territories are keyed. */
  code: string;
  name: string;
  operations: ReliefOperation[];
  /** OCHA's newest count of the organisations at work there, or null. */
  presence: ReliefPresence | null;
}

/** The countries with relief, by name, and the relief notes that name no country drawn here. */
export function reliefByCountry(
  items: readonly HeroWatchItem[],
  countryOf: (code: string) => { name: string } | null,
): { countries: ReliefCountry[]; unplaced: Array<ReliefOperation | ReliefPresence> } {
  const byCode = new Map<string, ReliefCountry>();
  const unplaced: Array<ReliefOperation | ReliefPresence> = [];
  for (const item of items) {
    if (item.kind !== 'operation' && item.kind !== 'presence') continue;
    const code = item.jurisdiction && /^[a-z]{2}$/i.test(item.jurisdiction) ? item.jurisdiction.toUpperCase() : null;
    const country = code ? countryOf(code) : null;
    if (!code || !country) { unplaced.push(item); continue; }
    const entry = byCode.get(code) ?? { code, name: country.name, operations: [], presence: null };
    if (item.kind === 'operation') entry.operations.push(item);
    else if (!entry.presence || item.createdAt > entry.presence.createdAt) entry.presence = item;
    byCode.set(code, entry);
  }
  return { countries: [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name)), unplaced };
}

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * What a country's pill says: its name, its operations and its organisations, short enough for a globe.
 * The name is in it because the tent and pill stand where the name would, and the names keep clear of
 * them: without it a card showed Ethiopia's counts and not its name (the owner's choice, 2026-10-11).
 */
export function reliefPill(country: ReliefCountry): string {
  return [
    country.name,
    country.operations.length ? counted(country.operations.length, 'op', 'ops') : null,
    country.presence ? counted(country.presence.organisations, 'org', 'orgs') : null,
  ].filter(Boolean).join(' · ');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthOf = (isoDate: string) => {
  const [year, month] = isoDate.split('-').map(Number);
  return Number.isFinite(year) && month >= 1 && month <= 12 ? { year, month: MONTHS[month - 1] } : null;
};

/** `January to March 2026`, or `December 2025 to February 2026`; empty when the note gives no period. */
function periodInWords(start?: string, end?: string): string {
  const from = start ? monthOf(start) : null;
  const to = end ? monthOf(end) : null;
  if (!from || !to) return '';
  return from.year === to.year ? `${from.month} to ${to.month} ${to.year}` : `${from.month} ${from.year} to ${to.month} ${to.year}`;
}

/**
 * The last day an operation or a mission covers, in ms: an end at midnight UTC is the start of the day
 * after, as IFRC GO's 31 March runs to 1 April 00:00Z, and Mecha Jono's note says "until 31 March 2027".
 */
export const lastDayOf = (endS: number) => (endS % 86_400 === 0 ? endS - 86_400 : endS) * 1000;

/** One operation, as its note gives it: `Ethiopian Red Cross Society, Ethiopia Drought Response (DREF, CHF 749,972, …)`. */
function operationInWords(op: ReliefOperation): string {
  const facts = [
    op.appealType,
    op.amountChf !== undefined ? `CHF ${new Intl.NumberFormat('en-US').format(op.amountChf)}` : null,
    op.peopleToReach !== undefined ? `to reach ${new Intl.NumberFormat('en-US').format(op.peopleToReach)} people` : null,
    op.end !== undefined ? `until ${formatUtcDate(lastDayOf(op.end), { year: true })}` : null,
  ].filter(Boolean);
  return `${op.title.replace(': ', ', ')}${facts.length ? ` (${facts.join(', ')})` : ''}`;
}

/** What a country's hover says: its operations, the two largest by name, and its organisations, counted. */
export function describeRelief(country: ReliefCountry): string {
  const said: string[] = [];
  if (country.operations.length) {
    const largest = [...country.operations].sort((a, b) => (b.amountChf ?? -1) - (a.amountChf ?? -1));
    const named = largest.slice(0, 2).map(operationInWords).join('; ');
    const more = largest.length > 2 ? `; and ${largest.length - 2} more` : '';
    said.push(`${counted(country.operations.length, 'Red Cross and Red Crescent operation', 'Red Cross and Red Crescent operations')} in IFRC GO: ${named}${more}.`);
  }
  if (country.presence) {
    const { organisations, nationalNgos, periodStart, periodEnd } = country.presence;
    const period = periodInWords(periodStart, periodEnd);
    said.push(`${counted(organisations, 'organisation', 'organisations')} at work by OCHA's count${period ? `, ${period}` : ''}`
      + `${nationalNgos !== undefined ? `, ${nationalNgos} of them national NGOs` : ''}.`);
  }
  return `${country.name}: ${said.join(' ')}`;
}
