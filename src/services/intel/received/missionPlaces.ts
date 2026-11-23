/**
 * Missions on the globe, by place (decision D-MF, step 5; MF16–MF17).
 *
 * The missions the Missions app shows open (public, no grant notice), each drawn by the place it names, as
 * Hero Watch draws its field missions (HW6): its US state, a US territory's own outline (Guam is drawn as
 * Guam), or its country. A mission naming areas inside its state (a heat forecast's zones) is drawn as its
 * state. One naming no place, or one whose outline is not drawn here, is listed "anywhere" instead (MF16),
 * never placed where it does not say.
 */
import type { AcceptedPackage } from '../MissionPackageIngest';
import { isGrantNotice, missionCardOf, sortMissionCards, type MissionCard } from './missionCard';
import { missionPlaceCode } from '../../heroWatch/heroWatchMissions';
import { missionNamesPeopleProblem, missionWords } from '../missionNamesPeople';

/** A place with open missions, as the globe outlines it. */
export interface MissionsAtPlace {
  /** A US state's code (`us-nm`), or a country's or US territory's two letters, upper case. */
  code: string;
  name: string;
  /** Its open missions, in the Missions app's order: closing soonest first. */
  cards: MissionCard[];
}

/** The code a mission's place is drawn by, or null when it names none. */
export function placeCodeOf(card: Pick<MissionCard, 'place'>): string | null {
  const { state, country } = card.place ?? {};
  if (state) return missionPlaceCode(`us-${state.toLowerCase()}`);
  if (country) return missionPlaceCode(country.toLowerCase());
  return null;
}

/**
 * The missions shown open: marked Public (MF6), not a grant notice (MF5), not carrying the words of a note that
 * names a person (D-NP, NP5: read again here, for a tagged note that arrived after its mission), not closed; in the
 * app's order.
 */
export function openMissionCards(accepted: readonly AcceptedPackage[], now: number): MissionCard[] {
  const shown = accepted.filter((p) => p.check.manifest?.visibility === 'public' && !isGrantNotice(p)
    && !missionNamesPeopleProblem(missionWords(p.check.manifest)));
  return sortMissionCards(shown.map(missionCardOf), now).filter((card) => card.open);
}

/** The places with open missions, by name, and the open missions drawn nowhere: "anywhere". */
export function missionsByPlace(
  cards: readonly MissionCard[],
  outlineOf: (code: string) => { name: string } | null,
): { places: MissionsAtPlace[]; anywhere: MissionCard[] } {
  const byCode = new Map<string, MissionsAtPlace>();
  const anywhere: MissionCard[] = [];
  for (const card of cards) {
    const code = placeCodeOf(card);
    const outline = code ? outlineOf(code) : null;
    if (!code || !outline) { anywhere.push(card); continue; }
    const place = byCode.get(code) ?? { code, name: outline.name, cards: [] };
    place.cards.push(card);
    byCode.set(code, place);
  }
  return { places: [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name)), anywhere };
}

/** What a place's pill says: the place, and its open missions. */
export function missionsPillText(place: MissionsAtPlace): string {
  const n = place.cards.length;
  return `${place.name} · ${n} mission${n === 1 ? '' : 's'}`;
}

/** How many a hover names, each with its limits, before it counts the rest (as Hero Watch's). */
const NAMED = 3;

/** What a place's hover says, a line each: its open missions, the first three named, each with its limits. */
export function describeMissionsAt(place: MissionsAtPlace): string {
  const n = place.cards.length;
  const named = place.cards.slice(0, NAMED);
  return [
    `${place.name}: ${n} open mission${n === 1 ? '' : 's'}.`,
    ...named.flatMap((card) => [`• ${card.headline}`, ...(card.limits ? [`  Its limits: ${card.limits}`] : [])]),
    ...(n > NAMED ? [`and ${n - NAMED} more.`] : []),
  ].join('\n');
}
