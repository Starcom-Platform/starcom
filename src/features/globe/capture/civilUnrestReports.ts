/**
 * Civil Unrest's notes, as the share handle lists and features them (decision D-CU; contract v60).
 *
 * Each is listed with its layer (CivilUnrest or ProtestSurges), its `30023:<pubkey>:<d>` id and its kind as
 * `variant`, so frameReports, focusReport and planReportTour work on it as on a report. A position is never handed
 * out finer than 0.1°; a note naming only a country stands at the middle of the country's largest part, as its mark
 * does, with how far the country reaches as its uncertainty. A day of unrest is timed by its day (`event`); a surge
 * by when it was written.
 */
import type { CivilUnrestDrawn } from '../../../components/Globe/Hooks/useGlobeCivilUnrest';
import { featuredLines } from '../../../services/civilUnrest/civilUnrestView';
import { describeAuthor, type FeaturedReport, type ShareReportInfo } from './shareReports';

const toTenth = (degrees: number) => Math.round(degrees * 10) / 10;

/** What a Civil Unrest note's variant means, in a card's words. */
export const CIVIL_UNREST_VARIANT_MEANS = {
  unrest: 'a day of protest or unrest, each crowd count beside its claimant',
  surge: 'a surge in reporting, not in protest',
} as const;
export type CivilUnrestVariant = keyof typeof CIVIL_UNREST_VARIANT_MEANS;

/** Every Civil Unrest note drawn, as an agent may see it: never one that names a person (D-NP, NP2). */
export function civilUnrestShareReports(drawn: readonly CivilUnrestDrawn[]): ShareReportInfo[] {
  const listed = drawn.filter(({ item }) => !item.namesPeople);
  return listed.map(({ item, lat, lng, precisionM }) => ({
    id: item.id,
    layer: item.section,
    title: item.title,
    variant: item.section === 'ProtestSurges' ? 'surge' : 'unrest',
    variantMeans: CIVIL_UNREST_VARIANT_MEANS[item.section === 'ProtestSurges' ? 'surge' : 'unrest'],
    author: describeAuthor(item.pubkey),
    time: item.day
      ? { iso: `${item.day}T00:00:00.000Z`, basis: 'event' as const }
      : { iso: new Date(item.publishedAt * 1000).toISOString(), basis: 'written' as const },
    precisionM,
    lat: toTenth(lat),
    lng: toTenth(lng),
    sharesPlaceWith: listed.filter((other) => other.item !== item && toTenth(other.lat) === toTenth(lat) && toTenth(other.lng) === toTenth(lng)).length,
  }));
}

/** What a card says about a Civil Unrest note it features, or null when it names a person. */
export function featuredCivilUnrestFor(drawn: CivilUnrestDrawn): FeaturedReport | null {
  const { item, lat, lng, placeName } = drawn;
  // A note naming a person is never on a card or in a clip (D-NP, NP2).
  if (item.namesPeople) return null;
  const where = item.point
    ? `${placeName} · near ${toTenth(lat).toFixed(1)}°, ${toTenth(lng).toFixed(1)}°`
    : `About ${placeName} as a whole: the note names no city in it`;
  return { id: item.id, title: item.title, position: { lat: toTenth(lat), lng: toTenth(lng) }, lines: featuredLines(item, where) };
}
