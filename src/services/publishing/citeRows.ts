/**
 * What a publication cites, in the review's words (decision D-MX: MX3, MX22,
 * MX24): each observation it rests on, by event and the relay that held it,
 * and for a package, how many linked reports rest on observations it does not
 * cite, and why. Their ids go out in the event's tags, so the review shows
 * them before anything is signed.
 *
 * Each id is shown whole, as it goes out. Cut short, an id whose first or last
 * hex digits happened to all be numerals read as a long number, and the review
 * warned of one that was not there.
 */
import type { ReportCitation } from '../../types/intel/IntelReportUI';
import type { ReviewContent } from './publishReview';

export function citeRows(cites: readonly ReportCitation[], heldBack = 0): ReviewContent['fields'] {
  return [
    ...cites.map((c, i) => ({
      label: cites.length === 1 ? 'Cites' : `Cites ${i + 1}`,
      value: `the observation ${c.eventId}${c.relay ? ` on ${c.relay}` : ''}: its id goes out in the tags, crediting whoever made it`,
    })),
    ...(heldBack > 0
      ? [{
        label: 'Not cited',
        value: heldBack === 1
          ? 'One linked report rests on observations this package does not cite: its distribution does not reach where the package goes.'
          : `${heldBack} linked reports rest on observations this package does not cite: their distribution does not reach where the package goes.`,
      }]
      : []),
  ];
}
