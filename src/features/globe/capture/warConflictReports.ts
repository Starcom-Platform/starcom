/**
 * War & Conflict items, as the share handle lists and features them (contract
 * v10; decisions WC1-WC4).
 *
 * Each is listed with its layer, its `30023:<pubkey>:<d>` id and its backing
 * as `variant`, so frameReports, focusReport and planReportTour work on it as
 * on a report. The same rules hold as for a report: a position is never handed
 * out finer than 0.1°, and nothing is framed below one globe radius. An item
 * that names only a country stands at the middle of the country's largest
 * part, as its mark does (WC4), with how far the country reaches as its
 * uncertainty.
 */
import type { ConflictItem } from '../../../services/warConflict/warConflict';
import type { RegionOutline } from '../../../services/raverWatch/usStates';
import { backingOf, sourceName } from '../../../services/warConflict/warConflictView';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { WAR_CONFLICT_BACKING_LOOK } from '../../../components/Globe/warConflictSprites';
import { describeAuthor, type FeaturedReport, type ShareReportInfo } from './shareReports';
import { regionPlace } from './regionPlace';
import { capturable } from '../../../services/intel/namesPeople';

/** 0.1° of latitude: how finely a point is ever placed. */
const TENTH_OF_A_DEGREE_M = 11_100;
const toTenth = (degrees: number) => Math.round(degrees * 10) / 10;

const PRECISION_WORDS: Record<string, string> = {
  state: 'a province, marked at its centre near',
  city: 'near',
};

/** Where an item stands, and how far from there it may apply, or null when it names no place here. */
function placeOf(
  item: ConflictItem,
  regionOf: (code: string) => RegionOutline | null,
): { lat: number; lng: number; precisionM: number } | null {
  if (item.point) return { lat: toTenth(item.point.lat), lng: toTenth(item.point.lon), precisionM: TENTH_OF_A_DEGREE_M };
  const region = item.jurisdiction ? regionOf(item.jurisdiction) : null;
  return region ? regionPlace(region) : null;
}

/** Every War & Conflict item drawn that has a place, as an agent may see it. */
export function warConflictShareReports(
  items: readonly ConflictItem[],
  regionOf: (code: string) => RegionOutline | null,
): ShareReportInfo[] {
  // Never a note that names a person (D-NP, NP2).
  const placed = capturable(items).flatMap((item) => {
    const place = placeOf(item, regionOf);
    return place ? [{ item, place }] : [];
  });
  return placed.map(({ item, place }) => {
    const backing = backingOf(item);
    return {
      id: item.id,
      layer: 'WarConflict' as const,
      title: item.title,
      variant: backing,
      variantMeans: WAR_CONFLICT_BACKING_LOOK[backing].means,
      author: describeAuthor(item.pubkey),
      time: { iso: new Date(item.reportedAt * 1000).toISOString(), basis: 'written' as const },
      precisionM: place.precisionM,
      lat: place.lat,
      lng: place.lng,
      sharesPlaceWith: placed.filter((other) => other.item !== item && other.place.lat === place.lat && other.place.lng === place.lng).length,
      // What it says it is, which decides its card's badge (IM14).
      ...(item.role ? { role: item.role } : {}),
    };
  });
}

const claim = (c: ConflictItem['casualties'][number]) =>
  (c.count === null ? `"${c.words || c.kind}"` : `${c.qualifier ? `${c.qualifier} ` : ''}${c.count} ${c.kind}`);

/** What a card says about a War & Conflict item it features, or null when the item has no place. */
export function featuredWarConflictFor(
  item: ConflictItem,
  regionOf: (code: string) => RegionOutline | null,
  regionName: (code: string) => string | null,
): FeaturedReport | null {
  // A note naming a person is never on a card or in a clip (D-NP, NP2).
  if (item.namesPeople) return null;
  const place = placeOf(item, regionOf);
  if (!place) return null;
  const what = item.events.map((e) => e.label).join(', ') || 'A report';
  const country = item.jurisdiction ? regionName(item.jurisdiction) ?? item.jurisdiction.toUpperCase() : null;
  const reported = `Reported ${formatUtcDateTime(item.reportedAt * 1000, { year: true })}`;
  const from = `${item.source ? ` from ${sourceName(item.source)}` : ''}${item.license ? ` (${item.license})` : ''}`;
  return {
    id: item.id,
    title: item.title,
    position: { lat: place.lat, lng: place.lng },
    lines: [
      `War & Conflict · ${what} · ${item.theatre?.name ?? 'no named war'}`,
      item.casualties.length
        ? `Casualties as reported: ${item.casualties.map(claim).join('; ')}${item.casualties.length > 1 ? ' (separate claims, not added)' : ''}`
        : `${reported}${from}`,
      item.point
        ? `${[item.place?.words, country].filter(Boolean).join(', ') || 'Placed'} · ${PRECISION_WORDS[item.precision ?? 'city'] ?? 'near'} ${place.lat.toFixed(1)}°, ${place.lng.toFixed(1)}°`
        : `About ${country} as a whole: the line names no place in it`,
      item.casualties.length ? `${reported}${from}` : 'A signed Nostr event from The Record; its signature was checked on intake',
    ],
  };
}
