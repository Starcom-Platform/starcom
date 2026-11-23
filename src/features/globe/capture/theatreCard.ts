/**
 * What a card about a War & Conflict theatre says (theatre-lens.md, TL3): the
 * theatre's name as its headline; how many of its items stand, by what backs
 * them; the most serious by title; its war on Wikipedia's list and that war's
 * tier; and where it comes from.
 *
 * Drawn as a featured block, as an area's card is (areaCard.ts), the frame's
 * middle where an item's glyph would be. Its id is the theatre's slug after
 * `theatre:`, never an address listReports gives.
 */
import type { RegionOutline } from '../../../services/raverWatch/usStates';
import { cut } from './areaCard';
import { frameForParts, partsOf, ringArea } from './areaFrame';
import { frameForReports, type FeaturedReport, type FitView, type ShareReportInfo } from './shareReports';

/** What backs an item, most serious first, as a count names it. */
const BACKED: ReadonlyArray<[string, string, string]> = [
  ['critical', 'critical warning', 'critical warnings'],
  ['deadly', 'with deaths reported', 'with deaths reported'],
  ['report', 'report', 'reports'],
];
const rank = (report: ShareReportInfo) => {
  const at = BACKED.findIndex(([variant]) => variant === report.variant);
  return at < 0 ? BACKED.length : at;
};
const newest = (report: ShareReportInfo) => (report.time ? Date.parse(report.time.iso) : -Infinity);

export function theatreCardFacts({ slug, name, reports, war, position }: {
  slug: string;
  name: string;
  /** The theatre's War & Conflict items standing now, as listReports lists them. */
  reports: readonly ShareReportInfo[];
  /** The worst war on Wikipedia's list that names the theatre, or null. */
  war: { name: string; tierLabel: string } | null;
  /** Where the card points: the frame's middle. */
  position: { lat: number; lng: number };
}): FeaturedReport {
  const items = [...reports].sort((a, b) => rank(a) - rank(b) || newest(b) - newest(a) || (a.id < b.id ? -1 : 1));
  const lines: string[] = [];
  if (!items.length) {
    lines.push('No items standing in it now');
  } else {
    const counts = BACKED.flatMap(([variant, one, many]) => {
      const n = items.filter((report) => report.variant === variant).length;
      return n ? [`${n} ${n === 1 ? one : many}`] : [];
    });
    lines.push(`${items.length} item${items.length === 1 ? '' : 's'} standing in it: ${counts.join(', ')}`);
    lines.push(`Most serious: ${cut(items[0].title)}`);
  }
  lines.push(war ? `War: ${war.name} (${war.tierLabel.toLowerCase()} on Wikipedia's list)` : 'War: none on Wikipedia\'s list names it');
  lines.push('From War & Conflict\'s reports on The Record');
  return { id: `theatre:${slug}`, title: name, position: { ...position }, lines };
}

/** A theatre's frame goes no further out than its smallest country needs, or the floor (TL14). */
const THEATRE_ZOOM_OUT = 1;

/**
 * Where a card about a theatre looks (TL3; theatre-lens.md, TL14): over its
 * countries, built round the smallest, each other country held when its largest
 * part fits from as near as the smallest needs (never nearer than the floor), and
 * then as much of the rest of it as does. Russia–Ukraine is framed on Ukraine, not
 * as a far planet with Russia across it, nor stretched to Russia's Arctic islands;
 * Taiwan and the South China Sea on Taiwan and the Philippines, not on China. A theatre whose countries none of which one card holds, or
 * that has none, is framed on its items; null when it has neither.
 */
export function frameForTheatre(
  countries: readonly RegionOutline[],
  items: readonly { lat: number; lng: number }[],
  view: FitView,
): { centre: { lat: number; lng: number }; altitude: number; position: { lat: number; lng: number } } | null {
  const byCountry = countries.map((country) => partsOf(country.geometry)).filter((parts) => parts.length > 0)
    .sort((a, b) => ringArea(a[0]) - ringArea(b[0]));
  if (byCountry.length) {
    const anchor = byCountry[0][0];
    // A country is held by its largest part: Russia's Arctic islands do not come in once its mainland is left out.
    const held = byCountry.slice(1).filter((parts) => frameForParts([anchor, parts[0]], view, THEATRE_ZOOM_OUT)?.outside.length === 0);
    const others = [...byCountry[0].slice(1), ...held.flat()].sort((a, b) => ringArea(b) - ringArea(a));
    const frame = frameForParts([anchor, ...others], view, THEATRE_ZOOM_OUT);
    if (frame) return { centre: frame.centre, altitude: frame.altitude, position: frame.position };
  }
  const framed = items.length ? frameForReports(items, view) : null;
  return framed ? { centre: { lat: framed.lat, lng: framed.lng }, altitude: framed.altitude, position: { lat: framed.lat, lng: framed.lng } } : null;
}
