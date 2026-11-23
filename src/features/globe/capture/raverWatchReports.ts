/**
 * Raver Watch items, as the share handle lists and features them (globe
 * record, section 19, Phase 1 step 4; contract v8).
 *
 * Mecha Jono asked for Raver Watch items in `listReports()`, each with its
 * layer, its `30023:<pubkey>:<d>` id and its level as `variant`, so that
 * `frameReports`, `focusReport` and `planReportTour` work on them as they do on
 * a report. The same rules hold as for a report (shareReports.ts): a position
 * is never handed out finer than 0.1°, and nothing is framed below one globe
 * radius, which the framing itself keeps.
 *
 * An item about a country or a state has no point. It stands at the middle of
 * the region's largest part (a peninsula, not an island off it), and its
 * uncertainty is how far the region reaches from there: the alert applies
 * anywhere in it, and saying "precision not stated" would hide that.
 *
 * From v1.2 a scene event at a public venue is drawn at the venue (RW12), but
 * it is handed out as every item is, at 0.1°: the card names the venue and its
 * address in words, so no link need carry its point.
 */
import type { RaverWatchItem } from '../../../services/raverWatch/raverWatch';
import type { RegionOutline } from '../../../services/raverWatch/usStates';
import { allDayText, genreName, heatRiskName, levelOf, lineupText, VENUE_CREDIT } from '../../../services/raverWatch/raverWatchView';
import { regionPlace } from './regionPlace';
import { formatUtcDate, formatUtcDateTime } from '../../../utils/utcTime';
import { RAVER_WATCH_LEVEL_LOOK } from '../../../components/Globe/raverWatchSprites';
import { describeAuthor, type FeaturedReport, type ShareReportInfo } from './shareReports';
import { capturable } from '../../../services/intel/namesPeople';

/** 0.1° of latitude: how finely a Raver Watch point is ever placed (RW3). */
const TENTH_OF_A_DEGREE_M = 11_100;

const SINGULAR: Record<string, string> = {
  DrugCheckAlerts: 'Drug-check alert', SceneIncidents: 'Scene incident', SceneEvents: 'Scene event', HeatRisk: 'Heat risk',
};
const toTenth = (degrees: number) => Math.round(degrees * 10) / 10;

/** Where an item stands, and how far from there it may apply, or null when it names no place here. */
function placeOf(
  item: RaverWatchItem,
  regionOf: (code: string) => RegionOutline | null,
): { lat: number; lng: number; precisionM: number } | null {
  if (item.point) return { lat: toTenth(item.point.lat), lng: toTenth(item.point.lon), precisionM: TENTH_OF_A_DEGREE_M };
  const region = item.jurisdiction ? regionOf(item.jurisdiction) : null;
  return region ? regionPlace(region) : null;
}

/** Every Raver Watch item drawn that has a place, as an agent may see it. */
export function raverWatchShareReports(
  items: readonly RaverWatchItem[],
  regionOf: (code: string) => RegionOutline | null,
): ShareReportInfo[] {
  // Shown on the layer like any other (NP3), but never a note that names a person on a card or clip (D-NP, NP2).
  const placed = capturable(items).flatMap((item) => {
    const place = placeOf(item, regionOf);
    return place ? [{ item, place }] : [];
  });
  return placed.map(({ item, place }) => {
    const level = levelOf(item);
    return {
      id: item.id,
      layer: item.layer as ShareReportInfo['layer'],
      title: item.title,
      variant: level,
      variantMeans: RAVER_WATCH_LEVEL_LOOK[level].means,
      author: describeAuthor(item.pubkey),
      // A scene event applies on its own night, not when it was listed.
      time: { iso: new Date((item.start ?? item.validFrom) * 1000).toISOString(), basis: 'applies' as const },
      precisionM: place.precisionM,
      lat: place.lat,
      lng: place.lng,
      sharesPlaceWith: placed.filter((other) => other.item !== item && other.place.lat === place.lat && other.place.lng === place.lng).length,
    };
  });
}

/** What a card says about a Raver Watch item it features, or null when the item has no place. */
export function featuredRaverWatchFor(
  item: RaverWatchItem,
  regionOf: (code: string) => RegionOutline | null,
): FeaturedReport | null {
  if (item.namesPeople) return null;
  const place = placeOf(item, regionOf);
  if (!place) return null;
  const level = levelOf(item);
  const date = (s: number) => formatUtcDate(s * 1000, { year: true });
  // HeatRisk applies for a day, until 06:00 local: to the hour.
  const dateTime = (s: number) => formatUtcDateTime(s * 1000, { year: true });
  const region = !item.point && item.jurisdiction ? regionOf(item.jurisdiction) : null;
  return {
    id: item.id,
    title: item.title,
    position: { lat: place.lat, lng: place.lng },
    lines: [
      item.layer === 'SceneEvents'
        ? `${item.cancelled ? 'Cancelled · ' : ''}Scene event · listed by ${item.source}`
        : `${SINGULAR[item.layer] ?? item.layer} · ${level === 'info' ? 'information' : `level ${level}`} · from ${item.source}`,
      item.start !== undefined && item.end !== undefined
        // An event with no start time is its day in its own zone, all day (Interchange 3.25).
        ? `${item.allDay ? allDayText({ start: item.start, end: item.end }, item.startTzid) : `${formatUtcDateTime(item.start * 1000)} until ${formatUtcDateTime(item.end * 1000)}`}`
          + `${item.genres?.length ? ` · ${item.genres.map(genreName).join(', ')}` : ''}`
        : item.layer === 'HeatRisk'
          ? `${item.heatRisk !== undefined ? `NWS HeatRisk ${heatRiskName(item.heatRisk)} (${item.heatRisk} of 4) · applies` : 'Applies'} from ${dateTime(item.validFrom)} until ${dateTime(item.validUntil)}`
          : `Applies from ${date(item.validFrom)} until ${date(item.validUntil)}`,
      // Who is playing, as the event's tags name them, and nothing else (RN13).
      ...(item.lineup?.length ? [lineupText(item.lineup)] : []),
      region ? `Applies to ${region.name}`
        : item.precision === 'state' ? `Stands for a whole state or province, marked at its main city near ${place.lat.toFixed(1)}°, ${place.lng.toFixed(1)}°`
          : item.precision === 'venue' ? `At ${item.location ?? item.venue} · ${VENUE_CREDIT.replace(/\.$/, '')}`
            : `${item.location ? `${item.location}, near` : 'Near'} ${place.lat.toFixed(1)}°, ${place.lng.toFixed(1)}° · placed to within about 11 km`,
      'A signed Nostr event from The Record; its signature was checked on intake',
    ],
  };
}
