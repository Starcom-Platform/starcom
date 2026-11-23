/**
 * What a card about an area says (BA23; plan block J, item 6b): the area's
 * name as its headline; how many Intel Reports are in it, by assessment; the
 * most severe by title; its caveats, where it was taken from and the day that
 * was read; and what is outside the frame (BA22).
 *
 * Drawn as a featured block, the area's middle where an item's glyph would be,
 * so a card about an area is laid out, checked and recorded as every card is.
 * Its id is the area's code after `area:`, never an address listReports gives.
 */
import type { AreaDef } from '../areas/areaRegistry';
import { formatUtcDate } from '../../../utils/utcTime';
import { membersOrder, type FeaturedReport, type ShareReportInfo } from './shareReports';
import { cutTitle } from '../../../utils/cutTitle';

/** The assessments, most severe first, as a count names them. */
const ASSESSED: ReadonlyArray<[string, string]> = [
  ['critical', 'critical'], ['actionable', 'actionable'], ['standard', 'assessed'], ['raw', 'not assessed'],
];
/** A title on its line is cut near here, at a word. */
/** A title cut near 60 characters, at a word, for a line on a card. */
export const cut = (title: string) => cutTitle(title);

export function areaCardFacts({ area, reports, outside, position }: {
  area: AreaDef;
  /** The items listed as standing in the area (BA21); only its Intel Reports are counted. */
  reports: readonly ShareReportInfo[];
  /** What is outside the frame, in words (areaFrame), or null. */
  outside: string | null;
  /** Where the card points: the middle of the area's largest part. */
  position: { lat: number; lng: number };
}): FeaturedReport {
  const intel = reports.filter((report) => report.layer === 'IntelReports').sort(membersOrder);
  const lines: string[] = [];
  if (!intel.length) {
    lines.push('No Intel Reports in it now');
  } else {
    const counts = ASSESSED.flatMap(([variant, words]) => {
      const n = intel.filter((report) => report.variant === variant).length;
      return n ? [`${n} ${words}`] : [];
    });
    lines.push(`${intel.length} Intel Report${intel.length === 1 ? '' : 's'} in it: ${counts.join(', ')}`);
    lines.push(`Most severe: ${cut(intel[0].title)}`);
  }
  if (area.note) lines.push(area.note);
  lines.push(`From ${area.source.name}, read ${formatUtcDate(Date.parse(`${area.source.read}T00:00:00Z`), { year: true })}`);
  if (outside) lines.push(outside);
  return { id: `area:${area.code}`, title: area.name, position: { ...position }, lines };
}
