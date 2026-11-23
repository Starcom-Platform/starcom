/**
 * The declassified desk's day on a card (plan H9), a front page of its own, as tonight's and the week's are:
 * Mecha Jono's spec of 25 Oct asks for the day's count, up to three releases with their sources, and each
 * release's licence in the Data line. A release has no place, so nothing on the globe is about it; a caveat says so.
 */
import type { DeclassRecord } from '../../../services/declassified/declassDesk';
import { formatUtcDate } from '../../../utils/utcTime';
import type { DeclassifiedFrontPage } from './shareCardProvenance';

/** How many releases a card names. */
export const DECLASSIFIED_SHOWN = 3;
/** A title longer than this is shortened at a word on the card; the record keeps it whole. */
const TITLE_CHARS = 110;

function shortened(title: string): string {
  if (title.length <= TITLE_CHARS) return title;
  const cut = title.slice(0, TITLE_CHARS - 1);
  const word = cut.lastIndexOf(' ');
  return `${(word > TITLE_CHARS / 2 ? cut.slice(0, word) : cut).replace(/[\s,:;–-]+$/, '')}…`;
}

/** The day's page. */
export function declassifiedCard(day: { day: string; records: readonly DeclassRecord[] }): { page: DeclassifiedFrontPage } {
  const count = day.records.length;
  const shown = day.records.slice(0, DECLASSIFIED_SHOWN);
  const more = count - shown.length;
  return {
    page: {
      kind: 'declassified',
      day: day.day,
      title: `Declassified on ${formatUtcDate(Date.parse(`${day.day}T00:00:00Z`), { year: true })}: ${count} ${count === 1 ? 'release' : 'releases'}`,
      lines: [
        // Title, then source: a source's own name often ends in brackets, "(OSTI)", so none are put round it.
        ...shown.map((r) => `${shortened(r.title)} · ${r.sourceName}`),
        ...(more > 0 ? [`And ${more} more ${more === 1 ? 'release' : 'releases'} that day.`] : []),
      ],
      count,
      records: shown.map((r) => ({
        d: r.d, title: r.title, source: r.source, sourceName: r.sourceName,
        publishedAt: new Date(r.publishedAt).toISOString(), licence: r.licence, link: r.links[0] ?? null,
      })),
      credits: [...new Set(shown.map((r) => `${r.sourceName}: ${r.licence}`))],
    },
  };
}
