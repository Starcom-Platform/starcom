/**
 * What a board's pinned reports rest on (plan item 4.3, the owner's choice of
 * 2026-09-30).
 *
 * The Intelligence Dashboard's "Analyze Published Reports" ran an analysis
 * whose every detector returned nothing, then filled a report from
 * IntelFusion's templates: canned sentences around a few real counts, and a
 * confidence on a 0 to 95 scale read as 0 to 1, which marked every report
 * CRITICAL. The counts were the real part, and they move here: how many
 * sources, their grades, the places and times the reports cover, and what is
 * missing. Everything is read from the reports themselves. Nothing here
 * claims a confidence or a priority: the draft's author decides those.
 *
 * A Private report is counted, never named: its countries stay out, as a
 * Private record stays out of a bundle (plan item 9.13).
 */
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import type { IntelReliability } from '../../../types/intel/IntelItemUI';
import type { PinnedItem } from '../state/BoardsTypes';
import { reportTime } from '../../../services/intel/recordTime';
import { countryName } from '../state/readableNames';
import { formatUtcDate } from '../../../utils/utcTime';

export interface PinnedReportsDigest {
  /** Reports pinned on the board, as report pins or pinned report events. */
  pinned: number;
  /** Of those, the ones in this workspace. */
  found: number;
  /** Distinct authors among them: a count, never who. */
  authors: number;
  /** Each reliability grade present, A to F, then the ungraded. */
  grades: Array<[IntelReliability | 'ungraded', number]>;
  /** Reports that give a place. */
  placed: number;
  /** Jurisdictions named by reports that are not Private: ISO codes uppercased, else as written. */
  countries: string[];
  /** Earliest and latest time, and how many reports are placed by event or by writing. */
  span: { from: number; to: number; byEvent: number; byWriting: number } | null;
  /** What is missing, one sentence each. */
  gaps: string[];
}

const EVENT_PREFIX = 'evt-report-';

/** The report ids a board pins, directly or as a report's event, once each. */
export function reportIdsOf(pins: readonly PinnedItem[]): string[] {
  const ids: string[] = [];
  for (const pin of pins) {
    const id = pin.type === 'report' ? pin.id
      : pin.type === 'event' && pin.id.startsWith(EVENT_PREFIX) ? pin.id.slice(EVENT_PREFIX.length)
      : null;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

const GRADES: IntelReliability[] = ['A', 'B', 'C', 'D', 'E', 'F'];
const reports_ = (n: number) => (n === 1 ? '1 report' : `${n} reports`);
const placedOf = (r: IntelReportUI) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude);

export function digestPinnedReports(pins: readonly PinnedItem[], reports: readonly IntelReportUI[]): PinnedReportsDigest {
  const ids = reportIdsOf(pins);
  const found = ids.map((id) => reports.find((r) => r.id === id)).filter((r): r is IntelReportUI => !!r);

  const grades: PinnedReportsDigest['grades'] = [];
  for (const grade of GRADES) {
    const n = found.filter((r) => r.reliability === grade).length;
    if (n) grades.push([grade, n]);
  }
  const ungraded = found.filter((r) => !r.reliability || !GRADES.includes(r.reliability)).length;
  if (ungraded) grades.push(['ungraded', ungraded]);

  const countries = [...new Set(found
    .filter((r) => r.visibility !== 'private')
    .flatMap((r) => r.jurisdictions ?? [])
    .map((j) => j.trim())
    .filter(Boolean)
    .map((j) => (/^[a-z]{2}$/i.test(j) ? j.toUpperCase() : j)))].sort();

  const times = found.map((r) => reportTime(r)).filter((t): t is NonNullable<typeof t> => t !== null);
  const span = times.length === 0 ? null : {
    from: Math.min(...times.map((t) => t.start)),
    to: Math.max(...times.map((t) => t.statedEnd ?? t.start)),
    byEvent: times.filter((t) => t.basis === 'event').length,
    byWriting: times.filter((t) => t.basis === 'written').length,
  };

  const authors = new Set(found.map((r) => r.author).filter(Boolean)).size;
  const gaps: string[] = [];
  const missing = ids.length - found.length;
  if (missing) gaps.push(`${missing === 1 ? '1 pinned report is' : `${missing} pinned reports are`} not in this workspace, so nothing about ${missing === 1 ? 'it' : 'them'} is counted.`);
  const unplaced = found.length - found.filter(placedOf).length;
  if (unplaced) gaps.push(`${reports_(unplaced)} ${unplaced === 1 ? 'gives' : 'give'} no place.`);
  if (ungraded) gaps.push(`${reports_(ungraded)} ${ungraded === 1 ? 'has' : 'have'} no reliability grade.`);
  const unsourced = found.filter((r) => !(r.sourceIntelIds?.length)).length;
  if (unsourced) gaps.push(`${reports_(unsourced)} link no source.`);
  const drafts = found.filter((r) => r.status === 'DRAFT').length;
  if (drafts) gaps.push(drafts === 1 ? '1 report is a draft: its author has not stood behind it yet.' : `${drafts} reports are drafts: their authors have not stood behind them yet.`);
  const samples = found.filter((r) => r.sample === true).length;
  if (samples) gaps.push(samples === 1 ? '1 report is a sample, not evidence.' : `${samples} reports are samples, not evidence.`);
  if (found.length >= 2 && authors === 1) {
    gaps.push(found.length === 2
      ? 'Both reports have the same author, so neither corroborates the other.'
      : `All ${found.length} reports have the same author, so none corroborates another.`);
  }

  return { pinned: ids.length, found: found.length, authors, grades, placed: found.filter(placedOf).length, countries, span, gaps };
}

/** The section a draft carries, in markdown; empty when nothing pinned is a report. */
export function digestSection(d: PinnedReportsDigest): string {
  if (d.pinned === 0) return '';
  const lines = ['## What the pinned reports rest on', ''];
  lines.push(d.found === d.pinned
    ? (d.pinned === 1 ? '- 1 report pinned, found here.' : `- ${d.pinned} reports pinned, all found here.`)
    : `- ${reports_(d.pinned)} pinned, ${d.found} found here.`);
  if (d.found > 0) {
    lines.push(`- ${d.authors === 1 ? '1 author' : `${d.authors} authors`}.`);
    lines.push(`- Reliability: ${d.grades.map(([g, n]) => (g === 'ungraded' ? `${n} not graded` : `${n} graded ${g}`)).join(', ')}.`);
    const verb = d.placed === 1 ? 'gives' : 'give';
    const places = d.placed === 0 ? 'None gives a place.'
      : d.placed === d.found ? `${d.placed} ${verb} a place.`
      : `${d.placed} of ${d.found} ${verb} a place.`;
    const named = d.countries.map((c) => countryName(c) ?? c).sort((a, b) => a.localeCompare(b));
    lines.push(`- ${places}${named.length ? ` Countries named: ${named.join(', ')}.` : ''}`);
    if (d.span) {
      const from = formatUtcDate(d.span.from, { year: true });
      const to = formatUtcDate(d.span.to, { year: true });
      const when = from === to ? `on ${from}` : `from ${from} to ${to}`;
      const what = d.span.byWriting === 0 ? 'Events' : d.span.byEvent === 0 ? 'Written' : 'Events and writing';
      lines.push(`- ${what} ${when} (UTC).${d.span.byEvent > 0 && d.span.byWriting > 0
        ? ` ${reports_(d.span.byWriting)} ${d.span.byWriting === 1 ? 'states' : 'state'} no event time, so ${d.span.byWriting === 1 ? 'it is' : 'they are'} placed by writing.`
        : ''}`);
    }
  }
  if (d.gaps.length) {
    lines.push('', '### What is missing', '', ...d.gaps.map((g) => `- ${g}`));
  }
  return lines.join('\n');
}
