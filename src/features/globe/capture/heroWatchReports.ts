/**
 * Hero Watch's items, as the share handle lists and features them (decision D-HW, step 7; HW10–HW12),
 * as Raver Watch's and War & Conflict's are (raverWatchReports.ts, warConflictReports.ts).
 *
 * Three kinds are listed, each by its own address, only while drawn:
 *
 *   a lifeboat station, at its point to a tenth of a degree, as every listed item is;
 *   a relief note (an IFRC GO operation, or OCHA's count of organisations), at its country's middle,
 *     how far the country reaches as its uncertainty, since the note is for the whole country;
 *   an open field mission (a `30079:` package), at its place's middle, the same way, listed on the
 *     layer drawing it: Hero Watch's Field missions, or Raver Watch's Raver missions (HW8).
 *
 * A card about one says what it is, where it applies and when, and for a field mission its safety
 * limits in full (HW12), third, before the signature line, so a card's alt text, which drops lines from
 * the end, keeps them. The signature line says what was checked: the event's, on intake.
 */
import type { FieldMission, LifeboatStation, ReliefOperation, ReliefPresence } from '../../../services/heroWatch/heroWatch';
import type { MissionPlace } from '../../../services/heroWatch/heroWatchMissions';
import { lastDayOf, type ReliefCountry } from '../../../services/heroWatch/heroWatchRelief';
import { US_STATE_CODE, type RegionOutline } from '../../../services/raverWatch/usStates';
import { formatUtcDate } from '../../../utils/utcTime';
import { regionPlace } from './regionPlace';
import { describeAuthor, type FeaturedReport, type ShareReportInfo } from './shareReports';
import { stationTypeInWords } from '../../../components/Globe/heroWatchSprites';

/** 0.1° of latitude: how finely a listed point is ever placed. */
const TENTH_OF_A_DEGREE_M = 11_100;
const toTenth = (degrees: number) => Math.round(degrees * 10) / 10;

export type HeroWatchVariant = 'station' | 'station-uncounted' | 'operation' | 'presence' | 'mission';

export const HERO_WATCH_VARIANT_MEANS: Record<HeroWatchVariant, string> = {
  station: 'an RNLI lifeboat station, sized by its launches in 2025',
  'station-uncounted': 'an RNLI lifeboat station whose launches the RNLI does not count',
  operation: 'a Red Cross and Red Crescent operation, from IFRC GO',
  presence: 'the organisations at work in a country, by OCHA\'s count',
  mission: 'an open field mission, with its safety limits',
};

/** What Hero Watch draws, as its hook holds it. */
export interface HeroWatchListing {
  stations: readonly LifeboatStation[];
  relief: readonly ReliefCountry[];
  missions: readonly MissionPlace[];
  /** The layer drawing the missions: Hero Watch's, or Raver Watch's harm-reduction ones. */
  missionsLayer: 'FieldMissions' | 'RaverMissions';
  /** A place's outline by code: a US state's (`us-nm`) or a country's (`ET`). */
  regionOf: (code: string) => RegionOutline | null;
}

const SIGNED = 'A signed Nostr event from The Record; its signature was checked on intake';
const US_TERRITORY_CODES: ReadonlySet<string> = new Set(['GU', 'PR', 'VI', 'AS', 'MP']);

/** A place in words, as a note that applies to the whole of it says. */
const wholeOf = (code: string, name: string) =>
  `${name}, the whole ${US_STATE_CODE.test(code) ? 'state' : US_TERRITORY_CODES.has(code) ? 'territory' : 'country'}`;

const isoOf = (seconds: number) => new Date(seconds * 1000).toISOString();
const dateOf = (endS: number) => formatUtcDate(lastDayOf(endS), { year: true });

type Listed = { report: Omit<ShareReportInfo, 'sharesPlaceWith'>; place: { lat: number; lng: number } };

function listed(listing: HeroWatchListing): Listed[] {
  const out: Listed[] = [];
  const author = (pubkey: string) => describeAuthor(pubkey);
  // A note naming a person is never on a card or in a clip (D-NP, NP2), here as in every layer.
  for (const station of listing.stations) {
    if (!station.point || station.namesPeople) continue;
    const place = { lat: toTenth(station.point.lat), lng: toTenth(station.point.lon) };
    const variant: HeroWatchVariant = station.launches === undefined ? 'station-uncounted' : 'station';
    out.push({
      place,
      report: {
        id: station.id, layer: 'Lifeboats', title: station.title, variant, variantMeans: HERO_WATCH_VARIANT_MEANS[variant],
        author: author(station.pubkey), time: { iso: isoOf(station.createdAt), basis: 'written' }, precisionM: TENTH_OF_A_DEGREE_M, ...place,
      },
    });
  }
  for (const country of listing.relief) {
    const region = listing.regionOf(country.code);
    const middle = region ? regionPlace(region) : null;
    if (!middle) continue;
    const notes: Array<[ReliefOperation | ReliefPresence, HeroWatchVariant]> = [
      ...country.operations.map((op): [ReliefOperation, HeroWatchVariant] => [op, 'operation']),
      ...(country.presence ? [[country.presence, 'presence'] as [ReliefPresence, HeroWatchVariant]] : []),
    ];
    for (const [note, variant] of notes) {
      if (note.namesPeople) continue;
      const from = note.kind === 'operation' ? note.start ?? note.validFrom : note.validFrom;
      out.push({
        place: { lat: middle.lat, lng: middle.lng },
        report: {
          id: note.id, layer: 'Relief', title: note.title, variant, variantMeans: HERO_WATCH_VARIANT_MEANS[variant],
          author: author(note.pubkey), time: { iso: isoOf(from), basis: 'applies' }, precisionM: middle.precisionM, lat: middle.lat, lng: middle.lng,
        },
      });
    }
  }
  for (const place of listing.missions) {
    const region = listing.regionOf(place.code);
    const middle = region ? regionPlace(region) : null;
    if (!middle) continue;
    for (const mission of place.missions) {
      if (mission.namesPeople) continue;
      out.push({
        place: { lat: middle.lat, lng: middle.lng },
        report: {
          id: mission.id, layer: listing.missionsLayer, title: mission.title, variant: 'mission', variantMeans: HERO_WATCH_VARIANT_MEANS.mission,
          author: author(mission.pubkey), time: { iso: isoOf(mission.validFrom), basis: 'applies' }, precisionM: middle.precisionM, lat: middle.lat, lng: middle.lng,
        },
      });
    }
  }
  return out;
}

/** Every drawn Hero Watch item, as listReports gives it. */
export function heroWatchShareReports(listing: HeroWatchListing): ShareReportInfo[] {
  const all = listed(listing);
  return all.map(({ report, place }) => ({
    ...report,
    sharesPlaceWith: all.filter((other) => other.report.id !== report.id && other.place.lat === place.lat && other.place.lng === place.lng).length,
  }));
}

function stationCard(station: LifeboatStation, position: { lat: number; lng: number }): FeaturedReport {
  const kind = stationTypeInWords(station.stationType);
  return {
    id: station.id,
    title: station.title.split(':')[0].trim(),
    position,
    lines: [
      `Lifeboats${kind ? ` · ${kind}` : ''} · RNLI open data`,
      station.launches === undefined
        ? 'Its launches are not counted in the RNLI\'s records'
        : `${station.launches} launch${station.launches === 1 ? '' : 'es'} in ${station.year}, the RNLI's count: last year's launches, not rescues happening now`,
      `At the station, near ${position.lat.toFixed(1)}°, ${position.lng.toFixed(1)}° · placed to within about 11 km`,
      SIGNED,
    ],
  };
}

function reliefCard(note: ReliefOperation | ReliefPresence, country: ReliefCountry, position: { lat: number; lng: number }): FeaturedReport {
  const ops = country.operations.length;
  const counts = [
    ops ? `${ops} operation${ops === 1 ? '' : 's'}` : null,
    country.presence ? `${country.presence.organisations} organisation${country.presence.organisations === 1 ? '' : 's'} at work` : null,
  ].filter(Boolean).join(', ');
  const said = note.kind === 'operation'
    ? [
      [
        note.appealType,
        note.amountChf !== undefined ? `of CHF ${new Intl.NumberFormat('en-US').format(note.amountChf)}` : null,
        note.peopleToReach !== undefined ? `to reach ${new Intl.NumberFormat('en-US').format(note.peopleToReach)} people` : null,
      ].filter(Boolean).join(' ') + (note.end !== undefined ? `, until ${dateOf(note.end)}` : ''),
      `from ${note.source ?? 'IFRC GO'}, used non-commercially`,
    ].filter(Boolean).join(' · ')
    : `${note.organisations} organisations at work by OCHA's count`
      + `${note.periodStart && note.periodEnd ? `, ${periodOf(note.periodStart, note.periodEnd)}` : ''}`
      + `${note.nationalNgos !== undefined ? `, ${note.nationalNgos} of them national NGOs` : ''}; counted, never named`
      + ` · from ${note.source ?? 'OCHA'}`;
  return {
    id: note.id,
    title: note.title,
    position,
    lines: [`Relief · ${wholeOf(country.code, country.name)} · ${counts}`, said, SIGNED],
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function periodOf(start: string, end: string): string {
  const [y1, m1] = start.split('-').map(Number);
  const [y2, m2] = end.split('-').map(Number);
  return y1 === y2 ? `${MONTHS[m1 - 1]} to ${MONTHS[m2 - 1]} ${y2}` : `${MONTHS[m1 - 1]} ${y1} to ${MONTHS[m2 - 1]} ${y2}`;
}

function missionCard(mission: FieldMission, place: MissionPlace, position: { lat: number; lng: number }): FeaturedReport {
  const asks = mission.objectives.length;
  const minutes = mission.objectives.reduce((sum, objective) => sum + objective.effortMinutes, 0);
  return {
    id: mission.id,
    title: mission.title,
    position,
    lines: [
      'Field mission · open · posted by an AI agent',
      `${wholeOf(place.code, place.name)} · open to ${dateOf(mission.validUntil)} · ${asks} ask${asks === 1 ? '' : 's'}, ${minutes} minutes in all`,
      // In full, never cut (HW12), and before the signature line, which a long alt text drops first.
      `Safety limits: ${mission.limits}`,
      SIGNED,
    ],
  };
}

/** The card about a drawn Hero Watch item, or null when the address is not one drawn here. */
export function featuredHeroWatchFor(id: string, listing: HeroWatchListing): FeaturedReport | null {
  const where = listed(listing).find((entry) => entry.report.id === id);
  if (!where) return null;
  const position = where.place;
  const station = listing.stations.find((s) => s.id === id);
  if (station) return stationCard(station, position);
  for (const country of listing.relief) {
    const note = [...country.operations, ...(country.presence ? [country.presence] : [])].find((n) => n.id === id);
    if (note) return reliefCard(note, country, position);
  }
  for (const place of listing.missions) {
    const mission = place.missions.find((m) => m.id === id);
    if (mission) return missionCard(mission, place, position);
  }
  return null;
}
